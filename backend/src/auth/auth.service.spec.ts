import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Device } from './entities/device.entity';
import { LoginEvent, LoginEventType } from './entities/login-event.entity';
import { RedisAuthService } from './redis-auth.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UnauthorizedException, HttpException, NotFoundException } from '@nestjs/common';

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

  describe('refresh()', () => {
    it('returns new accessJwt when session exists', async () => {
      mockRedis.getSession.mockResolvedValueOnce({ deviceId: 'dev-1', issuedAt: '', expiresAt: null });
      const result = await service.refresh('valid-token');
      expect(result).toEqual({ accessJwt: 'signed-jwt' });
    });

    it('throws 401 when session not found', async () => {
      mockRedis.getSession.mockResolvedValueOnce(null);
      await expect(service.refresh('bad-token')).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('logout()', () => {
    it('deletes session and logs LOGOUT event', async () => {
      mockRedis.deleteSession.mockResolvedValueOnce(undefined);
      await service.logout('tok', '1.2.3.4', 'ua');
      expect(mockRedis.deleteSession).toHaveBeenCalledWith('tok');
      expect(mockEventRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: LoginEventType.LOGOUT }),
      );
    });
  });

  describe('logoutAll()', () => {
    it('deletes all sessions and logs REVOKED', async () => {
      mockRedis.deleteAllSessions.mockResolvedValueOnce(2);
      await service.logoutAll('1.2.3.4', 'ua');
      expect(mockRedis.deleteAllSessions).toHaveBeenCalled();
      expect(mockEventRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: LoginEventType.REVOKED }),
      );
    });
  });

  describe('getSessions()', () => {
    it('returns devices annotated with hasActiveSession and paginated events', async () => {
      mockDeviceRepo.find.mockResolvedValueOnce([{ id: 'dev-1', token: 'tok-1' }]);
      mockRedis.getAllSessionDeviceIds.mockResolvedValueOnce(new Map([['s1', 'dev-1']]));
      mockEventRepo.findAndCount.mockResolvedValueOnce([[{ id: 'e1' }], 1]);

      const result = await service.getSessions(1, 20);
      expect(result.devices[0]).toMatchObject({ id: 'dev-1', hasActiveSession: true });
      expect(result.total).toBe(1);
    });

    it('returns devices with hasActiveSession: false when not in session map', async () => {
      mockDeviceRepo.find.mockResolvedValueOnce([{ id: 'dev-2', token: 'tok-2' }]);
      mockRedis.getAllSessionDeviceIds.mockResolvedValueOnce(new Map([['s1', 'dev-1']])); // dev-2 not in map
      mockEventRepo.findAndCount.mockResolvedValueOnce([[], 0]);

      const result = await service.getSessions(1, 20);
      expect(result.devices[0]).toMatchObject({ id: 'dev-2', hasActiveSession: false });
    });
  });

  describe('updateDevice()', () => {
    it('updates isPermanent and saves', async () => {
      const device = { id: 'dev-1', isPermanent: false };
      mockDeviceRepo.findOne.mockResolvedValueOnce(device);
      mockDeviceRepo.save.mockResolvedValueOnce({ ...device, isPermanent: true });
      const result = await service.updateDevice('dev-1', true);
      expect(result.isPermanent).toBe(true);
    });

    it('throws NotFoundException when device not found', async () => {
      mockDeviceRepo.findOne.mockResolvedValueOnce(null);
      await expect(service.updateDevice('missing', true)).rejects.toThrow(NotFoundException);
    });
  });

  describe('revokeSession()', () => {
    it('finds and deletes session for device, logs REVOKED', async () => {
      mockDeviceRepo.findOne.mockResolvedValueOnce({ id: 'dev-1' });
      mockRedis.findSessionByDeviceId.mockResolvedValueOnce('tok-abc');
      mockRedis.deleteSession.mockResolvedValueOnce(undefined);
      await service.revokeSession('dev-1', '1.2.3.4', 'ua');
      expect(mockRedis.deleteSession).toHaveBeenCalledWith('tok-abc');
      expect(mockEventRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: LoginEventType.REVOKED }),
      );
    });

    it('throws NotFoundException when device does not exist', async () => {
      mockDeviceRepo.findOne.mockResolvedValueOnce(null);
      await expect(service.revokeSession('missing', '1.2.3.4', 'ua')).rejects.toThrow(NotFoundException);
    });
  });
});
