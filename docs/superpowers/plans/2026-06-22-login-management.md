# Login Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace stateless 7-day JWTs with device-aware server-side sessions supporting Telegram OTP for unknown devices, permanent device trust, per-device revocation, and a settings page session manager.

**Architecture:** Two-token system — a server-side session token (UUID stored in Redis; permanent devices 7-day TTL, non-permanent no TTL) plus a short-lived 15-min signed accessJwt. The frontend stores the session token in localStorage (permanent) or sessionStorage (non-permanent) and holds the accessJwt in memory only. A refresh interceptor in api.ts silently renews the accessJwt. Terminal and files services are completely unchanged — they keep verifying 15-min accessJwts via JWT_SECRET.

**Tech Stack:** NestJS (TypeORM, ioredis already in deps, ua-parser-js new, @nestjs/jwt), Next.js (React, React Query, axios), PostgreSQL, Redis, Telegram (NotificationsService already wired).

## Global Constraints

- TypeORM `synchronize: false` always — all schema changes via migration files in `backend/src/migrations/`
- Terminal and files services: zero code changes
- New endpoints: all under `/api/auth/*`
- New entities in `backend/src/auth/entities/`
- Follow existing mock pattern from `plugins.service.spec.ts` for all NestJS unit tests
- ua-parser-js version ^1.0.37 (v1 constructor API)
- OTP: 6 digits, 5-min Redis TTL, max 3 attempts then 5-min lockout per IP
- Access JWT lifetime: 15 minutes (was 7 days)
- Permanent session TTL: 7 days in Redis
- Non-permanent sessions: no Redis TTL; client sends logout on tab close via `navigator.sendBeacon`
- Frontend token keys: `autohub_device` (localStorage, deviceToken UUID), `autohub_session` (localStorage permanent / sessionStorage non-permanent)

---

## File Map

**Create — backend:**
- `backend/src/auth/entities/device.entity.ts`
- `backend/src/auth/entities/login-event.entity.ts`
- `backend/src/migrations/1750600000000-AddDevicesAndLoginEvents.ts`
- `backend/src/auth/redis-auth.service.ts`
- `backend/src/auth/dto/login.dto.ts`
- `backend/src/auth/dto/verify-otp.dto.ts`
- `backend/src/auth/dto/refresh.dto.ts`
- `backend/src/auth/dto/device-update.dto.ts`
- `backend/src/auth/auth.service.spec.ts`

**Modify — backend:**
- `backend/src/auth/auth.service.ts` — full rewrite
- `backend/src/auth/auth.controller.ts` — add 7 new endpoints, update login
- `backend/src/auth/auth.module.ts` — add TypeORM repos, RedisAuthService, NotificationsModule
- `backend/src/app.module.ts` — add Device + LoginEvent entities + migrations config
- `backend/package.json` — add ua-parser-js + @types/ua-parser-js

**Create — frontend:**
- `frontend/src/lib/hooks/useAuthSessions.ts`

**Modify — frontend:**
- `frontend/src/lib/api.ts` — full rewrite (memory JWT, refresh interceptor, exports)
- `frontend/src/lib/filesApi.ts` — update getToken() + 401 handler + upload XHR
- `frontend/src/components/layout/AppShell.tsx` — async auth check on mount + loading state
- `frontend/src/components/layout/Sidebar.tsx` — call POST /auth/logout on logout
- `frontend/src/components/layout/MobileNav.tsx` — call POST /auth/logout on logout
- `frontend/src/app/(auth)/login/page.tsx` — two-step flow (password → OTP)
- `frontend/src/app/(app)/settings/page.tsx` — add Sessions & Devices section

---

## Task 1: DB Entities + Migration

**Files:**
- Create: `backend/src/auth/entities/device.entity.ts`
- Create: `backend/src/auth/entities/login-event.entity.ts`
- Create: `backend/src/migrations/1750600000000-AddDevicesAndLoginEvents.ts`
- Modify: `backend/src/app.module.ts`

**Interfaces:**
- Produces: `Device` entity (id, token, name, userAgent, browser, os, ip, isPermanent, firstSeen, lastSeen), `LoginEvent` entity (id, deviceId, device, ip, browser, os, eventType, createdAt), `LoginEventType` enum — used by Tasks 3, 4, 5, 8

- [ ] **Step 1: Create device entity**

`backend/src/auth/entities/device.entity.ts`:
```typescript
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('devices')
export class Device {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  token: string;

  @Column({ nullable: true })
  name: string;

  @Column({ nullable: true })
  userAgent: string;

  @Column({ nullable: true })
  browser: string;

  @Column({ nullable: true })
  os: string;

  @Column({ nullable: true })
  ip: string;

  @Column({ default: false })
  isPermanent: boolean;

  @CreateDateColumn()
  firstSeen: Date;

  @UpdateDateColumn()
  lastSeen: Date;
}
```

- [ ] **Step 2: Create LoginEventType enum and LoginEvent entity**

`backend/src/auth/entities/login-event.entity.ts`:
```typescript
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Device } from './device.entity';

export enum LoginEventType {
  PASSWORD_OK    = 'password_ok',
  PASSWORD_FAIL  = 'password_fail',
  OTP_SENT       = 'otp_sent',
  OTP_OK         = 'otp_ok',
  OTP_FAIL       = 'otp_fail',
  OTP_LOCKED     = 'otp_locked',
  SESSION_ISSUED = 'session_issued',
  LOGOUT         = 'logout',
  REVOKED        = 'revoked',
}

@Entity('login_events')
export class LoginEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  deviceId: string;

  @ManyToOne(() => Device, { nullable: true, onDelete: 'SET NULL', eager: false })
  @JoinColumn({ name: 'deviceId' })
  device: Device | null;

  @Column()
  ip: string;

  @Column({ nullable: true })
  browser: string;

  @Column({ nullable: true })
  os: string;

  @Column({ type: 'text' })
  eventType: LoginEventType;

  @CreateDateColumn()
  createdAt: Date;
}
```

- [ ] **Step 3: Create the migration file**

