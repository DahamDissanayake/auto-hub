import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RedisAuthService, SessionData, OtpData } from './redis-auth.service';

const mockRedis = {
  set: jest.fn(),
  get: jest.fn(),
  del: jest.fn(),
  keys: jest.fn(),
};

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => mockRedis);
});

describe('RedisAuthService', () => {
  let service: RedisAuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisAuthService,
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('redis://localhost:6379') } },
      ],
    }).compile();
    service = module.get<RedisAuthService>(RedisAuthService);
    jest.clearAllMocks();
  });

  it('setSession stores with 7-day TTL for permanent devices', async () => {
    const data: SessionData = { deviceId: 'dev-1', issuedAt: new Date().toISOString(), expiresAt: null };
    await service.setSession('tok-1', data, true);
    expect(mockRedis.set).toHaveBeenCalledWith(
      'autohub:session:tok-1',
      JSON.stringify(data),
      'EX',
      7 * 24 * 60 * 60,
    );
  });

  it('setSession stores without TTL for non-permanent devices', async () => {
    const data: SessionData = { deviceId: 'dev-1', issuedAt: new Date().toISOString(), expiresAt: null };
    await service.setSession('tok-2', data, false);
    expect(mockRedis.set).toHaveBeenCalledWith('autohub:session:tok-2', JSON.stringify(data));
  });

  it('getSession returns parsed data when key exists', async () => {
    const data: SessionData = { deviceId: 'dev-1', issuedAt: '2026-06-22T00:00:00Z', expiresAt: null };
    mockRedis.get.mockResolvedValueOnce(JSON.stringify(data));
    const result = await service.getSession('tok-1');
    expect(result).toEqual(data);
  });

  it('getSession returns null when key missing', async () => {
    mockRedis.get.mockResolvedValueOnce(null);
    expect(await service.getSession('missing')).toBeNull();
  });

  it('deleteAllSessions deletes all session keys and returns count', async () => {
    mockRedis.keys.mockResolvedValueOnce(['autohub:session:a', 'autohub:session:b']);
    mockRedis.del.mockResolvedValueOnce(2);
    const result = await service.deleteAllSessions();
    expect(mockRedis.del).toHaveBeenCalledWith('autohub:session:a', 'autohub:session:b');
    expect(result).toBe(2);
  });

  it('deleteAllSessions does nothing when no sessions exist', async () => {
    mockRedis.keys.mockResolvedValueOnce([]);
    await service.deleteAllSessions();
    expect(mockRedis.del).not.toHaveBeenCalled();
  });

  it('setOtp stores with 5-min TTL', async () => {
    const data: OtpData = { code: '123456', attempts: 0 };
    await service.setOtp('1.2.3.4', data);
    expect(mockRedis.set).toHaveBeenCalledWith('autohub:otp:1.2.3.4', JSON.stringify(data), 'EX', 300);
  });

  it('getOtp returns null when not found', async () => {
    mockRedis.get.mockResolvedValueOnce(null);
    expect(await service.getOtp('1.2.3.4')).toBeNull();
  });

  it('findSessionByDeviceId returns matching sessionToken', async () => {
    const data: SessionData = { deviceId: 'dev-1', issuedAt: '', expiresAt: null };
    mockRedis.keys.mockResolvedValueOnce(['autohub:session:tok-abc']);
    mockRedis.get.mockResolvedValueOnce(JSON.stringify(data));
    expect(await service.findSessionByDeviceId('dev-1')).toBe('tok-abc');
  });

  it('findSessionByDeviceId returns null when no session for device', async () => {
    const data: SessionData = { deviceId: 'dev-other', issuedAt: '', expiresAt: null };
    mockRedis.keys.mockResolvedValueOnce(['autohub:session:tok-abc']);
    mockRedis.get.mockResolvedValueOnce(JSON.stringify(data));
    expect(await service.findSessionByDeviceId('dev-1')).toBeNull();
  });

  it('getAllSessionDeviceIds returns map of sessionToken to deviceId', async () => {
    const data1 = { deviceId: 'dev-1', issuedAt: '', expiresAt: null };
    const data2 = { deviceId: 'dev-2', issuedAt: '', expiresAt: null };
    mockRedis.keys.mockResolvedValueOnce(['autohub:session:tok-a', 'autohub:session:tok-b']);
    mockRedis.get
      .mockResolvedValueOnce(JSON.stringify(data1))
      .mockResolvedValueOnce(JSON.stringify(data2));

    const result = await service.getAllSessionDeviceIds();
    expect(result).toBeInstanceOf(Map);
    expect(result.get('tok-a')).toBe('dev-1');
    expect(result.get('tok-b')).toBe('dev-2');
    expect(result.size).toBe(2);
  });

  it('getAllSessionDeviceIds returns empty map when no sessions', async () => {
    mockRedis.keys.mockResolvedValueOnce([]);
    const result = await service.getAllSessionDeviceIds();
    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(0);
  });
});
