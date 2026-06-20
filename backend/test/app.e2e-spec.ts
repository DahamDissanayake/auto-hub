import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { APP_GUARD } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bullmq';
import request from 'supertest';
import * as fs from 'fs';
import * as path from 'path';

// Auth
import { AuthService } from '../src/auth/auth.service';
import { AuthController } from '../src/auth/auth.controller';
import { JwtStrategy } from '../src/auth/strategies/jwt.strategy';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';

// Health
import { HealthController } from '../src/health/health.controller';

// Plugins
import { PluginsService } from '../src/plugins/plugins.service';
import { PluginsController } from '../src/plugins/plugins.controller';
import { Plugin } from '../src/plugins/entities/plugin.entity';
import { PluginExecution } from '../src/plugins/entities/plugin-execution.entity';

// Scheduler
import { SchedulerService } from '../src/scheduler/scheduler.service';
import { SchedulerController } from '../src/scheduler/scheduler.controller';
import { ScheduledJob } from '../src/scheduler/entities/scheduled-job.entity';

// Dashboard
import { DashboardService } from '../src/dashboard/dashboard.service';
import { DashboardController } from '../src/dashboard/dashboard.controller';

// N8n
import { N8nService } from '../src/n8n/n8n.service';
import { N8nController } from '../src/n8n/n8n.controller';

// Notifications
import { NotificationsService } from '../src/notifications/notifications.service';

// Http for n8n
import { HttpModule } from '@nestjs/axios';

// ─── In-memory data stores ───────────────────────────────────────────────────

const seedPlugin: Plugin = {
  id: 'seed-plugin-uuid',
  slug: 'test-plugin',
  name: 'Test Plugin',
  description: 'A test plugin',
  icon: '🧪',
  category: 'utility',
  version: '1.0.0',
  entryFile: 'index.js',
  status: 'active',
  config: {},
  configSchema: [],
  actions: [],
  requiresPassword: false,
  lastRunAt: null as any,
  lastRunStatus: null as any,
  createdAt: new Date(),
  updatedAt: new Date(),
};

let pluginsStore: Plugin[] = [{ ...seedPlugin }];
let executionsStore: PluginExecution[] = [];
let schedulesStore: ScheduledJob[] = [];

function makePluginRepo() {
  return {
    find: jest.fn(() => Promise.resolve([...pluginsStore])),
    findOne: jest.fn(({ where }: { where: { id?: string; slug?: string } }) => {
      const found = pluginsStore.find(
        p => (where.id && p.id === where.id) || (where.slug && p.slug === where.slug),
      );
      return Promise.resolve(found ?? null);
    }),
    save: jest.fn((data: Partial<Plugin>) => {
      const plugin = { ...seedPlugin, ...data, id: data.id ?? `plugin-${Date.now()}`, createdAt: new Date(), updatedAt: new Date() } as Plugin;
      pluginsStore.push(plugin);
      return Promise.resolve(plugin);
    }),
    update: jest.fn((id: string, data: Partial<Plugin>) => {
      pluginsStore = pluginsStore.map(p => p.id === id ? { ...p, ...data } : p);
      return Promise.resolve({ affected: 1 });
    }),
    delete: jest.fn((id: string) => {
      pluginsStore = pluginsStore.filter(p => p.id !== id);
      return Promise.resolve({ affected: 1 });
    }),
    count: jest.fn(() => Promise.resolve(pluginsStore.length)),
  };
}

function makeExecutionRepo() {
  return {
    find: jest.fn((_opts?: any) => Promise.resolve([...executionsStore])),
    findOne: jest.fn(({ where }: { where: { id?: string; pluginId?: string } }) => {
      const found = executionsStore.find(e => e.id === where.id);
      return Promise.resolve(found ?? null);
    }),
    save: jest.fn((data: Partial<PluginExecution>) => {
      const exec = {
        id: `exec-${Date.now()}`,
        pluginId: data.pluginId ?? '',
        status: data.status ?? 'running',
        output: null,
        error: null,
        triggeredBy: data.triggeredBy ?? 'manual',
        durationMs: null,
        startedAt: new Date(),
        finishedAt: null,
        plugin: null,
        ...data,
      } as PluginExecution;
      executionsStore.push(exec);
      return Promise.resolve(exec);
    }),
    update: jest.fn((id: string, data: Partial<PluginExecution>) => {
      executionsStore = executionsStore.map(e => e.id === id ? { ...e, ...data } : e);
      return Promise.resolve({ affected: 1 });
    }),
    count: jest.fn(() => Promise.resolve(executionsStore.length)),
  };
}

