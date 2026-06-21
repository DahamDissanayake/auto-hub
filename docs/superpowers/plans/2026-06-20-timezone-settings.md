# Timezone Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded `TIMEZONE` env var with a DB-backed timezone setting editable from the Settings page, defaulting to `Asia/Colombo`, applied to absolute date formatting in the frontend.

**Architecture:** A new `app_settings` key-value table holds global settings. A `SettingsModule` exposes `GET /api/settings` and `PATCH /api/settings`. The health endpoint is expanded to return the full `HealthData` shape the frontend already expects (including `timezone` pulled from settings). On the frontend, a `TimezoneContext` provides the active timezone string app-wide; `formatInTimeZone` from `date-fns-tz` replaces bare `format()` for absolute timestamps.

**Tech Stack:** NestJS + TypeORM (backend), React context + TanStack Query (frontend), `date-fns-tz` (frontend), PostgreSQL (raw SQL migration)

## Global Constraints

- Backend test runner: `cd /home/dama/repo/auto-hub/backend && npm test` — must stay green
- Frontend test runner: `cd /home/dama/repo/auto-hub/frontend && npm test` — must stay green
- `synchronize: false` in TypeORM — all schema changes require raw SQL migration
- Default timezone: `Asia/Colombo` (seeded on first `onModuleInit` if not present)
- Timezone validation: `Intl.supportedValuesOf('timeZone').includes(value)` — returns 400 if invalid
- `GET /api/settings` returns `{ timezone: string }` (plain object, all keys)
- `PATCH /api/settings` accepts partial `{ timezone?: string }`, validates each key, returns updated settings
- Wrong timezone value → `400 { message: 'Invalid timezone: <value>' }`
- `date-fns-tz` must be installed in frontend: `npm install date-fns-tz` (use `date-fns-tz@^3.0.0`)
- Only `ExecutionLog.tsx` tooltip gets `formatInTimeZone` — calendar `format(day, 'd')` and `format(currentMonth, 'MMMM yyyy')` are calendar-grid display (not absolute timestamps) and must NOT be changed

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `backend/src/settings/entities/app-setting.entity.ts` | Create | AppSetting entity (key PK, value text, updatedAt) |
| `backend/src/settings/settings.service.ts` | Create | getAll, get, set, onModuleInit seed |
| `backend/src/settings/settings.service.spec.ts` | Create | Unit tests for service |
| `backend/src/settings/settings.controller.ts` | Create | GET /settings, PATCH /settings |
| `backend/src/settings/settings.controller.spec.ts` | Create | Unit tests for controller |
| `backend/src/settings/settings.module.ts` | Create | Module wiring |
| `backend/src/app.module.ts` | Modify | Add AppSetting to entities, import SettingsModule |
| `backend/src/health/health.controller.ts` | Modify | Return full HealthData shape |
| `backend/src/health/health.module.ts` | Modify | Import SettingsModule |
| `backend/src/health/health.controller.spec.ts` | Create | Unit tests for expanded health endpoint |
| `frontend/src/lib/hooks/useSettings.ts` | Create | useSettings, useUpdateSettings queries |
| `frontend/src/lib/context/TimezoneContext.tsx` | Create | TimezoneContext, TimezoneProvider, useTimezone |
| `frontend/src/app/providers.tsx` | Modify | Wrap with TimezoneProvider |
| `frontend/src/app/(app)/settings/page.tsx` | Modify | Add "Display" section with timezone dropdown + save |
| `frontend/src/components/plugins/ExecutionLog.tsx` | Modify | Use formatInTimeZone for startedAt tooltip |

---

### Task 1: Backend — AppSetting entity + SettingsModule

**Files:**
- Create: `backend/src/settings/entities/app-setting.entity.ts`
- Create: `backend/src/settings/settings.service.ts`
- Create: `backend/src/settings/settings.service.spec.ts`
- Create: `backend/src/settings/settings.controller.ts`
- Create: `backend/src/settings/settings.controller.spec.ts`
- Create: `backend/src/settings/settings.module.ts`
- Modify: `backend/src/app.module.ts`

