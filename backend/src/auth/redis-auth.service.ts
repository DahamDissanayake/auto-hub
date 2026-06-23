import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

const SESSION_PREFIX = 'autohub:session:';
const OTP_PREFIX = 'autohub:otp:';
const SEVEN_DAYS_SEC = 7 * 24 * 60 * 60;
const ONE_DAY_SEC = 24 * 60 * 60;
const FIVE_MIN_SEC = 300;

export interface SessionData {
  deviceId: string;
  issuedAt: string;
  expiresAt: string | null;
}

export interface OtpData {
  code: string;
  attempts: number;
  lockedUntil?: string;
}

@Injectable()
export class RedisAuthService {
  private readonly client: Redis;

  constructor(private config: ConfigService) {
    this.client = new Redis(config.get<string>('REDIS_URL') ?? 'redis://localhost:6379');
  }

  async setSession(token: string, data: SessionData, permanent: boolean): Promise<void> {
    const key = SESSION_PREFIX + token;
    const value = JSON.stringify(data);
    const ttl = permanent ? SEVEN_DAYS_SEC : ONE_DAY_SEC;
    await this.client.set(key, value, 'EX', ttl);
  }

  async getSession(token: string): Promise<SessionData | null> {
    const val = await this.client.get(SESSION_PREFIX + token);
    return val ? (JSON.parse(val) as SessionData) : null;
  }

  async deleteSession(token: string): Promise<void> {
    await this.client.del(SESSION_PREFIX + token);
  }

  async deleteAllSessions(): Promise<number> {
    const keys = await this.client.keys(SESSION_PREFIX + '*');
    if (keys.length === 0) return 0;
    return this.client.del(...keys);
  }

  async findSessionByDeviceId(deviceId: string): Promise<string | null> {
    const keys = await this.client.keys(SESSION_PREFIX + '*');
    for (const key of keys) {
      const val = await this.client.get(key);
      if (!val) continue;
      const data = JSON.parse(val) as SessionData;
      if (data.deviceId === deviceId) return key.slice(SESSION_PREFIX.length);
    }
    return null;
  }

  async getAllSessionDeviceIds(): Promise<Map<string, string>> {
    const keys = await this.client.keys(SESSION_PREFIX + '*');
    const map = new Map<string, string>();
    for (const key of keys) {
      const val = await this.client.get(key);
      if (!val) continue;
      const data = JSON.parse(val) as SessionData;
      map.set(key.slice(SESSION_PREFIX.length), data.deviceId);
    }
    return map;
  }

  async setOtp(ip: string, data: OtpData): Promise<void> {
    await this.client.set(OTP_PREFIX + ip, JSON.stringify(data), 'EX', FIVE_MIN_SEC);
  }

  async getOtp(ip: string): Promise<OtpData | null> {
    const val = await this.client.get(OTP_PREFIX + ip);
    return val ? (JSON.parse(val) as OtpData) : null;
  }

  async deleteOtp(ip: string): Promise<void> {
    await this.client.del(OTP_PREFIX + ip);
  }
}