`backend/src/migrations/1750600000000-AddDevicesAndLoginEvents.ts`:
```typescript
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDevicesAndLoginEvents1750600000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE devices (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        token TEXT UNIQUE NOT NULL,
        name TEXT,
        "userAgent" TEXT,
        browser TEXT,
        os TEXT,
        ip TEXT,
        "isPermanent" BOOLEAN NOT NULL DEFAULT false,
        "firstSeen" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "lastSeen" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE login_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "deviceId" UUID REFERENCES devices(id) ON DELETE SET NULL,
        ip TEXT NOT NULL,
        browser TEXT,
        os TEXT,
        "eventType" TEXT NOT NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_login_events_created_at ON login_events ("createdAt" DESC)`);
    await queryRunner.query(`CREATE INDEX idx_login_events_device_id ON login_events ("deviceId")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS login_events`);
    await queryRunner.query(`DROP TABLE IF EXISTS devices`);
  }
}
```

- [ ] **Step 4: Update AppModule to register entities and run migration**

In `backend/src/app.module.ts`, add imports at top:
```typescript
import { Device } from './auth/entities/device.entity';
import { LoginEvent } from './auth/entities/login-event.entity';
import { AddDevicesAndLoginEvents1750600000000 } from '../migrations/1750600000000-AddDevicesAndLoginEvents';
```

Update the TypeORM `useFactory` return value — change `entities` and add `migrations` + `migrationsRun`:
```typescript
useFactory: (config: ConfigService) => ({
  type: 'postgres',
  url: config.get('DATABASE_URL'),
  entities: [Plugin, PluginExecution, ScheduledJob, AppSetting, Device, LoginEvent],
  migrations: [AddDevicesAndLoginEvents1750600000000],
  migrationsRun: true,
  synchronize: false,
}),
```

- [ ] **Step 5: Verify migration runs**

```bash
cd /workspace/auto-hub && docker compose up backend --no-deps 2>&1 | grep -E "migration|error|Error" | head -20
```

Expected output contains: `Migration AddDevicesAndLoginEvents1750600000000 has been executed successfully.`
No `ERROR` lines.

- [ ] **Step 6: Verify tables exist**

```bash
docker compose exec postgres psql -U autohub -d autohub -c "\dt devices; \dt login_events; \d devices; \d login_events"
```

Expected: both tables listed with correct columns and types.

- [ ] **Step 7: Commit**

```bash
git add backend/src/auth/entities/ backend/src/migrations/ backend/src/app.module.ts
git commit -m "feat: add Device and LoginEvent entities with migration"
```

---

## Task 2: RedisAuthService

**Files:**
- Create: `backend/src/auth/redis-auth.service.ts`
- Modify: `backend/src/auth/auth.module.ts`

**Interfaces:**
- Produces: `RedisAuthService` with methods:
  - `setSession(token: string, data: SessionData, permanent: boolean): Promise<void>`
  - `getSession(token: string): Promise<SessionData | null>`
  - `deleteSession(token: string): Promise<void>`
  - `deleteAllSessions(): Promise<number>`
  - `findSessionByDeviceId(deviceId: string): Promise<string | null>` — returns sessionToken
  - `setOtp(ip: string, data: OtpData): Promise<void>`
  - `getOtp(ip: string): Promise<OtpData | null>`
  - `deleteOtp(ip: string): Promise<void>`
  - `getAllSessionDeviceIds(): Promise<Map<string, string>>` — returns Map<sessionToken, deviceId>
- Exports: `SessionData`, `OtpData` interfaces

- [ ] **Step 1: Write the failing tests**

Create `backend/src/auth/redis-auth.service.spec.ts`:
```typescript
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

  it('deleteAllSessions deletes all session keys', async () => {
    mockRedis.keys.mockResolvedValueOnce(['autohub:session:a', 'autohub:session:b']);
    await service.deleteAllSessions();
    expect(mockRedis.del).toHaveBeenCalledWith('autohub:session:a', 'autohub:session:b');
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
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /workspace/auto-hub/backend && npm test -- redis-auth.service.spec --no-coverage 2>&1 | tail -10
```

Expected: FAIL — `Cannot find module './redis-auth.service'`

- [ ] **Step 3: Implement RedisAuthService**

`backend/src/auth/redis-auth.service.ts`:
```typescript
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

const SESSION_PREFIX = 'autohub:session:';
const OTP_PREFIX = 'autohub:otp:';
const SEVEN_DAYS_SEC = 7 * 24 * 60 * 60;
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
    if (permanent) {
      await this.client.set(key, value, 'EX', SEVEN_DAYS_SEC);
    } else {
      await this.client.set(key, value);
    }
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
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd /workspace/auto-hub/backend && npm test -- redis-auth.service.spec --no-coverage 2>&1 | tail -10
```

Expected: PASS — all 9 tests green.

- [ ] **Step 5: Wire RedisAuthService into AuthModule**

`backend/src/auth/auth.module.ts` — add RedisAuthService to providers and exports:
```typescript
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { RedisAuthService } from './redis-auth.service';
import { Device } from './entities/device.entity';
import { LoginEvent } from './entities/login-event.entity';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    PassportModule,
    TypeOrmModule.forFeature([Device, LoginEvent]),
    NotificationsModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => {
        const secret = config.get<string>('JWT_SECRET');
        if (!secret) throw new Error('JWT_SECRET environment variable is required');
        return { secret, signOptions: { expiresIn: '15m' } };
      },
      inject: [ConfigService],
    }),
  ],
  providers: [AuthService, JwtStrategy, RedisAuthService],
  controllers: [AuthController],
  exports: [JwtModule, RedisAuthService],
})
export class AuthModule {}
```

- [ ] **Step 6: Verify NotificationsModule exports NotificationsService**

```bash
grep -n "exports" /workspace/auto-hub/backend/src/notifications/notifications.module.ts
```

Expected: `exports: [NotificationsService]`. If missing, add it.

- [ ] **Step 7: Commit**

```bash
git add backend/src/auth/redis-auth.service.ts backend/src/auth/redis-auth.service.spec.ts backend/src/auth/auth.module.ts
git commit -m "feat: add RedisAuthService for session and OTP storage"
```

---

## Task 3: AuthService — Login + OTP Flows

**Files:**
- Modify: `backend/src/auth/auth.service.ts` — full rewrite
- Modify: `backend/package.json` — add ua-parser-js
- Create: `backend/src/auth/auth.service.spec.ts`
- Create: `backend/src/auth/dto/login.dto.ts`
- Create: `backend/src/auth/dto/verify-otp.dto.ts`

**Interfaces:**
- Consumes: `RedisAuthService` (Task 2), `Device`/`LoginEvent` entities (Task 1)
- Produces:
  - `AuthService.login(dto, ip, userAgent): Promise<LoginResult>` where `LoginResult = { step: 'otp_required'; deviceToken: string } | { sessionToken: string; accessJwt: string; deviceToken: string; isPermanent: boolean }`
  - `AuthService.verifyOtp(dto, ip, userAgent): Promise<{ sessionToken: string; accessJwt: string; deviceToken: string; isPermanent: false }>`

- [ ] **Step 1: Install ua-parser-js**

```bash
cd /workspace/auto-hub/backend && npm install ua-parser-js@1.0.37 && npm install --save-dev @types/ua-parser-js
```

Expected: `added X packages` with no errors.

- [ ] **Step 2: Create DTOs**

`backend/src/auth/dto/login.dto.ts`:
```typescript
import { IsString, IsOptional } from 'class-validator';

export class LoginDto {
  @IsString()
  password: string;

  @IsString()
  @IsOptional()
  deviceToken?: string;
}
```

`backend/src/auth/dto/verify-otp.dto.ts`:
```typescript
import { IsString } from 'class-validator';