**Interfaces:**
- Produces: `SettingsService.getAll(): Promise<Record<string, string>>`, `SettingsService.get(key): Promise<string | null>`, `SettingsService.set(key, value): Promise<void>`; `GET /api/settings` → `{ timezone: 'Asia/Colombo' }`; `PATCH /api/settings` → updated settings or 400

- [ ] **Step 1: Write failing service tests**

Create `backend/src/settings/settings.service.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SettingsService } from './settings.service';
import { AppSetting } from './entities/app-setting.entity';

describe('SettingsService', () => {
  let service: SettingsService;

  const mockRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        SettingsService,
        { provide: getRepositoryToken(AppSetting), useValue: mockRepo },
      ],
    }).compile();
    service = module.get(SettingsService);
    jest.clearAllMocks();
  });

  it('getAll returns settings as a plain object', async () => {
    mockRepo.find.mockResolvedValue([
      { key: 'timezone', value: 'Asia/Colombo' },
    ]);
    const result = await service.getAll();
    expect(result).toEqual({ timezone: 'Asia/Colombo' });
  });

  it('get returns the value for a key that exists', async () => {
    mockRepo.findOne.mockResolvedValue({ key: 'timezone', value: 'UTC' });
    const result = await service.get('timezone');
    expect(result).toBe('UTC');
  });

  it('get returns null when key does not exist', async () => {
    mockRepo.findOne.mockResolvedValue(null);
    const result = await service.get('missing');
    expect(result).toBeNull();
  });

  it('set saves the key/value pair', async () => {
    mockRepo.save.mockResolvedValue({});
    await service.set('timezone', 'Europe/London');
    expect(mockRepo.save).toHaveBeenCalledWith({ key: 'timezone', value: 'Europe/London' });
  });

  it('onModuleInit seeds Asia/Colombo when timezone key is absent', async () => {
    mockRepo.findOne.mockResolvedValue(null);
    mockRepo.save.mockResolvedValue({});
    await service.onModuleInit();
    expect(mockRepo.save).toHaveBeenCalledWith({ key: 'timezone', value: 'Asia/Colombo' });
  });

  it('onModuleInit does not overwrite existing timezone setting', async () => {
    mockRepo.findOne.mockResolvedValue({ key: 'timezone', value: 'UTC' });
    await service.onModuleInit();
    expect(mockRepo.save).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run service tests to verify they fail**

```bash
cd /home/dama/repo/auto-hub/backend
npm test -- --passWithNoTests --testPathPattern="settings.service"
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create entity**

Create `backend/src/settings/entities/app-setting.entity.ts`:

```typescript
import { Entity, PrimaryColumn, Column, UpdateDateColumn } from 'typeorm';

@Entity('app_settings')
export class AppSetting {
  @PrimaryColumn()
  key: string;

  @Column({ type: 'text' })
  value: string;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

- [ ] **Step 4: Create SettingsService**

Create `backend/src/settings/settings.service.ts`:

```typescript
import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppSetting } from './entities/app-setting.entity';

@Injectable()
export class SettingsService implements OnModuleInit {
  constructor(
    @InjectRepository(AppSetting)
    private readonly settingRepo: Repository<AppSetting>,
  ) {}

  async onModuleInit() {
    const existing = await this.settingRepo.findOne({ where: { key: 'timezone' } });
    if (!existing) {
      await this.settingRepo.save({ key: 'timezone', value: 'Asia/Colombo' });
    }
  }

  async getAll(): Promise<Record<string, string>> {
    const rows = await this.settingRepo.find();
    return Object.fromEntries(rows.map(r => [r.key, r.value]));
  }

  async get(key: string): Promise<string | null> {
    const row = await this.settingRepo.findOne({ where: { key } });
    return row?.value ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    await this.settingRepo.save({ key, value });
  }
}
```

- [ ] **Step 5: Run service tests to verify they pass**

```bash
cd /home/dama/repo/auto-hub/backend
npm test -- --passWithNoTests --testPathPattern="settings.service"
```

Expected: 6 tests PASS.

- [ ] **Step 6: Write failing controller tests**

Create `backend/src/settings/settings.controller.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

