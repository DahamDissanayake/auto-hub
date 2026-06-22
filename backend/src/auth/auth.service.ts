import {
  Injectable, UnauthorizedException, HttpException, HttpStatus, NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { timingSafeEqual } from 'crypto';
import { randomUUID, randomInt } from 'crypto';
import { UAParser } from 'ua-parser-js';
import { Device } from './entities/device.entity';
import { LoginEvent, LoginEventType } from './entities/login-event.entity';
import { RedisAuthService } from './redis-auth.service';
import { NotificationsService } from '../notifications/notifications.service';
import { LoginDto } from './dto/login.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';

export type LoginResult =
  | { step: 'otp_required'; deviceToken: string }
  | { sessionToken: string; accessJwt: string; deviceToken: string; isPermanent: boolean };

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private config: ConfigService,
    @InjectRepository(Device) private deviceRepo: Repository<Device>,
    @InjectRepository(LoginEvent) private eventRepo: Repository<LoginEvent>,
    private redis: RedisAuthService,
    private notifications: NotificationsService,
  ) {}

  async login(dto: LoginDto, ip: string, userAgent: string): Promise<LoginResult> {
    const isValid = await this.checkPassword(dto.password);
    if (!isValid) {
      await this.logEvent(LoginEventType.PASSWORD_FAIL, ip, userAgent, null);
      throw new UnauthorizedException('Invalid password');
    }
    await this.logEvent(LoginEventType.PASSWORD_OK, ip, userAgent, null);

    const { browser, os } = this.parseUa(userAgent);

    // Resolve or create device
    let device: Device | null = null;
    if (dto.deviceToken) {
      device = await this.deviceRepo.findOne({ where: { token: dto.deviceToken } }) ?? null;
    }
    if (!device) {
      const newDevice = this.deviceRepo.create({
        token: randomUUID(),
        browser,
        os,
        ip,
        userAgent,
        isPermanent: false,
      });
      device = await this.deviceRepo.save(newDevice);
    }

    // Permanent device → skip OTP, issue session
    if (device.isPermanent) {
      await this.deviceRepo.save({ ...device, lastSeen: new Date() });
      return this.issueSession(device, true, ip, userAgent);
    }

    // Check for existing lock before sending new OTP
    const existing = await this.redis.getOtp(ip);
    if (existing?.lockedUntil && new Date(existing.lockedUntil) > new Date()) {
      throw new HttpException(
        { reason: 'otp_locked', lockedUntil: existing.lockedUntil },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Send OTP
    const code = randomInt(100000, 999999).toString();
    await this.redis.setOtp(ip, { code, attempts: 0 });
    await this.notifications.send(
      `🔐 <b>AutoHub login code: ${code}</b>\nBrowser: ${browser} · ${os}\nIP: ${ip}\nExpires in 5 minutes.`,
    );
    await this.logEvent(LoginEventType.OTP_SENT, ip, userAgent, device);

    return { step: 'otp_required', deviceToken: device.token };
  }

  async verifyOtp(dto: VerifyOtpDto, ip: string, userAgent: string): Promise<{
    sessionToken: string; accessJwt: string; deviceToken: string; isPermanent: false;
  }> {
    const device = await this.deviceRepo.findOne({ where: { token: dto.deviceToken } });
    if (!device) throw new UnauthorizedException('Unknown device');

    const otpData = await this.redis.getOtp(ip);
    if (!otpData) {
      throw new UnauthorizedException('otp_expired');
    }

    if (otpData.lockedUntil && new Date(otpData.lockedUntil) > new Date()) {
      throw new HttpException(
        { reason: 'otp_locked', lockedUntil: otpData.lockedUntil },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (otpData.code !== dto.otp) {
      const attempts = otpData.attempts + 1;
      if (attempts >= 3) {
        const lockedUntil = new Date(Date.now() + 5 * 60 * 1000).toISOString();
        await this.redis.setOtp(ip, { ...otpData, attempts, lockedUntil });
        await this.logEvent(LoginEventType.OTP_LOCKED, ip, userAgent, device);
        throw new HttpException(
          { reason: 'otp_locked', lockedUntil },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      await this.redis.setOtp(ip, { ...otpData, attempts });
      await this.logEvent(LoginEventType.OTP_FAIL, ip, userAgent, device);
      throw new UnauthorizedException({ reason: 'otp_invalid', attemptsRemaining: 3 - attempts });
    }

    await this.redis.deleteOtp(ip);
    await this.logEvent(LoginEventType.OTP_OK, ip, userAgent, device);
    await this.deviceRepo.save({ ...device, lastSeen: new Date() });

    const session = await this.issueSession(device, false, ip, userAgent);
    return { ...session as any, isPermanent: false as const };
  }

  async refresh(sessionToken: string): Promise<{ accessJwt: string }> {
    const session = await this.redis.getSession(sessionToken);
    if (!session) throw new UnauthorizedException('Session expired');
    const isPermanent = session.expiresAt !== null;
    if (isPermanent) {
      const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      await this.redis.setSession(sessionToken, { ...session, expiresAt: newExpiresAt }, true);
    }
    return { accessJwt: this.jwtService.sign({ sub: 'admin' }) };
  }

  async logout(sessionToken: string, ip: string, userAgent: string): Promise<void> {
    await this.redis.deleteSession(sessionToken);
    await this.logEvent(LoginEventType.LOGOUT, ip, userAgent, null);
  }

  async logoutAll(ip: string, userAgent: string): Promise<void> {
    await this.redis.deleteAllSessions();
    await this.logEvent(LoginEventType.REVOKED, ip, userAgent, null);
  }

  async getSessions(page: number, limit: number): Promise<{
    devices: (Device & { hasActiveSession: boolean })[];
    events: LoginEvent[];
    total: number;
  }> {
    const [devices, sessionMap, [events, total]] = await Promise.all([
      this.deviceRepo.find({ order: { lastSeen: 'DESC' } }),
      this.redis.getAllSessionDeviceIds(),
      this.eventRepo.findAndCount({
        order: { createdAt: 'DESC' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    const activeDeviceIds = new Set(sessionMap.values());
    return {
      devices: devices.map(d => ({ ...d, hasActiveSession: activeDeviceIds.has(d.id) })),
      events,
      total,
    };
  }

  async updateDevice(id: string, isPermanent: boolean): Promise<Device> {
    const device = await this.deviceRepo.findOne({ where: { id } });
    if (!device) throw new NotFoundException('Device not found');
    return this.deviceRepo.save({ ...device, isPermanent });
  }

  async revokeSession(deviceId: string, ip: string, userAgent: string): Promise<void> {
    const device = await this.deviceRepo.findOne({ where: { id: deviceId } });
    if (!device) throw new NotFoundException('Device not found');
    const sessionToken = await this.redis.findSessionByDeviceId(deviceId);
    if (sessionToken) await this.redis.deleteSession(sessionToken);
    await this.logEvent(LoginEventType.REVOKED, ip, userAgent, device);
  }

  private async issueSession(device: Device, permanent: boolean, ip: string, userAgent: string): Promise<{
    sessionToken: string; accessJwt: string; deviceToken: string; isPermanent: boolean;
  }> {
    const sessionToken = randomUUID();
    const now = new Date().toISOString();
    const expiresAt = permanent ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() : null;
    await this.redis.setSession(sessionToken, { deviceId: device.id, issuedAt: now, expiresAt }, permanent);
    await this.logEvent(LoginEventType.SESSION_ISSUED, ip, userAgent, device);
    const accessJwt = this.jwtService.sign({ sub: 'admin' });
    return { sessionToken, accessJwt, deviceToken: device.token, isPermanent: permanent };
  }

  private async checkPassword(password: string): Promise<boolean> {
    const adminPassword = this.config.get<string>('ADMIN_PASSWORD') ?? '';
    if (adminPassword.startsWith('$2')) {
      return bcrypt.compare(password, adminPassword);
    }
    const a = Buffer.from(password);
    const b = Buffer.from(adminPassword);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  private parseUa(userAgent: string): { browser: string; os: string } {
    const parser = new UAParser(userAgent);
    const b = parser.getBrowser();
    const o = parser.getOS();
    return {
      browser: [b.name, b.major].filter(Boolean).join(' ') || 'Unknown',
      os: [o.name, o.version].filter(Boolean).join(' ') || 'Unknown',
    };
  }

  private async logEvent(
    eventType: LoginEventType, ip: string, userAgent: string, device: Device | null,
  ): Promise<void> {
    const { browser, os } = this.parseUa(userAgent);
    await this.eventRepo.save(
      this.eventRepo.create({ eventType, ip, browser, os, deviceId: device?.id ?? null }),
    );
  }
}