export class VerifyOtpDto {
  @IsString()
  otp: string;

  @IsString()
  deviceToken: string;
}
```

- [ ] **Step 3: Write failing tests for login + OTP flows**

`backend/src/auth/auth.service.spec.ts`:
```typescript
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
  save: jest.fn(),
  findAndCount: jest.fn(),
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
      mockDeviceRepo.findOne.mockResolvedValueOnce(null);
      mockDeviceRepo.create.mockReturnValueOnce({ id: 'new-dev' });
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
      mockDeviceRepo.findOne.mockResolvedValueOnce(null);
      mockDeviceRepo.create.mockReturnValueOnce({ id: 'dev-new' });
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
```

- [ ] **Step 4: Run tests — expect fail**

```bash
cd /workspace/auto-hub/backend && npm test -- auth.service.spec --no-coverage 2>&1 | tail -15
```

Expected: FAIL — `AuthService` methods don't exist yet with new signatures.

- [ ] **Step 5: Rewrite AuthService**

`backend/src/auth/auth.service.ts`:
```typescript
import {
  Injectable, UnauthorizedException, HttpException, HttpStatus,
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
      device = await this.deviceRepo.save(
        this.deviceRepo.create({ token: randomUUID(), browser, os, ip, userAgent, isPermanent: false }),
      );
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

    const result = await this.issueSession(device, false, ip, userAgent);
    return { ...result as any, isPermanent: false as const };
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
```

- [ ] **Step 6: Run tests — expect pass**

```bash
cd /workspace/auto-hub/backend && npm test -- auth.service.spec --no-coverage 2>&1 | tail -15
```

Expected: PASS — all tests green.

- [ ] **Step 7: Commit**

```bash
git add backend/src/auth/auth.service.ts backend/src/auth/auth.service.spec.ts backend/src/auth/dto/ backend/package.json backend/package-lock.json
git commit -m "feat: rewrite AuthService with device tracking, OTP, and session issuance"
```

---

## Task 4: AuthService — Session Management Methods

**Files:**
- Modify: `backend/src/auth/auth.service.ts` — add refresh/logout/getSessions/updateDevice/revokeSession
- Modify: `backend/src/auth/auth.service.spec.ts` — add tests for new methods
- Create: `backend/src/auth/dto/refresh.dto.ts`
- Create: `backend/src/auth/dto/device-update.dto.ts`

**Interfaces:**
- Consumes: `RedisAuthService.getSession`, `deleteSession`, `deleteAllSessions`, `findSessionByDeviceId`, `getAllSessionDeviceIds` (Task 2)
- Produces:
  - `AuthService.refresh(sessionToken): Promise<{ accessJwt: string }>`
  - `AuthService.logout(sessionToken, ip, ua): Promise<void>`
  - `AuthService.logoutAll(ip, ua): Promise<void>`
  - `AuthService.getSessions(page, limit): Promise<{ devices: DeviceWithSession[], events: LoginEvent[], total: number }>`
  - `AuthService.updateDevice(id, isPermanent): Promise<Device>`
  - `AuthService.revokeSession(deviceId, ip, ua): Promise<void>`

- [ ] **Step 1: Create DTOs**

`backend/src/auth/dto/refresh.dto.ts`:
```typescript
import { IsString } from 'class-validator';
export class RefreshDto {
  @IsString()
  sessionToken: string;
}
```

`backend/src/auth/dto/device-update.dto.ts`:
```typescript
import { IsBoolean } from 'class-validator';
export class DeviceUpdateDto {
  @IsBoolean()
  isPermanent: boolean;
}
```

- [ ] **Step 2: Add failing tests for session management**

Append to the `describe('AuthService', ...)` block in `backend/src/auth/auth.service.spec.ts`:

```typescript
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
      const { NotFoundException } = await import('@nestjs/common');
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
  });
```

- [ ] **Step 3: Run new tests — expect fail**

```bash
cd /workspace/auto-hub/backend && npm test -- auth.service.spec --no-coverage 2>&1 | grep -E "FAIL|PASS|refresh|logout|getSessions" | head -15
```

Expected: new describes fail with `service.refresh is not a function` etc.

- [ ] **Step 4: Add methods to AuthService**

Append to `backend/src/auth/auth.service.ts` (inside the class, after `verifyOtp`):

```typescript
  async refresh(sessionToken: string): Promise<{ accessJwt: string }> {
    const session = await this.redis.getSession(sessionToken);
    if (!session) throw new UnauthorizedException('Session expired');
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
    const { NotFoundException } = await import('@nestjs/common');
    const device = await this.deviceRepo.findOne({ where: { id } });
    if (!device) throw new NotFoundException('Device not found');
    return this.deviceRepo.save({ ...device, isPermanent });
  }

  async revokeSession(deviceId: string, ip: string, userAgent: string): Promise<void> {
    const device = await this.deviceRepo.findOne({ where: { id: deviceId } });
    const sessionToken = await this.redis.findSessionByDeviceId(deviceId);
    if (sessionToken) await this.redis.deleteSession(sessionToken);
    await this.logEvent(LoginEventType.REVOKED, ip, userAgent, device ?? null);
  }
```

Also add `NotFoundException` to the top-level import from `@nestjs/common`:
```typescript
import {
  Injectable, UnauthorizedException, HttpException, HttpStatus, NotFoundException,
} from '@nestjs/common';
```

And remove the dynamic import from `updateDevice` (it was only there for the stub; now the static import covers it):
```typescript
  async updateDevice(id: string, isPermanent: boolean): Promise<Device> {
    const device = await this.deviceRepo.findOne({ where: { id } });
    if (!device) throw new NotFoundException('Device not found');
    return this.deviceRepo.save({ ...device, isPermanent });
  }