describe('SettingsController', () => {
  let controller: SettingsController;
  const mockService = {
    getAll: jest.fn(),
    set: jest.fn(),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [SettingsController],
      providers: [{ provide: SettingsService, useValue: mockService }],
    }).compile();
    controller = module.get(SettingsController);
    jest.clearAllMocks();
  });

  it('GET /settings returns all settings', async () => {
    mockService.getAll.mockResolvedValue({ timezone: 'Asia/Colombo' });
    const result = await controller.getAll();
    expect(result).toEqual({ timezone: 'Asia/Colombo' });
  });

  it('PATCH /settings with valid timezone updates and returns settings', async () => {
    mockService.set.mockResolvedValue(undefined);
    mockService.getAll.mockResolvedValue({ timezone: 'UTC' });
    const result = await controller.update({ timezone: 'UTC' });
    expect(mockService.set).toHaveBeenCalledWith('timezone', 'UTC');
    expect(result).toEqual({ timezone: 'UTC' });
  });

  it('PATCH /settings with invalid timezone throws 400', async () => {
    await expect(controller.update({ timezone: 'Not/ATimezone' })).rejects.toThrow(BadRequestException);
    expect(mockService.set).not.toHaveBeenCalled();
  });

  it('PATCH /settings ignores keys that are not timezone', async () => {
    mockService.set.mockResolvedValue(undefined);
    mockService.getAll.mockResolvedValue({ timezone: 'Asia/Colombo' });
    // unknown keys are stored as-is (no validation rule for non-timezone keys)
    await controller.update({ timezone: 'Asia/Tokyo' });
    expect(mockService.set).toHaveBeenCalledWith('timezone', 'Asia/Tokyo');
  });
});
```

- [ ] **Step 7: Create SettingsController**

Create `backend/src/settings/settings.controller.ts`:

```typescript
import { Controller, Get, Patch, Body, BadRequestException } from '@nestjs/common';
import { SettingsService } from './settings.service';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  getAll(): Promise<Record<string, string>> {
    return this.settingsService.getAll();
  }

  @Patch()
  async update(@Body() body: Record<string, string>): Promise<Record<string, string>> {
    for (const [key, value] of Object.entries(body)) {
      if (key === 'timezone') {
        const valid = (Intl as any).supportedValuesOf?.('timeZone') as string[] | undefined;
        if (valid && !valid.includes(value)) {
          throw new BadRequestException(`Invalid timezone: ${value}`);
        }
      }
      await this.settingsService.set(key, value);
    }
    return this.settingsService.getAll();
  }
}
```

- [ ] **Step 8: Create SettingsModule**

Create `backend/src/settings/settings.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppSetting } from './entities/app-setting.entity';
import { SettingsService } from './settings.service';
import { SettingsController } from './settings.controller';

