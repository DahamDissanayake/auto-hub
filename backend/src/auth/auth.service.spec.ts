import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Device } from './entities/device.entity';
import { LoginEvent, LoginEventType } from './entities/login-event.entity';
import { RedisAuthService } from './redis-auth.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UnauthorizedException, HttpException } from '@nestjs/common';

const mockDeviceRepo = {
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  find: jest.fn(),
  update: jest.fn(),
};
const mockEventRepo = {
  save: jest.fn().mockImplementation((obj) => Promise.resolve(obj)),
  findAndCount: jest.fn(),
  create: jest.fn().mockImplementation((obj) => obj),
};
const mockRedis = {
  setSession: jest.fn(),
  getSession: jest.fn(),
  deleteSession: jest.fn(),
  deleteAllSessions: jest.fn(),
  findSessionByDeviceId: jest.fn(),
  getAllSessionDeviceIds: jest.fn(),
  setOtp: jest.fn(),
  getOtp: jest.fn(),
  deleteOtp: jest.fn(),
};
const mockJwt = { sign: jest.fn().mockReturnValue('signed-jwt') };
const mockNotifications = { send: jest.fn().mockResolvedValue(undefined) };
const mockConfig = { get: jest.fn((key: string) => key === 'ADMIN_PASSWORD' ? 'plainpassword' : 'secret') };

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: JwtService, useValue: mockJwt },
        { provide: ConfigService, useValue: mockConfig },
        { provide: getRepositoryToken(Device), useValue: mockDeviceRepo },
        { provide: getRepositoryToken(LoginEvent), useValue: mockEventRepo },
        { provide: RedisAuthService, useValue: mockRedis },
        { provide: NotificationsService, useValue: mockNotifications },
      ],
    }).compile();
    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
  });

  describe('login()', () => {
    const ip = '1.2.3.4';
    const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0.0.0';

    it('throws 401 on wrong password', async () => {
      await expect(
        service.login({ password: 'wrong' }, ip, ua),
      ).rejects.toThrow(UnauthorizedException);
      expect(mockEventRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: LoginEventType.PASSWORD_FAIL, ip }),
      );
    });

    it('returns otp_required for unknown device', async () => {
      mockDeviceRepo.create.mockReturnValueOnce({ id: 'new-dev', token: 'new-token', isPermanent: false });
      mockDeviceRepo.save.mockResolvedValueOnce({ id: 'new-dev', token: 'new-token', isPermanent: false });
      mockRedis.getOtp.mockResolvedValueOnce(null);

      const result = await service.login({ password: 'plainpassword' }, ip, ua);

      expect(result).toEqual({ step: 'otp_required', deviceToken: 'new-token' });
      expect(mockRedis.setOtp).toHaveBeenCalled();
      expect(mockNotifications.send).toHaveBeenCalled();
      expect(mockEventRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: LoginEventType.OTP_SENT }),
      );
    });

    it('returns otp_required for existing non-permanent device', async () => {
      mockDeviceRepo.findOne.mockResolvedValueOnce({ id: 'dev-1', token: 'tok-1', isPermanent: false });
      mockRedis.getOtp.mockResolvedValueOnce(null);

      const result = await service.login({ password: 'plainpassword', deviceToken: 'tok-1' }, ip, ua);

      expect(result).toEqual({ step: 'otp_required', deviceToken: 'tok-1' });
    });

    it('issues session directly for permanent device', async () => {
      mockDeviceRepo.findOne.mockResolvedValueOnce({ id: 'dev-1', token: 'tok-1', isPermanent: true, lastSeen: new Date() });
      mockDeviceRepo.save.mockResolvedValueOnce({ id: 'dev-1', token: 'tok-1', isPermanent: true });
      mockRedis.setSession.mockResolvedValueOnce(undefined);

      const result = await service.login({ password: 'plainpassword', deviceToken: 'tok-1' }, ip, ua);

      expect(result).toHaveProperty('sessionToken');
      expect(result).toHaveProperty('accessJwt', 'signed-jwt');
      expect((result as any).isPermanent).toBe(true);
      expect(mockNotifications.send).not.toHaveBeenCalled();
      expect(mockRedis.setSession).toHaveBeenCalledWith(expect.any(String), expect.any(Object), true);
    });

    it('returns 429 when OTP already sent and still locked', async () => {
      mockDeviceRepo.create.mockReturnValueOnce({ id: 'dev-new', token: 'tok-new', isPermanent: false });
      mockDeviceRepo.save.mockResolvedValueOnce({ id: 'dev-new', token: 'tok-new', isPermanent: false });
      mockRedis.getOtp.mockResolvedValueOnce({
        code: '999999',
        attempts: 3,
        lockedUntil: new Date(Date.now() + 60000).toISOString(),
      });

      await expect(service.login({ password: 'plainpassword' }, ip, ua)).rejects.toThrow(HttpException);
    });
  });

  describe('verifyOtp()', () => {
    const ip = '1.2.3.4';
    const ua = 'Mozilla/5.0 Chrome/124';

    it('throws 401 when OTP not found (expired)', async () => {
      mockDeviceRepo.findOne.mockResolvedValueOnce({ id: 'dev-1' });
      mockRedis.getOtp.mockResolvedValueOnce(null);
      await expect(service.verifyOtp({ otp: '123456', deviceToken: 'tok-1' }, ip, ua))
        .rejects.toThrow(UnauthorizedException);
    });

    it('increments attempts and throws on wrong OTP', async () => {
      mockDeviceRepo.findOne.mockResolvedValueOnce({ id: 'dev-1' });
      mockRedis.getOtp.mockResolvedValueOnce({ code: '999999', attempts: 0 });
      await expect(service.verifyOtp({ otp: '123456', deviceToken: 'tok-1' }, ip, ua))
        .rejects.toThrow(UnauthorizedException);
      expect(mockRedis.setOtp).toHaveBeenCalledWith(ip, expect.objectContaining({ attempts: 1 }));
    });

    it('locks IP after 3 wrong attempts', async () => {
      mockDeviceRepo.findOne.mockResolvedValueOnce({ id: 'dev-1' });
      mockRedis.getOtp.mockResolvedValueOnce({ code: '999999', attempts: 2 });
      await expect(service.verifyOtp({ otp: '000000', deviceToken: 'tok-1' }, ip, ua))
        .rejects.toThrow(HttpException);
      expect(mockRedis.setOtp).toHaveBeenCalledWith(ip, expect.objectContaining({ lockedUntil: expect.any(String) }));
      expect(mockEventRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: LoginEventType.OTP_LOCKED }),
      );
    });

    it('issues session on correct OTP', async () => {
      const device = { id: 'dev-1', token: 'tok-1', isPermanent: false, lastSeen: new Date() };
      mockDeviceRepo.findOne.mockResolvedValueOnce(device);
      mockDeviceRepo.save.mockResolvedValueOnce(device);
      mockRedis.getOtp.mockResolvedValueOnce({ code: '123456', attempts: 0 });
      mockRedis.deleteOtp.mockResolvedValueOnce(undefined);
      mockRedis.setSession.mockResolvedValueOnce(undefined);

      const result = await service.verifyOtp({ otp: '123456', deviceToken: 'tok-1' }, ip, ua);

      expect(result).toHaveProperty('sessionToken');
      expect(result).toHaveProperty('accessJwt', 'signed-jwt');
      expect(result.isPermanent).toBe(false);
      expect(mockRedis.deleteOtp).toHaveBeenCalledWith(ip);
      expect(mockRedis.setSession).toHaveBeenCalledWith(expect.any(String), expect.any(Object), false);
    });
  });
});