```

- [ ] **Step 5: Run all auth service tests — expect pass**

```bash
cd /workspace/auto-hub/backend && npm test -- auth.service.spec --no-coverage 2>&1 | tail -15
```

Expected: PASS — all tests in auth.service.spec green.

- [ ] **Step 6: Commit**

```bash
git add backend/src/auth/auth.service.ts backend/src/auth/auth.service.spec.ts backend/src/auth/dto/refresh.dto.ts backend/src/auth/dto/device-update.dto.ts
git commit -m "feat: add session management methods to AuthService (refresh, logout, getSessions, devices)"
```

---

## Task 5: AuthController — New Endpoints

**Files:**
- Modify: `backend/src/auth/auth.controller.ts` — full rewrite with all 8 endpoints

**Interfaces:**
- Consumes: all `AuthService` methods from Tasks 3 + 4
- Produces: REST API consumed by frontend Tasks 6, 7, 8

- [ ] **Step 1: Rewrite AuthController**

`backend/src/auth/auth.controller.ts`:
```typescript
import {
  Controller, Post, Get, Patch, Delete,
  Body, Param, HttpCode, Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { Public } from './decorators/public.decorator';
import { LoginDto } from './dto/login.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { RefreshDto } from './dto/refresh.dto';
import { DeviceUpdateDto } from './dto/device-update.dto';

function clientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return (Array.isArray(fwd) ? fwd[0] : fwd.split(',')[0]).trim();
  return req.ip ?? 'unknown';
}

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  @Public()
  @HttpCode(200)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.authService.login(dto, clientIp(req), req.headers['user-agent'] ?? '');
  }

  @Post('otp/verify')
  @Public()
  @HttpCode(200)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  async verifyOtp(@Body() dto: VerifyOtpDto, @Req() req: Request) {
    return this.authService.verifyOtp(dto, clientIp(req), req.headers['user-agent'] ?? '');
  }

  @Post('refresh')
  @Public()
  @HttpCode(200)
  async refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto.sessionToken);
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Body() body: { sessionToken: string }, @Req() req: Request) {
    await this.authService.logout(body.sessionToken, clientIp(req), req.headers['user-agent'] ?? '');
  }

  @Post('logout-all')
  @HttpCode(200)
  async logoutAll(@Req() req: Request) {
    await this.authService.logoutAll(clientIp(req), req.headers['user-agent'] ?? '');
  }

  @Get('sessions')
  async getSessions(@Req() req: Request) {
    const page = parseInt((req.query['page'] as string) ?? '1', 10);
    const limit = parseInt((req.query['limit'] as string) ?? '20', 10);
    return this.authService.getSessions(page, Math.min(limit, 100));
  }

  @Patch('devices/:id')
  async updateDevice(@Param('id') id: string, @Body() dto: DeviceUpdateDto) {
    return this.authService.updateDevice(id, dto.isPermanent);
  }

  @Delete('sessions/:deviceId')
  @HttpCode(200)
  async revokeSession(@Param('deviceId') deviceId: string, @Req() req: Request) {
    await this.authService.revokeSession(deviceId, clientIp(req), req.headers['user-agent'] ?? '');
  }
}
```

- [ ] **Step 2: Run all backend tests to confirm nothing broken**

```bash
cd /workspace/auto-hub/backend && npm test --no-coverage 2>&1 | tail -20
```

Expected: All test suites pass.

- [ ] **Step 3: Smoke-test against running stack**

```bash
# Rebuild and start backend
cd /workspace/auto-hub && docker compose up backend --build -d
sleep 8

# Test login with wrong password
curl -s -X POST http://localhost/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"password":"wrong"}' | python3 -m json.tool

# Test login with correct password (use actual ADMIN_PASSWORD from .env)
PASS=$(grep ADMIN_PASSWORD .env | cut -d= -f2)
curl -s -X POST http://localhost/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"password\":\"$PASS\"}" | python3 -m json.tool
```

Expected for wrong password: `{"statusCode":401,"message":"Invalid password"}`
Expected for correct password: `{"step":"otp_required","deviceToken":"<uuid>"}` (OTP sent to Telegram)

- [ ] **Step 4: Commit**

```bash
git add backend/src/auth/auth.controller.ts
git commit -m "feat: add OTP verify, refresh, logout, sessions, and device management endpoints"
```

---

## Task 6: Frontend Token Overhaul — api.ts, filesApi.ts, AppShell, Sidebar, MobileNav

**Files:**
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/lib/filesApi.ts`
- Modify: `frontend/src/components/layout/AppShell.tsx`
- Modify: `frontend/src/components/layout/Sidebar.tsx`
- Modify: `frontend/src/components/layout/MobileNav.tsx`

**Interfaces:**
- Produces: exported from `api.ts`:
  - `getSessionToken(): string | null`
  - `setAccessJwt(token: string | null): void`
  - `refreshAuth(): Promise<boolean>`
  - `clearAuth(): void`
  - `default` — axios instance with refresh interceptor

- [ ] **Step 1: Rewrite api.ts**

`frontend/src/lib/api.ts`:
```typescript
import axios from 'axios'

let accessJwt: string | null = null

export function getSessionToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('autohub_session') ?? sessionStorage.getItem('autohub_session') ?? null
}

export function setAccessJwt(token: string | null): void {
  accessJwt = token
}

export function clearAuth(): void {
  accessJwt = null
  if (typeof window === 'undefined') return
  localStorage.removeItem('autohub_session')
  localStorage.removeItem('autohub_device')
  sessionStorage.removeItem('autohub_session')
}

export async function refreshAuth(): Promise<boolean> {
  const sessionToken = getSessionToken()
  if (!sessionToken) return false
  try {
    const { data } = await axios.post('/api/auth/refresh', { sessionToken })
    setAccessJwt(data.accessJwt)
    return true
  } catch {
    return false
  }
}

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? '',
})

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined' && accessJwt) {
    config.headers.Authorization = `Bearer ${accessJwt}`
  }
  return config
})

let isRefreshing = false
let refreshQueue: Array<(token: string) => void> = []

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config
    if (error.response?.status !== 401 || original._retry) return Promise.reject(error)

    if (isRefreshing) {
      return new Promise((resolve) => {
        refreshQueue.push((token) => {
          original.headers.Authorization = `Bearer ${token}`
          resolve(api(original))
        })
      })
    }

    original._retry = true
    isRefreshing = true

    const ok = await refreshAuth()
    isRefreshing = false

    if (ok && accessJwt) {
      refreshQueue.forEach((cb) => cb(accessJwt!))
      refreshQueue = []
      original.headers.Authorization = `Bearer ${accessJwt}`
      return api(original)
    }

    refreshQueue = []
    clearAuth()
    if (typeof window !== 'undefined') window.location.href = '/login'
    return Promise.reject(error)
  },
)

export default api
```

- [ ] **Step 2: Update filesApi.ts**

Replace `getToken()` and all references to `autohub_token`:

```typescript
import { getSessionToken } from '@/lib/api'

const BASE = '/files-api'

function getToken(): string {
  // filesApi uses the accessJwt stored in the api module — read via sessionStorage key
  // The actual accessJwt is in memory in api.ts; for filesApi (fetch-based) we trigger
  // a refresh through the shared api module before each call when needed.
  // For simplicity, filesApi reads the Authorization header value from a shared export.
  if (typeof window === 'undefined') return ''
  // We can't easily share the in-memory JWT without a context; instead, filesApi
  // directs 401s to /login and the user re-authenticates. The download URL uses
  // a short-lived token approach (future work). For now, use api.ts for downloads.
  return ''
}
```

Wait — `filesApi.ts` uses raw `fetch` not axios. The in-memory `accessJwt` from api.ts isn't accessible to it. We need a shared accessor.

Update `api.ts` — add one more export:
```typescript
export function getAccessJwt(): string | null {
  return accessJwt
}
```