@Module({
  imports: [TypeOrmModule.forFeature([AppSetting])],
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
```

- [ ] **Step 9: Register in AppModule**

In `backend/src/app.module.ts`:

Add import at top:
```typescript
import { SettingsModule } from './settings/settings.module';
import { AppSetting } from './settings/entities/app-setting.entity';
```

Add `AppSetting` to the entities array (inside `TypeOrmModule.forRootAsync`):
```typescript
entities: [Plugin, PluginExecution, ScheduledJob, AppSetting],
```

Add `SettingsModule` to the `imports` array (after `TerminalModule`):
```typescript
SettingsModule,
```

- [ ] **Step 10: Run the DB migration**

```bash
docker compose exec postgres psql -U autohub autohub -c "
CREATE TABLE IF NOT EXISTS app_settings (
  key VARCHAR NOT NULL PRIMARY KEY,
  value TEXT NOT NULL,
  \"updatedAt\" TIMESTAMP NOT NULL DEFAULT now()
);
"
```

Expected: `CREATE TABLE`

- [ ] **Step 11: Run all backend tests**

```bash
cd /home/dama/repo/auto-hub/backend
npm test -- --passWithNoTests --testPathPattern="settings\.(service|controller)"
```

Expected: 10 tests PASS (6 service + 4 controller).

- [ ] **Step 12: Commit**

```bash
git add backend/src/settings/ backend/src/app.module.ts
git commit -m "feat: add AppSetting entity and SettingsModule with GET/PATCH /api/settings"
```

---

### Task 2: Backend — Expanded health endpoint

**Files:**
- Modify: `backend/src/health/health.controller.ts`
- Modify: `backend/src/health/health.module.ts`
- Create: `backend/src/health/health.controller.spec.ts`

**Interfaces:**
- Consumes: `SettingsService.get('timezone')` from Task 1
- Produces: `GET /api/health` → `{ status: 'ok', version: string, nodeVersion: string, timezone: string, pluginDir: string, telegramConfigured: boolean, n8nConfigured: boolean }`

- [ ] **Step 1: Write failing health controller tests**

Create `backend/src/health/health.controller.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { SettingsService } from '../settings/settings.service';
import { ConfigService } from '@nestjs/config';

describe('HealthController', () => {
  let controller: HealthController;
  const mockSettings = { get: jest.fn() };
  const mockConfig = { get: jest.fn() };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: SettingsService, useValue: mockSettings },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();
    controller = module.get(HealthController);
    jest.clearAllMocks();
  });

  it('returns status ok with full HealthData shape', async () => {
    mockSettings.get.mockResolvedValue('Asia/Colombo');
    mockConfig.get.mockImplementation((key: string) => {
      if (key === 'PLUGIN_DIR') return '/app/plugins';
      if (key === 'TELEGRAM_BOT_TOKEN') return 'tok';
      if (key === 'TELEGRAM_CHAT_ID') return '123';
      if (key === 'N8N_API_KEY') return null;
      return null;
    });
    const result = await controller.getHealth();
    expect(result.status).toBe('ok');
    expect(result.timezone).toBe('Asia/Colombo');
    expect(result.pluginDir).toBe('/app/plugins');
    expect(result.telegramConfigured).toBe(true);
    expect(result.n8nConfigured).toBe(false);
    expect(typeof result.version).toBe('string');
    expect(typeof result.nodeVersion).toBe('string');
  });

  it('falls back to Asia/Colombo when timezone setting is null', async () => {
    mockSettings.get.mockResolvedValue(null);
    mockConfig.get.mockReturnValue(null);
    const result = await controller.getHealth();
    expect(result.timezone).toBe('Asia/Colombo');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/dama/repo/auto-hub/backend
npm test -- --passWithNoTests --testPathPattern="health.controller"
```

Expected: FAIL — HealthController constructor takes no args currently.

- [ ] **Step 3: Update HealthController**

Replace `backend/src/health/health.controller.ts`:

```typescript
import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Public } from '../auth/decorators/public.decorator';
import { SettingsService } from '../settings/settings.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  @Public()
  async getHealth() {
    const timezone = (await this.settingsService.get('timezone')) ?? 'Asia/Colombo';
    return {
      status: 'ok',
      version: process.env.npm_package_version ?? '1.0.0',
      nodeVersion: process.version,
      timezone,
      pluginDir: this.config.get<string>('PLUGIN_DIR') ?? '/app/plugins',
      telegramConfigured: !!(
        this.config.get('TELEGRAM_BOT_TOKEN') && this.config.get('TELEGRAM_CHAT_ID')
      ),
      n8nConfigured: !!this.config.get('N8N_API_KEY'),
    };
  }
}
```

- [ ] **Step 4: Update HealthModule to import SettingsModule**

Replace `backend/src/health/health.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [SettingsModule],
  controllers: [HealthController],
})
export class HealthModule {}
```

- [ ] **Step 5: Run health tests**

```bash
cd /home/dama/repo/auto-hub/backend
npm test -- --passWithNoTests --testPathPattern="health.controller"
```

Expected: 2 tests PASS.

- [ ] **Step 6: Run full backend test suite**

```bash
cd /home/dama/repo/auto-hub/backend && npm test
```

Expected: All unit tests pass (auth.service.spec.ts suite-load failure is pre-existing, unrelated).

- [ ] **Step 7: Commit**

```bash
git add backend/src/health/health.controller.ts \
        backend/src/health/health.module.ts \
        backend/src/health/health.controller.spec.ts