function makeScheduleRepo() {
  return {
    find: jest.fn((_opts?: any) => Promise.resolve([...schedulesStore])),
    findOne: jest.fn(({ where }: { where: { id?: string } }) => {
      const found = schedulesStore.find(s => s.id === where.id);
      return Promise.resolve(found ?? null);
    }),
    save: jest.fn((data: Partial<ScheduledJob>) => {
      const job = {
        id: `schedule-${Date.now()}`,
        pluginId: data.pluginId ?? '',
        name: data.name ?? '',
        cron: data.cron ?? '',
        enabled: data.enabled ?? true,
        nextRunAt: null,
        lastRunAt: null,
        createdAt: new Date(),
        ...data,
      } as ScheduledJob;
      schedulesStore.push(job);
      return Promise.resolve(job);
    }),
    update: jest.fn((id: string, data: Partial<ScheduledJob>) => {
      schedulesStore = schedulesStore.map(s => s.id === id ? { ...s, ...data } : s);
      return Promise.resolve({ affected: 1 });
    }),
    delete: jest.fn((id: string) => {
      schedulesStore = schedulesStore.filter(s => s.id !== id);
      return Promise.resolve({ affected: 1 });
    }),
  };
}

function makeMockQueue() {
  return {
    add: jest.fn(() => Promise.resolve({ id: 'job-1' })),
    getRepeatableJobs: jest.fn(() => Promise.resolve([])),
    removeRepeatableByKey: jest.fn(() => Promise.resolve()),
    close: jest.fn(() => Promise.resolve()),
  };
}

// ─── Test App Module ──────────────────────────────────────────────────────────

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: false }),
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET') ?? 'fallback-secret',
        signOptions: { expiresIn: '7d' },
      }),
      inject: [ConfigService],
    }),
    HttpModule,
  ],
  controllers: [
    HealthController,
    AuthController,
    PluginsController,
    SchedulerController,
    DashboardController,
    N8nController,
  ],
  providers: [
    // Global JWT guard
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // Auth
    AuthService,
    JwtStrategy,
    // Services
    PluginsService,
    SchedulerService,
    DashboardService,
    N8nService,
    NotificationsService,
    // Mock repositories
    { provide: getRepositoryToken(Plugin), useFactory: makePluginRepo },
    { provide: getRepositoryToken(PluginExecution), useFactory: makeExecutionRepo },
    { provide: getRepositoryToken(ScheduledJob), useFactory: makeScheduleRepo },
    // Mock BullMQ queue
    { provide: getQueueToken('plugin-jobs'), useFactory: makeMockQueue },
  ],
})
class TestAppModule {}

// ─── Tests ────────────────────────────────────────────────────────────────────

const TEST_PLUGIN_DIR = path.join(require('os').tmpdir(), 'autohub-e2e-plugins');