Now update `filesApi.ts` fully:
```typescript
import { getAccessJwt, clearAuth } from '@/lib/api'

const BASE = '/files-api'

function authHeaders(): HeadersInit {
  const jwt = getAccessJwt()
  return jwt ? { Authorization: `Bearer ${jwt}` } : {}
}

function handleUnauth(res: Response): void {
  if (res.status === 401 && typeof window !== 'undefined') {
    clearAuth()
    window.location.href = '/login'
  }
}

// ... rest of the file unchanged EXCEPT:
// In apiUpload XHR section, replace:
//   xhr.setRequestHeader('Authorization', `Bearer ${getToken()}`)
// with:
//   const jwt = getAccessJwt()
//   if (jwt) xhr.setRequestHeader('Authorization', `Bearer ${jwt}`)
// And replace the 401 handler:
//   if (xhr.status === 401) {
//     clearAuth()
//     window.location.href = '/login'
//     return
//   }
// And in apiDownload, replace token query param usage:
//   Remove: const token = getToken()
//   Change URL to not include token (download will hit 401 and redirect — or use the api axios instance)
```

Since the download uses a query param (which the spec flags as a security issue — Finding #4), for now keep the existing pattern but use the `getAccessJwt()` value:

Full updated `filesApi.ts`:
```typescript
import { getAccessJwt, clearAuth } from '@/lib/api'

const BASE = '/files-api'

function authHeaders(): HeadersInit {
  const jwt = getAccessJwt()
  return jwt ? { Authorization: `Bearer ${jwt}` } : {}
}

function handleUnauth(res: Response): void {
  if (res.status === 401 && typeof window !== 'undefined') {
    clearAuth()
    window.location.href = '/login'
  }
}

export interface DirEntry {
  name: string
  type: 'file' | 'dir'
  size: number
  modified: string
}

export interface ListResult {
  path: string
  entries: DirEntry[]
}

export async function apiLs(root: string, path: string): Promise<ListResult> {
  const res = await fetch(
    `${BASE}/ls?root=${encodeURIComponent(root)}&path=${encodeURIComponent(path)}`,
    { headers: authHeaders() }
  )
  handleUnauth(res)
  if (!res.ok) throw new Error((await res.json()).error ?? res.statusText)
  return res.json()
}

export async function apiMkdir(root: string, path: string): Promise<void> {
  const res = await fetch(`${BASE}/mkdir`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ root, path }),
  })
  handleUnauth(res)
  if (!res.ok) throw new Error((await res.json()).error ?? res.statusText)
}

export async function apiRename(root: string, from: string, to: string): Promise<void> {
  const res = await fetch(`${BASE}/rename`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ root, from, to }),
  })
  handleUnauth(res)
  if (!res.ok) throw new Error((await res.json()).error ?? res.statusText)
}

export async function apiDelete(root: string, path: string): Promise<void> {
  const res = await fetch(`${BASE}/delete`, {
    method: 'DELETE',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ root, path }),
  })
  handleUnauth(res)
  if (!res.ok) throw new Error((await res.json()).error ?? res.statusText)
}

export async function apiDownload(root: string, path: string, filename: string): Promise<void> {
  const token = getAccessJwt() ?? ''
  const url = `${BASE}/download?root=${encodeURIComponent(root)}&path=${encodeURIComponent(path)}&token=${encodeURIComponent(token)}`
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

export async function apiUpload(
  root: string,
  path: string,
  transferId: string,
  files: File[],
  signal: AbortSignal,
  onProgress?: (loaded: number, total: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const formData = new FormData()
    files.forEach((f) => formData.append('file', f))

    const xhr = new XMLHttpRequest()

    xhr.upload.onprogress = (e) => {
      if (onProgress) onProgress(e.loaded, e.total)
    }

    xhr.onload = () => {
      if (xhr.status === 401) {
        clearAuth()
        window.location.href = '/login'
        return
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve()
      } else {
        try {
          const body = JSON.parse(xhr.responseText)
          reject(new Error(body.error ?? xhr.statusText))
        } catch {
          reject(new Error(xhr.statusText))
        }
      }
    }

    xhr.onerror = () => reject(new Error('Upload failed'))
    xhr.ontimeout = () => reject(new Error('Upload timed out'))

    signal.addEventListener('abort', () => {
      xhr.abort()
      reject(new DOMException('Aborted', 'AbortError'))
    })

    xhr.open(
      'POST',
      `${BASE}/upload?root=${encodeURIComponent(root)}&path=${encodeURIComponent(path)}&transferId=${encodeURIComponent(transferId)}`
    )
    const jwt = getAccessJwt()
    if (jwt) xhr.setRequestHeader('Authorization', `Bearer ${jwt}`)
    xhr.send(formData)
  })
}
```

- [ ] **Step 3: Update AppShell.tsx — async auth check**

`frontend/src/components/layout/AppShell.tsx`:
```tsx
'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Menu } from 'lucide-react'
import Sidebar from './Sidebar'
import { MobileNav } from './MobileNav'
import TransferTray from '@/components/files/TransferTray'
import { getSessionToken, refreshAuth, clearAuth } from '@/lib/api'

export default function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [authState, setAuthState] = useState<'loading' | 'ok'>('loading')
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const sessionToken = getSessionToken()
    if (!sessionToken) {
      router.replace('/login')
      return
    }
    refreshAuth().then((ok) => {
      if (ok) {
        setAuthState('ok')
      } else {
        clearAuth()
        router.replace('/login')
      }
    })
  }, [router])

  if (authState === 'loading') {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="text-[#6b7280] text-sm">Authenticating…</div>
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#0a0a0a]">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="md:hidden flex items-center justify-between px-4 h-12 bg-[#111111] border-b border-[#2a2a2a] shrink-0 sticky top-0 z-30">
          <div className="flex items-center gap-2">
            <Image
              src="/img/Base Logo - Light.png"
              alt="AutoHub"
              width={36}
              height={20}
              className="object-contain"
              priority
            />
            <span className="text-white font-medium text-sm">AutoHub</span>
          </div>
          <button
            onClick={() => setMenuOpen(true)}
            aria-label="Open navigation menu"
            aria-expanded={menuOpen}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-[#9ca3af] hover:text-white hover:bg-[#1a1a1a] active:bg-[#2a2a2a] transition-colors"
          >
            <Menu size={20} />
          </button>
        </header>
        <main className="flex-1 overflow-auto p-4 md:p-6 min-w-0 max-w-full">
          {children}
        </main>
      </div>
      <MobileNav open={menuOpen} onClose={() => setMenuOpen(false)} />
      <TransferTray />
    </div>
  )
}
```

- [ ] **Step 4: Update Sidebar.tsx logout handler**

In `frontend/src/components/layout/Sidebar.tsx`, update `handleLogout` (currently at line 50):
```typescript
import api, { clearAuth } from '@/lib/api'

// inside Sidebar():
const handleLogout = async () => {
  const sessionToken =
    localStorage.getItem('autohub_session') ?? sessionStorage.getItem('autohub_session')
  if (sessionToken) {
    try { await api.post('/api/auth/logout', { sessionToken }) } catch { /* ignore */ }
  }
  clearAuth()
  router.replace('/login')
}
```

- [ ] **Step 5: Update MobileNav.tsx logout handler**

In `frontend/src/components/layout/MobileNav.tsx`, update `handleLogout` (currently at line 42):
```typescript
import api, { clearAuth } from '@/lib/api'

// inside MobileNav():
const handleLogout = async () => {
  const sessionToken =
    localStorage.getItem('autohub_session') ?? sessionStorage.getItem('autohub_session')
  if (sessionToken) {
    try { await api.post('/api/auth/logout', { sessionToken }) } catch { /* ignore */ }
  }
  clearAuth()
  router.replace('/login')
}
```

- [ ] **Step 6: Rebuild frontend and verify auth flow**

```bash
cd /workspace/auto-hub && docker compose up frontend --build -d
sleep 15
curl -s http://localhost/ | grep -i "autohub\|login" | head -5
```

Navigate to the app in browser: should show "Authenticating…" briefly then redirect to `/login` (since no session token exists). No console errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/api.ts frontend/src/lib/filesApi.ts \
  frontend/src/components/layout/AppShell.tsx \
  frontend/src/components/layout/Sidebar.tsx \
  frontend/src/components/layout/MobileNav.tsx
git commit -m "feat: overhaul frontend token storage — memory JWT, refresh interceptor, async auth check"
```

---

## Task 7: Login Page — Two-Step OTP Flow

**Files:**
- Modify: `frontend/src/app/(auth)/login/page.tsx`

**Interfaces:**
- Consumes: `POST /api/auth/login`, `POST /api/auth/otp/verify` (Task 5)
- Produces: sets `localStorage.autohub_device`, `localStorage.autohub_session` or `sessionStorage.autohub_session`, calls `setAccessJwt`

- [ ] **Step 1: Rewrite login/page.tsx**

`frontend/src/app/(auth)/login/page.tsx`:
```tsx
'use client'
import Image from 'next/image'
import { useState, FormEvent, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import axios from 'axios'
import { setAccessJwt } from '@/lib/api'

type Step = 'password' | 'otp'

interface OtpError {
  reason: 'otp_invalid' | 'otp_locked' | 'otp_expired'
  attemptsRemaining?: number
  lockedUntil?: string
}

const OTP_RESEND_SEC = 30

export default function LoginPage() {
  const [step, setStep] = useState<Step>('password')
  const [password, setPassword] = useState('')
  const [otp, setOtp] = useState('')
  const [deviceToken, setDeviceToken] = useState<string>('')
  const [error, setError] = useState('')
  const [otpError, setOtpError] = useState<OtpError | null>(null)
  const [loading, setLoading] = useState(false)
  const [resendCountdown, setResendCountdown] = useState(0)
  const otpRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  // Countdown timer for OTP resend
  useEffect(() => {
    if (resendCountdown <= 0) return
    const t = setTimeout(() => setResendCountdown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [resendCountdown])

  // Auto-focus OTP input when step changes
  useEffect(() => {
    if (step === 'otp') otpRef.current?.focus()
  }, [step])

  const handlePasswordSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const storedDevice = localStorage.getItem('autohub_device') ?? undefined
      const { data } = await axios.post('/api/auth/login', { password, deviceToken: storedDevice })

      if (data.step === 'otp_required') {
        setDeviceToken(data.deviceToken)
        localStorage.setItem('autohub_device', data.deviceToken)
        setStep('otp')
        setResendCountdown(OTP_RESEND_SEC)
      } else {
        // Permanent device — session issued directly
        storeSession(data)
        router.replace('/')
      }
    } catch (err: any) {
      if (err.response?.status === 429) {
        const { lockedUntil } = err.response.data
        const until = new Date(lockedUntil)
        setError(`Too many attempts. Try again at ${until.toLocaleTimeString()}.`)
      } else {
        setError('Invalid password')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleOtpSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setOtpError(null)
    setLoading(true)
    try {
      const { data } = await axios.post('/api/auth/otp/verify', { otp, deviceToken })
      storeSession(data)
      router.replace('/')
    } catch (err: any) {
      const body = err.response?.data ?? {}
      if (err.response?.status === 429) {
        setOtpError({ reason: 'otp_locked', lockedUntil: body.lockedUntil })
      } else if (body.reason === 'otp_invalid') {
        setOtpError({ reason: 'otp_invalid', attemptsRemaining: body.attemptsRemaining })
      } else {
        setOtpError({ reason: 'otp_expired' })
      }
    } finally {
      setLoading(false)
    }
  }

  const handleResend = () => {
    setOtp('')
    setOtpError(null)
    setStep('password')
  }

  function storeSession(data: { sessionToken: string; accessJwt: string; isPermanent: boolean }) {
    setAccessJwt(data.accessJwt)
    if (data.isPermanent) {
      localStorage.setItem('autohub_session', data.sessionToken)
    } else {
      sessionStorage.setItem('autohub_session', data.sessionToken)
      window.addEventListener('beforeunload', () => {
        navigator.sendBeacon('/api/auth/logout', JSON.stringify({ sessionToken: data.sessionToken }))
      }, { once: true })
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-8">
          <div className="text-center mb-8">
            <Image
              src="/img/Base Logo - Light.png"
              alt="AutoHub logo"
              width={110}
              height={61}
              className="object-contain mx-auto"
              priority
            />
            <h1 className="text-white font-semibold text-xl mt-4">AutoHub</h1>
            <p className="text-[#6b7280] text-sm mt-1">Personal Automation OS</p>
          </div>

          {step === 'password' && (
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div>
                <label htmlFor="password" className="block text-sm text-[#9ca3af] mb-1">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  required
                  className="w-full bg-[#111111] border border-[#2a2a2a] rounded-md px-3 py-2 text-[#f1f1f1] text-sm focus:outline-none focus:border-[#3b82f6] transition-colors"
                />
              </div>
              {error && <p className="text-[#ef4444] text-sm" role="alert">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#3b82f6] text-white py-2 rounded-md text-sm font-medium hover:bg-[#2563eb] disabled:opacity-50 transition-colors"
              >
                {loading ? 'Checking…' : 'Continue'}
              </button>
            </form>
          )}

          {step === 'otp' && (
            <form onSubmit={handleOtpSubmit} className="space-y-4">
              <div className="text-center mb-2">
                <p className="text-[#9ca3af] text-sm">Check Telegram for your code</p>
                <p className="text-[#6b7280] text-xs mt-1">Expires in 5 minutes</p>
              </div>
              <div>
                <label htmlFor="otp" className="block text-sm text-[#9ca3af] mb-1">
                  6-digit code
                </label>
                <input
                  id="otp"
                  ref={otpRef}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, '').slice(0, 6)
                    setOtp(v)
                  }}
                  placeholder="123456"
                  required
                  className="w-full bg-[#111111] border border-[#2a2a2a] rounded-md px-3 py-2 text-[#f1f1f1] text-sm tracking-widest text-center focus:outline-none focus:border-[#3b82f6] transition-colors"
                />
              </div>
              {otpError?.reason === 'otp_invalid' && (
                <p className="text-[#ef4444] text-sm" role="alert">
                  Incorrect code. {otpError.attemptsRemaining} attempt{otpError.attemptsRemaining !== 1 ? 's' : ''} remaining.
                </p>
              )}
              {otpError?.reason === 'otp_locked' && (
                <p className="text-[#ef4444] text-sm" role="alert">
                  Too many attempts. Try again at{' '}
                  {otpError.lockedUntil ? new Date(otpError.lockedUntil).toLocaleTimeString() : 'later'}.
                </p>
              )}
              {otpError?.reason === 'otp_expired' && (
                <p className="text-[#ef4444] text-sm" role="alert">
                  Code expired.{' '}
                  <button type="button" onClick={handleResend} className="underline text-[#3b82f6]">
                    Log in again
                  </button>
                </p>
              )}
              <button
                type="submit"
                disabled={loading || otp.length !== 6}
                className="w-full bg-[#3b82f6] text-white py-2 rounded-md text-sm font-medium hover:bg-[#2563eb] disabled:opacity-50 transition-colors"
              >
                {loading ? 'Verifying…' : 'Verify Code'}
              </button>
              <div className="text-center">
                {resendCountdown > 0 ? (
                  <p className="text-[#6b7280] text-xs">Resend in {resendCountdown}s</p>
                ) : (
                  <button
                    type="button"
                    onClick={handleResend}
                    className="text-[#3b82f6] text-xs hover:underline"
                  >
                    Resend code
                  </button>
                )}
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Build frontend and test full login flow**

```bash
cd /workspace/auto-hub && docker compose up frontend --build -d && sleep 15
```

Open browser at `http://localhost`:

1. Should redirect to `/login`
2. Enter wrong password → error "Invalid password"
3. Enter correct password → step transitions to OTP input, Telegram message received
4. Enter wrong OTP → "Incorrect code. 2 attempts remaining."
5. Enter correct OTP → redirect to `/`
6. Close browser tab, reopen → redirects to `/login` (non-permanent session cleared)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/\(auth\)/login/page.tsx
git commit -m "feat: add two-step login with OTP for non-permanent devices"
```

---

## Task 8: Settings — Sessions & Devices Section

**Files:**
- Create: `frontend/src/lib/hooks/useAuthSessions.ts`
- Modify: `frontend/src/app/(app)/settings/page.tsx`

**Interfaces:**
- Consumes: `GET /api/auth/sessions`, `PATCH /api/auth/devices/:id`, `DELETE /api/auth/sessions/:id`, `POST /api/auth/logout-all` (Task 5)
- Produces: "Sessions & Devices" section in settings page

- [ ] **Step 1: Create useAuthSessions hook**

`frontend/src/lib/hooks/useAuthSessions.ts`:
```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'

export interface DeviceSession {
  id: string
  token: string
  browser: string | null
  os: string | null
  ip: string | null
  isPermanent: boolean
  firstSeen: string
  lastSeen: string
  hasActiveSession: boolean
}

export interface LoginEventRow {
  id: string
  deviceId: string | null
  ip: string
  browser: string | null
  os: string | null
  eventType: string
  createdAt: string
}

export interface SessionsData {
  devices: DeviceSession[]
  events: LoginEventRow[]
  total: number
}

export function useAuthSessions(page = 1) {
  return useQuery<SessionsData>({
    queryKey: ['auth-sessions', page],
    queryFn: async () => {
      const { data } = await api.get(`/api/auth/sessions?page=${page}&limit=20`)
      return data
    },
  })
}

export function useUpdateDevice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, isPermanent }: { id: string; isPermanent: boolean }) =>
      api.patch(`/api/auth/devices/${id}`, { isPermanent }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['auth-sessions'] }),
  })
}

export function useRevokeSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (deviceId: string) => api.delete(`/api/auth/sessions/${deviceId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['auth-sessions'] }),
  })
}

export function useLogoutAll() {
  return useMutation({
    mutationFn: () => api.post('/api/auth/logout-all'),
  })
}
```

- [ ] **Step 2: Add Sessions & Devices section to settings/page.tsx**

Add these imports at the top of `frontend/src/app/(app)/settings/page.tsx`:
```typescript
import { useAuthSessions, useUpdateDevice, useRevokeSession, useLogoutAll } from '@/lib/hooks/useAuthSessions'
import { Shield } from 'lucide-react'
```

Add the `SessionsSection` component before the `export default function SettingsPage()` function:
```tsx
const EVENT_LABELS: Record<string, { icon: string; color: string; label: string }> = {
  password_ok:    { icon: '✓', color: '#22c55e', label: 'Password accepted' },
  otp_ok:         { icon: '✓', color: '#22c55e', label: 'OTP accepted' },
  session_issued: { icon: '✓', color: '#22c55e', label: 'Login' },
  password_fail:  { icon: '✗', color: '#ef4444', label: 'Wrong password' },
  otp_fail:       { icon: '✗', color: '#ef4444', label: 'Wrong OTP' },
  otp_locked:     { icon: '⚠', color: '#f59e0b', label: 'OTP locked' },
  logout:         { icon: '↩', color: '#6b7280', label: 'Logout' },
  revoked:        { icon: '✗', color: '#ef4444', label: 'Revoked' },
  otp_sent:       { icon: '→', color: '#3b82f6', label: 'OTP sent' },
}

function SessionsSection() {
  const [historyPage, setHistoryPage] = useState(1)
  const [confirmRevokeAll, setConfirmRevokeAll] = useState(false)
  const { data, isLoading } = useAuthSessions(historyPage)
  const updateDevice = useUpdateDevice()
  const revokeSession = useRevokeSession()
  const logoutAll = useLogoutAll()
  const currentDeviceToken = typeof window !== 'undefined' ? localStorage.getItem('autohub_device') : null

  const handleLogoutAll = async () => {
    if (!confirmRevokeAll) { setConfirmRevokeAll(true); return }
    await logoutAll.mutateAsync()
    window.location.href = '/login'
  }

  if (isLoading) return <div className="text-[#6b7280] text-sm">Loading sessions…</div>

  return (
    <div className="space-y-4">
      {/* Devices */}
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-white font-medium text-sm flex items-center gap-2">
            <Shield size={15} className="text-[#3b82f6]" />
            Sessions & Devices
          </h2>
          <button
            onClick={handleLogoutAll}
            disabled={logoutAll.isPending}
            className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
              confirmRevokeAll
                ? 'border-[#ef4444] text-[#ef4444] hover:bg-[#ef4444]/10'
                : 'border-[#2a2a2a] text-[#6b7280] hover:text-white hover:border-[#3a3a3a]'
            }`}
          >
            {confirmRevokeAll ? 'Confirm revoke all?' : 'Revoke All'}
          </button>
        </div>

        {(data?.devices ?? []).length === 0 && (
          <p className="text-[#6b7280] text-sm">No devices recorded yet.</p>
        )}

        {(data?.devices ?? []).map((device) => {
          const isCurrentDevice = device.token === currentDeviceToken
          return (
            <div
              key={device.id}
              className="flex items-center justify-between py-2 border-t border-[#2a2a2a] first:border-0 gap-3"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    device.hasActiveSession ? 'bg-[#22c55e]' : 'bg-[#374151]'
                  }`}
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-sm text-[#f1f1f1]">
                    <span className="truncate">
                      {[device.browser, device.os].filter(Boolean).join(' · ') || 'Unknown device'}
                    </span>
                    {isCurrentDevice && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-[#3b82f6]/15 text-[#3b82f6] border border-[#3b82f6]/30 shrink-0">
                        This device
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-[#6b7280] mt-0.5">
                    {device.ip} · Last seen {new Date(device.lastSeen).toLocaleDateString()}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => updateDevice.mutate({ id: device.id, isPermanent: !device.isPermanent })}
                  disabled={updateDevice.isPending}
                  className={`text-xs px-2.5 py-1 rounded-md border transition-colors ${
                    device.isPermanent
                      ? 'border-[#22c55e]/40 text-[#22c55e] bg-[#22c55e]/5 hover:bg-[#22c55e]/10'
                      : 'border-[#2a2a2a] text-[#6b7280] hover:text-white hover:border-[#3a3a3a]'
                  }`}
                >
                  {device.isPermanent ? 'Permanent ✓' : 'Make Permanent'}
                </button>
                {device.hasActiveSession && !isCurrentDevice && (
                  <button
                    onClick={() => revokeSession.mutate(device.id)}
                    disabled={revokeSession.isPending}
                    className="text-xs px-2.5 py-1 rounded-md border border-[#2a2a2a] text-[#6b7280] hover:text-[#ef4444] hover:border-[#ef4444]/40 transition-colors"
                  >
                    Revoke
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Login History */}
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-5 space-y-2">
        <h2 className="text-white font-medium text-sm">Login History</h2>
        {(data?.events ?? []).length === 0 && (
          <p className="text-[#6b7280] text-sm">No events yet.</p>
        )}
        {(data?.events ?? []).map((event) => {
          const meta = EVENT_LABELS[event.eventType] ?? { icon: '·', color: '#6b7280', label: event.eventType }
          return (
            <div key={event.id} className="flex items-start gap-3 py-1.5 border-t border-[#2a2a2a] first:border-0 text-xs">
              <span style={{ color: meta.color }} className="shrink-0 w-4 text-center font-mono mt-0.5">
                {meta.icon}
              </span>
              <div className="min-w-0 flex-1">
                <span className="text-[#9ca3af]">{meta.label}</span>
                {(event.browser || event.os) && (
                  <span className="text-[#6b7280]">
                    {' · '}{[event.browser, event.os].filter(Boolean).join(' · ')}
                  </span>
                )}
                <span className="text-[#6b7280]"> · {event.ip}</span>
              </div>
              <span className="text-[#4b5563] shrink-0">
                {new Date(event.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          )
        })}
        {data && data.total > (data?.events?.length ?? 0) && (
          <button
            onClick={() => setHistoryPage((p) => p + 1)}
            className="text-xs text-[#3b82f6] hover:underline mt-1"
          >
            Load more
          </button>
        )}
      </div>
    </div>
  )
}
```

Inside `SettingsPage()`, add `SessionsSection` after the existing sections (before the closing `</>`):
```tsx
<SessionsSection />
```

- [ ] **Step 3: Build and verify settings page**

```bash
cd /workspace/auto-hub && docker compose up frontend --build -d && sleep 15
```

1. Log in via the updated login page (complete the OTP flow)
2. Navigate to Settings
3. Verify "Sessions & Devices" section appears with the current device listed (green dot, "This device" badge)
4. Click "Make Permanent" on the current device — button changes to "Permanent ✓"
5. Verify Login History shows the recent login events

- [ ] **Step 4: Test permanent device login**

1. With device marked permanent, log out
2. Log in again → should NOT see OTP step, goes directly to app
3. Navigate to Settings → device still shows "Permanent ✓"

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/hooks/useAuthSessions.ts frontend/src/app/\(app\)/settings/page.tsx
git commit -m "feat: add Sessions & Devices section to settings with device trust management and login history"
```

---

## Self-Review Checklist

**Spec coverage:**
- ✓ Device fingerprint → device token (UUID) in localStorage: Task 6 `autohub_device`
- ✓ Permanent device: 7-day session, password only → Tasks 3, 6, 7 (storeSession with `isPermanent: true`)
- ✓ Non-permanent: sessionStorage, OTP required → Tasks 3, 7 (sessionStorage + `beforeunload`)
- ✓ OTP via Telegram → Task 3 (`notifications.send()`)
- ✓ 6 digits, 5-min TTL, 3 attempts, 5-min lockout → Tasks 2, 3
- ✓ Settings: device list with permanent toggle → Task 8
- ✓ Settings: login history → Task 8
- ✓ Settings: revoke per-device → Task 8
- ✓ Settings: revoke all → Task 8
- ✓ Short-lived 15-min accessJwt → Task 2 (`auth.module.ts` `expiresIn: '15m'`), Task 6 (memory only)
- ✓ Server-side sessions in Redis → Tasks 2, 3, 4
- ✓ Refresh interceptor → Task 6 (`api.ts`)
- ✓ Terminal/files unchanged → confirmed (they validate JWT signature, JWT_SECRET unchanged)
- ✓ Migration → Task 1
- ✓ ua-parser-js → Task 3
- ✓ Login history: all event types including failures → Task 3 (`logEvent` on each path)
- ✓ "This device" badge → Task 8 (token comparison with localStorage)

**Type consistency check:**
- `LoginResult` in `auth.service.ts` matches what `auth.controller.ts` returns ✓
- `DeviceSession.hasActiveSession` returned by `getSessions()` matches `useAuthSessions` type ✓
- `LoginEventType` enum values match `EVENT_LABELS` keys in settings ✓
- `refreshAuth()` exported from `api.ts`, consumed by `AppShell.tsx` ✓
- `clearAuth()` exported from `api.ts`, consumed by Sidebar, MobileNav, filesApi ✓
- `getAccessJwt()` exported from `api.ts`, consumed by `filesApi.ts` ✓

**No placeholders:** All steps contain complete code. ✓