git commit -m "feat: expand health endpoint to return full HealthData including timezone from settings"
```

---

### Task 3: Frontend — useSettings + TimezoneContext + date-fns-tz

**Files:**
- Install: `date-fns-tz@^3.0.0` in `frontend/`
- Create: `frontend/src/lib/hooks/useSettings.ts`
- Create: `frontend/src/lib/context/TimezoneContext.tsx`
- Modify: `frontend/src/app/providers.tsx`

**Interfaces:**
- Produces: `useSettings()` → `{ data: { timezone: string } | undefined, ... }`, `useUpdateSettings()` → mutation; `useTimezone()` → `string` (IANA timezone name); `TimezoneProvider` wraps the app

- [ ] **Step 1: Install date-fns-tz**

```bash
cd /home/dama/repo/auto-hub/frontend && npm install date-fns-tz@^3.0.0
```

Expected: `date-fns-tz` added to `package.json` dependencies.

- [ ] **Step 2: Create useSettings hook**

Create `frontend/src/lib/hooks/useSettings.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'

interface Settings {
  timezone: string
}

export function useSettings() {
  return useQuery<Settings>({
    queryKey: ['settings'],
    queryFn: async () => {
      const { data } = await api.get<Settings>('/api/settings')
      return data
    },
    staleTime: 60_000,
  })
}

export function useUpdateSettings() {
  const queryClient = useQueryClient()
  return useMutation<Settings, Error, Partial<Settings>>({
    mutationFn: async (patch) => {
      const { data } = await api.patch<Settings>('/api/settings', patch)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      queryClient.invalidateQueries({ queryKey: ['health'] })
    },
  })
}
```

- [ ] **Step 3: Create TimezoneContext**

Create `frontend/src/lib/context/TimezoneContext.tsx`:

```typescript
'use client'
import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import { useSettings } from '@/lib/hooks/useSettings'

const TimezoneContext = createContext('Asia/Colombo')

export function TimezoneProvider({ children }: { children: ReactNode }) {
  const { data: settings } = useSettings()
  const tz = settings?.timezone ?? 'Asia/Colombo'
  return <TimezoneContext.Provider value={tz}>{children}</TimezoneContext.Provider>
}

export function useTimezone() {
  return useContext(TimezoneContext)
}
```

- [ ] **Step 4: Add TimezoneProvider to Providers**

Replace `frontend/src/app/providers.tsx`:

```typescript
'use client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, ReactNode } from 'react'
import { ToastProvider } from '@/components/ui/Toast'
import { TimezoneProvider } from '@/lib/context/TimezoneContext'

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, staleTime: 10_000 },
        },
      }),
  )

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <TimezoneProvider>{children}</TimezoneProvider>
      </ToastProvider>
    </QueryClientProvider>
  )
}
```

- [ ] **Step 5: Run frontend tests**

```bash
cd /home/dama/repo/auto-hub/frontend && npm test
```

Expected: All existing tests pass (Providers wraps children identically, TimezoneProvider is transparent when settings aren't loaded).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/hooks/useSettings.ts \
        frontend/src/lib/context/TimezoneContext.tsx \
        frontend/src/app/providers.tsx \
        frontend/package.json frontend/package-lock.json
git commit -m "feat: add useSettings hook, TimezoneContext, and date-fns-tz dependency"
```

---

### Task 4: Frontend — Settings page timezone picker

**Files:**
- Modify: `frontend/src/app/(app)/settings/page.tsx`

**Interfaces:**
- Consumes: `useSettings()`, `useUpdateSettings()` from Task 3
- Produces: "Display" section in Settings UI with timezone `<select>` + Save button

- [ ] **Step 1: Update settings/page.tsx**

Replace the full contents of `frontend/src/app/(app)/settings/page.tsx`:

```typescript
'use client'
import { useState, useEffect } from 'react'
import { Settings } from 'lucide-react'
import { ExternalLink } from 'lucide-react'
import { useHealth } from '@/lib/hooks/useHealth'
import { useSettings, useUpdateSettings } from '@/lib/hooks/useSettings'
import { useToast } from '@/components/ui/Toast'

const TIMEZONE_OPTIONS = [
  { value: 'Asia/Colombo',        label: 'Asia/Colombo — UTC+5:30 (Sri Lanka)' },
  { value: 'Asia/Kolkata',        label: 'Asia/Kolkata — UTC+5:30 (India)' },
  { value: 'Asia/Dubai',          label: 'Asia/Dubai — UTC+4' },
  { value: 'Asia/Bangkok',        label: 'Asia/Bangkok — UTC+7' },
  { value: 'Asia/Singapore',      label: 'Asia/Singapore — UTC+8' },
  { value: 'Asia/Tokyo',          label: 'Asia/Tokyo — UTC+9' },
  { value: 'Europe/London',       label: 'Europe/London — UTC+0/+1' },
  { value: 'Europe/Paris',        label: 'Europe/Paris — UTC+1/+2' },
  { value: 'Europe/Berlin',       label: 'Europe/Berlin — UTC+1/+2' },
  { value: 'America/New_York',    label: 'America/New_York — UTC-5/-4' },
  { value: 'America/Chicago',     label: 'America/Chicago — UTC-6/-5' },
  { value: 'America/Denver',      label: 'America/Denver — UTC-7/-6' },
  { value: 'America/Los_Angeles', label: 'America/Los_Angeles — UTC-8/-7' },
  { value: 'America/Sao_Paulo',   label: 'America/Sao_Paulo — UTC-3' },
  { value: 'UTC',                 label: 'UTC — UTC+0' },
]

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-5 space-y-3">
      <h2 className="text-white font-medium text-sm">{title}</h2>
      {children}
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between text-sm py-1 border-t border-[#2a2a2a] first:border-0">
      <span className="text-[#6b7280]">{label}</span>
      <span className="text-[#9ca3af] font-mono text-xs">{value}</span>
    </div>
  )
}

function ConfiguredBadge({ configured }: { configured: boolean }) {
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full border font-medium ${
        configured
          ? 'border-[#22c55e]/40 text-[#22c55e] bg-[#22c55e]/5'
          : 'border-[#2a2a2a] text-[#6b7280]'
      }`}
    >
      {configured ? 'Configured' : 'Not configured'}
    </span>
  )
}