describe('AutoHub E2E', () => {
  let app: INestApplication;
  let authToken: string;

  beforeAll(async () => {
    // Reset in-memory stores
    pluginsStore = [{ ...seedPlugin }];
    executionsStore = [];
    schedulesStore = [];

    // Ensure env vars are set for tests
    if (!process.env.ADMIN_PASSWORD) {
      process.env.ADMIN_PASSWORD = 'changeme';
    }
    if (!process.env.JWT_SECRET) {
      process.env.JWT_SECRET = 'test-jwt-secret-e2e';
    }
    // Point PLUGIN_DIR at a controlled temp dir so run() can resolve the file
    process.env.PLUGIN_DIR = TEST_PLUGIN_DIR;

    // Create the seed plugin file on disk so PluginsService.run() can resolve it
    const pluginDir = path.join(TEST_PLUGIN_DIR, seedPlugin.slug);
    fs.mkdirSync(pluginDir, { recursive: true });
    fs.writeFileSync(
      path.join(pluginDir, seedPlugin.entryFile),
      `exports.run = async function({ log }) { log('e2e test plugin ran'); return { ok: true }; };`,
    );

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [TestAppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
  }, 30_000);

  afterAll(async () => {
    await app.close();
    fs.rmSync(TEST_PLUGIN_DIR, { recursive: true, force: true });
  });

  // ─── Health ─────────────────────────────────────────────────────────────────

  describe('Health (public)', () => {
    it('GET /api/health returns 200 without a token', async () => {
      const res = await request(app.getHttpServer()).get('/api/health').expect(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.version).toBe('1.0.0');
      expect(res.body.nodeVersion).toBeDefined();
    });
  });

  // ─── Auth ────────────────────────────────────────────────────────────────────

  describe('Auth', () => {
    it('POST /api/auth/login with correct password returns access_token', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ password: process.env.ADMIN_PASSWORD ?? 'changeme' })
        .expect(200);
      expect(res.body.access_token).toBeDefined();
      authToken = res.body.access_token;
    });

    it('POST /api/auth/login with wrong password returns 401', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ password: 'definitely-wrong-password' })
        .expect(401);
    });
  });

  // ─── Protected routes ────────────────────────────────────────────────────────

  describe('Protected routes', () => {
    it('GET /api/dashboard without token returns 401', async () => {
      await request(app.getHttpServer()).get('/api/dashboard').expect(401);
    });

    it('GET /api/dashboard with valid token returns 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/dashboard')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      expect(res.body.stats).toBeDefined();
      expect(res.body.plugins).toBeDefined();
      expect(typeof res.body.stats.totalPlugins).toBe('number');
    });
  });

  // ─── Plugins ─────────────────────────────────────────────────────────────────

  describe('Plugins', () => {
    it('GET /api/plugins returns array', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/plugins')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('POST /api/plugins/:id/run creates an execution record', async () => {
      const pluginsRes = await request(app.getHttpServer())
        .get('/api/plugins')
        .set('Authorization', `Bearer ${authToken}`);

      if (pluginsRes.body.length === 0) {
        console.warn('No seed plugins found — skipping run test');
        return;
      }

      const pluginId = pluginsRes.body[0].id;
      const res = await request(app.getHttpServer())
        .post(`/api/plugins/${pluginId}/run`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(201);

      expect(res.body.pluginId).toBe(pluginId);
      expect(['running', 'success', 'failed']).toContain(res.body.status);
    });
  });

  // ─── Schedules ───────────────────────────────────────────────────────────────

  describe('Schedules', () => {
    let scheduleId: string;

    it('GET /api/schedules returns array', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/schedules')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('POST /api/schedules creates a schedule', async () => {
      const pluginsRes = await request(app.getHttpServer())
        .get('/api/plugins')
        .set('Authorization', `Bearer ${authToken}`);

      if (pluginsRes.body.length === 0) return;

      const res = await request(app.getHttpServer())
        .post('/api/schedules')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ pluginId: pluginsRes.body[0].id, name: 'E2E Test Schedule', cron: '0 9 * * *' })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.cron).toBe('0 9 * * *');
      scheduleId = res.body.id;
    });

    it('PATCH /api/schedules/:id/toggle changes enabled state', async () => {
      if (!scheduleId) return;
      const res = await request(app.getHttpServer())
        .patch(`/api/schedules/${scheduleId}/toggle`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      expect(typeof res.body.enabled).toBe('boolean');
    });

    it('DELETE /api/schedules/:id removes the schedule', async () => {
      if (!scheduleId) return;
      await request(app.getHttpServer())
        .delete(`/api/schedules/${scheduleId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
    });
  });

  // ─── n8n bridge ──────────────────────────────────────────────────────────────

  describe('n8n bridge', () => {
    it('GET /api/n8n/workflows returns 503 when N8N_API_KEY not set', async () => {
      if (process.env.N8N_API_KEY) return; // skip if key is set
      await request(app.getHttpServer())
        .get('/api/n8n/workflows')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(503);
    });
  });
});