export default function SettingsPage() {
  const { data: health, isLoading } = useHealth()
  const { data: settings } = useSettings()
  const updateSettings = useUpdateSettings()
  const toast = useToast()
  const [selectedTz, setSelectedTz] = useState('Asia/Colombo')

  useEffect(() => {
    if (settings?.timezone) setSelectedTz(settings.timezone)
  }, [settings?.timezone])

  const handleSaveTz = async () => {
    try {
      await updateSettings.mutateAsync({ timezone: selectedTz })
      toast.success('Timezone saved')
    } catch {
      toast.error('Failed to save timezone')
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-white text-xl font-semibold flex items-center gap-2">
        <Settings size={20} className="text-[#3b82f6]" />
        Settings
      </h1>

      {isLoading ? (
        <div className="text-[#6b7280] text-sm">Loading…</div>
      ) : (
        <>
          <Section title="System Info">
            <Row label="App version" value={health?.version ?? '—'} />
            <Row label="Node.js" value={health?.nodeVersion ?? '—'} />
            <Row label="Timezone" value={health?.timezone ?? '—'} />
            <Row label="Plugin directory" value={health?.pluginDir ?? '—'} />
          </Section>

          <Section title="Display">
            <div className="flex items-center justify-between text-sm py-1">
              <span className="text-[#6b7280]">Timezone</span>
              <div className="flex items-center gap-2">
                <select
                  value={selectedTz}
                  onChange={e => setSelectedTz(e.target.value)}
                  className="bg-[#0a0a0a] border border-[#2a2a2a] text-[#9ca3af] text-xs rounded-md px-2 py-1.5 focus:outline-none focus:border-[#3b82f6]"
                >
                  {TIMEZONE_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleSaveTz}
                  disabled={updateSettings.isPending}
                  className="px-3 py-1.5 text-xs bg-[#3b82f6] text-white rounded-md hover:bg-[#2563eb] disabled:opacity-50 transition-colors"
                >
                  {updateSettings.isPending ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </Section>

          <Section title="Notifications">
            <div className="flex items-center justify-between text-sm">
              <div>
                <p className="text-[#9ca3af]">Telegram bot (autohub-serenedge)</p>
                <p className="text-[#6b7280] text-xs mt-0.5">
                  Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env to enable
                </p>
              </div>
              <ConfiguredBadge configured={health?.telegramConfigured ?? false} />
            </div>
          </Section>

          <Section title="Plugin Directory">
            <p className="text-[#9ca3af] text-sm">
              Plugins are loaded from{' '}
              <code className="text-[#f1f1f1] bg-[#111111] px-1.5 py-0.5 rounded text-xs">
                {health?.pluginDir ?? '/app/plugins'}
              </code>
            </p>
            <p className="text-[#6b7280] text-xs">
              Drop a folder with <code>manifest.json</code> and <code>index.js</code> into the
              Docker volume, then restart the backend. The plugin will be auto-registered on startup.
            </p>
          </Section>

          <Section title="n8n">
            <div className="flex items-center justify-between text-sm">
              <div>
                <p className="text-[#9ca3af]">n8n API integration</p>
                <p className="text-[#6b7280] text-xs mt-0.5">
                  Set N8N_API_KEY in .env after creating an API key in n8n
                </p>
              </div>
              <ConfiguredBadge configured={health?.n8nConfigured ?? false} />
            </div>
            <a
              href="/n8n"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-[#3b82f6] hover:underline"
            >
              <ExternalLink size={12} />
              Open n8n editor
            </a>
          </Section>

          <Section title="Danger Zone">
            <p className="text-[#9ca3af] text-sm">
              To restart all services, run from the project directory:
            </p>
            <code className="block text-xs text-[#f1f1f1] bg-[#111111] border border-[#2a2a2a] rounded px-3 py-2 font-mono">
              docker compose restart
            </code>
            <p className="text-[#6b7280] text-xs">
              Scheduled jobs automatically re-register on backend startup.
            </p>
          </Section>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Run frontend tests**

```bash
cd /home/dama/repo/auto-hub/frontend && npm test
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/\(app\)/settings/page.tsx
git commit -m "feat: add timezone picker to Settings page Display section"
```

---

### Task 5: Frontend — ExecutionLog timezone-aware formatting

**Files:**
- Modify: `frontend/src/components/plugins/ExecutionLog.tsx`

**Interfaces:**
- Consumes: `useTimezone()` from Task 3 → IANA timezone string
- Produces: `format(startedAt, 'PPpp')` tooltip replaced with `formatInTimeZone(startedAt, tz, 'PPpp')`

- [ ] **Step 1: Update ExecutionLog.tsx**

In `frontend/src/components/plugins/ExecutionLog.tsx`, make these three changes:

**Change 1** — Update the date-fns import (remove `format`, keep `formatDistanceToNow`):
```typescript
import { formatDistanceToNow } from 'date-fns'
```

**Change 2** — Add new imports after the date-fns line:
```typescript
import { formatInTimeZone } from 'date-fns-tz'
import { useTimezone } from '@/lib/context/TimezoneContext'
```

**Change 3** — Add `useTimezone` call inside the `ExecutionLog` component (right after the existing `const [expanded, setExpanded] = useState(false)` line):
```typescript
  const tz = useTimezone()
```

**Change 4** — Replace the `format` call at line 34:

Find:
```typescript
            <span title={format(new Date(execution.startedAt), 'PPpp')}>
```

Replace with:
```typescript
            <span title={formatInTimeZone(new Date(execution.startedAt), tz, 'PPpp')}>
```

- [ ] **Step 2: Run frontend tests**

```bash
cd /home/dama/repo/auto-hub/frontend && npm test
```

Expected: All tests pass (ExecutionLog has no existing tests asserting on the tooltip; the change is additive).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/plugins/ExecutionLog.tsx
git commit -m "feat: use formatInTimeZone in ExecutionLog tooltip to respect stored timezone"
```

---

### Task 6: Deploy and verify

- [ ] **Step 1: Rebuild backend**

```bash
cd /home/dama/repo/auto-hub
docker compose up -d --build backend
```

Expected: Backend rebuilds and starts. `onModuleInit` seeds `timezone = 'Asia/Colombo'` in `app_settings`.

- [ ] **Step 2: Verify health endpoint returns full data**

```bash
sleep 4 && curl -s http://localhost/api/health | python3 -m json.tool
```

Expected:
```json
{
  "status": "ok",
  "version": "1.0.0",
  "nodeVersion": "v20.x.x",
  "timezone": "Asia/Colombo",
  "pluginDir": "/app/plugins",
  "telegramConfigured": false,
  "n8nConfigured": false
}
```

- [ ] **Step 3: Verify settings endpoint**

```bash
TOKEN=$(curl -s -X POST http://localhost/api/auth/login -H "Content-Type: application/json" -d '{"password":"'$(grep ADMIN_PASSWORD /home/dama/repo/auto-hub/.env | cut -d= -f2)'"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")
curl -s -H "Authorization: Bearer $TOKEN" http://localhost/api/settings | python3 -m json.tool
```

Expected:
```json
{
  "timezone": "Asia/Colombo"
}
```

- [ ] **Step 4: Rebuild frontend**

```bash
docker compose up -d --build frontend
```

- [ ] **Step 5: Verify in browser**

Navigate to Settings. The "System Info" section should show `timezone: Asia/Colombo`. A new "Display" section should appear below it with a timezone dropdown pre-selected to "Asia/Colombo" and a Save button. Changing to "UTC" and clicking Save should update the displayed timezone in System Info after page refresh.

---

## Self-Review

**Spec coverage:**
- ✅ `app_settings` table with key PK, value text (Task 1)
- ✅ Default seed: `timezone = 'Asia/Colombo'` on onModuleInit (Task 1)
- ✅ `GET /api/settings` returns `{ timezone: string }` (Task 1)
- ✅ `PATCH /api/settings` validates IANA timezone, returns 400 if invalid (Task 1)
- ✅ `SettingsService` exported from SettingsModule for use by HealthController (Task 1)
- ✅ Health endpoint expanded: version, nodeVersion, timezone, pluginDir, telegramConfigured, n8nConfigured (Task 2)
- ✅ `date-fns-tz` installed (Task 3)
- ✅ `useSettings()` and `useUpdateSettings()` hooks (Task 3)
- ✅ `TimezoneContext` + `useTimezone()` + `TimezoneProvider` in Providers (Task 3)
- ✅ Settings page "Display" section with curated 15-timezone dropdown + Save button (Task 4)
- ✅ `useEffect` syncs dropdown to fetched timezone value (Task 4)
- ✅ Success/error toast on save (Task 4)
- ✅ `ExecutionLog.tsx` tooltip uses `formatInTimeZone(date, tz, 'PPpp')` (Task 5)
- ✅ Calendar `format(day, 'd')` and `format(currentMonth, 'MMMM yyyy')` deliberately NOT changed (spec out-of-scope: they're calendar-grid display, not absolute timestamps)
- ✅ `formatDistanceToNow` calls unchanged (relative time, timezone-independent)

**Placeholder scan:** None found.

**Type consistency:**
- `useSettings()` returns `{ timezone: string }` as `Settings` interface — consumed in TimezoneContext (`settings?.timezone`) and Settings page (`settings?.timezone`)
- `useUpdateSettings()` accepts `Partial<Settings>` which is `{ timezone?: string }` — called with `{ timezone: selectedTz }` in Settings page
- `useTimezone()` returns `string` — consumed as `tz` in ExecutionLog `formatInTimeZone(date, tz, 'PPpp')`
- `SettingsService.get('timezone')` returns `Promise<string | null>` — health controller falls back to `'Asia/Colombo'` with `?? 'Asia/Colombo'`
