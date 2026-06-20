# Host Control Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `host-control` plugin with Reboot and Shutdown buttons that prompt for the dashboard admin password before running `nsenter` via Docker socket to control the Pi host OS.

**Architecture:** The `Plugin` entity gets two new columns (`actions`, `requiresPassword`). The `POST /api/plugins/:id/run` endpoint is extended to accept `{ action?, password? }` and validates the password against `ADMIN_PASSWORD` before calling the plugin function. The plugin itself makes raw HTTP requests to the Docker Unix socket to create a privileged alpine container running `nsenter`. On the frontend a new `ActionConfirmModal` collects the password, and `PluginCard` renders per-action buttons when `plugin.actions` is non-empty.

**Tech Stack:** NestJS + TypeORM (backend), React + Vitest + Testing Library (frontend), Node.js `http` module over Unix socket (plugin), PostgreSQL (migration via raw SQL)

## Global Constraints

- Backend test runner: `cd backend && npm test` — must stay green
- Frontend test runner: `cd frontend && npm test` — must stay green
- No new npm packages in frontend or backend
- Password is validated server-side against `process.env.ADMIN_PASSWORD`
- Wrong password → HTTP 403 `{ error: 'Invalid password' }` (exact shape)
- Plugin `index.js` uses only Node.js built-in `http` module — no npm dependencies
- `synchronize: false` in TypeORM — all schema changes require raw SQL migration
- Plugin files live in `backend/plugins/host-control/` (bind-mounted to `/app/plugins`)

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `backend/src/plugins/entities/plugin.entity.ts` | Modify | Add `PluginAction` interface + `actions` + `requiresPassword` columns |
| `backend/src/plugins/plugins.service.ts` | Modify | `run()` gains `action?: string` param; `upsertFromManifest()` reads new fields |
| `backend/src/plugins/plugins.controller.ts` | Modify | `run()` reads body `{action?,password?}`, validates password → 403 if wrong |
| `backend/src/plugins/plugins.service.spec.ts` | Modify | Tests for `upsertFromManifest` with new fields |
| `backend/plugins/host-control/manifest.json` | Create | Plugin metadata: slug, name, actions array, requiresPassword: true |
| `backend/plugins/host-control/index.js` | Create | Docker HTTP API over Unix socket → privileged alpine nsenter |
| `docker-compose.yml` | Modify | backend: add docker socket + group_add + bind-mount plugins dir |
| `frontend/src/lib/types.ts` | Modify | Add `PluginAction` type + `actions`/`requiresPassword` to `Plugin` interface |
| `frontend/src/lib/hooks/usePlugins.ts` | Modify | `useRunPlugin` accepts optional body `{action?,password?}` |
| `frontend/src/components/plugins/ActionConfirmModal.tsx` | Create | Password modal: action label, warning, password input, inline 403 error |
| `frontend/src/components/plugins/ActionConfirmModal.test.tsx` | Create | Vitest tests |
| `frontend/src/components/plugins/PluginCard.tsx` | Modify | Render per-action buttons when `plugin.actions.length > 0` |

---

### Task 1: Plugin entity — add `actions` and `requiresPassword` columns

**Files:**
- Modify: `backend/src/plugins/entities/plugin.entity.ts`
- Modify: `backend/src/plugins/plugins.service.ts` (upsertFromManifest only)
- Modify: `backend/src/plugins/plugins.service.spec.ts`

**Interfaces:**
- Produces: `PluginAction` interface (used in Tasks 4, 5, 6), `Plugin.actions: PluginAction[]`, `Plugin.requiresPassword: boolean`; `PluginsService.upsertFromManifest()` persists these fields

- [ ] **Step 1: Write failing tests for upsertFromManifest with new fields**

Add to `backend/src/plugins/plugins.service.spec.ts` inside the `describe('PluginsService')` block, after the existing tests:

```typescript
describe('upsertFromManifest', () => {
  afterEach(() => jest.clearAllMocks());

  it('persists actions and requiresPassword from manifest when plugin is new', async () => {
    mockPluginRepo.findOne.mockResolvedValueOnce(null);
    mockPluginRepo.save.mockResolvedValueOnce({});

    const manifest = {
      slug: 'host-control',
      name: 'Host Control',
      entryFile: 'index.js',
      actions: [{ key: 'reboot', label: 'Reboot', danger: true }],
      requiresPassword: true,
    };

    // Access private method via bracket notation for testing
    await (service as any).upsertFromManifest(manifest);

    expect(mockPluginRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        actions: [{ key: 'reboot', label: 'Reboot', danger: true }],
        requiresPassword: true,
      }),
    );
  });

  it('persists actions and requiresPassword when updating existing plugin', async () => {
    const existing = { id: 'abc', slug: 'host-control' };
    mockPluginRepo.findOne.mockResolvedValueOnce(existing);
    mockPluginRepo.update.mockResolvedValueOnce({});

    const manifest = {
      slug: 'host-control',
      name: 'Host Control',
      entryFile: 'index.js',
      actions: [{ key: 'shutdown', label: 'Shutdown', danger: true }],
      requiresPassword: true,
    };

    await (service as any).upsertFromManifest(manifest);

    expect(mockPluginRepo.update).toHaveBeenCalledWith(
      'abc',
      expect.objectContaining({
        actions: [{ key: 'shutdown', label: 'Shutdown', danger: true }],
        requiresPassword: true,
      }),
    );
  });

  it('defaults actions to [] and requiresPassword to false when not in manifest', async () => {
    mockPluginRepo.findOne.mockResolvedValueOnce(null);
    mockPluginRepo.save.mockResolvedValueOnce({});

    await (service as any).upsertFromManifest({
      slug: 'simple-plugin',
      name: 'Simple',
      entryFile: 'index.js',
    });

    expect(mockPluginRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ actions: [], requiresPassword: false }),
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /home/dama/repo/auto-hub/backend
npm test -- --passWithNoTests --testPathPattern="plugins.service"
```

Expected: 3 new tests FAIL — "actions" property not found on save/update call.

- [ ] **Step 3: Add `PluginAction` interface + columns to entity**

Replace the entire `backend/src/plugins/entities/plugin.entity.ts` with:

```typescript
import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

export type PluginStatus = 'active' | 'inactive' | 'error';

export interface ConfigSchemaItem {
  key: string;
  label: string;
  type: string;
  secret?: boolean;
  required?: boolean;
}

export interface PluginAction {
  key: string;
  label: string;
  danger?: boolean;
}

@Entity('plugins')
export class Plugin {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  slug: string;

  @Column()
  name: string;

  @Column({ default: '' })
  description: string;

  @Column({ default: '⚙️' })
  icon: string;

  @Column({ default: 'utility' })
  category: string;

  @Column({ default: '1.0.0' })
  version: string;

  @Column({ default: 'index.js' })
  entryFile: string;

  @Column({ type: 'varchar', default: 'inactive' })
  status: PluginStatus;

  @Column({ type: 'jsonb', default: {} })
  config: Record<string, unknown>;

  @Column({ type: 'jsonb', default: [] })
  configSchema: ConfigSchemaItem[];

  @Column({ type: 'jsonb', default: [] })
  actions: PluginAction[];

  @Column({ default: false })
  requiresPassword: boolean;

  @Column({ type: 'timestamp', nullable: true })
  lastRunAt: Date;

  @Column({ nullable: true })
  lastRunStatus: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

- [ ] **Step 4: Update `upsertFromManifest` to read new fields**

In `backend/src/plugins/plugins.service.ts`, find the `upsertFromManifest` private method and update the `fields` object to include the new properties. Replace the `private async upsertFromManifest(manifest: Record<string, unknown>)` method with:

```typescript
private async upsertFromManifest(manifest: Record<string, unknown>) {
  const slug = manifest.slug as string;
  const entryFile = (manifest.entryFile as string) ?? 'index.js';
  if (entryFile.includes('..') || path.isAbsolute(entryFile)) {
    throw new BadRequestException(`Invalid entryFile "${entryFile}": must be a relative path within the plugin directory`);
  }
  const existing = await this.pluginRepo.findOne({ where: { slug } });
  const fields = {
    name: manifest.name as string,
    description: (manifest.description as string) ?? '',
    icon: (manifest.icon as string) ?? '⚙️',
    category: (manifest.category as string) ?? 'utility',
    version: (manifest.version as string) ?? '1.0.0',
    entryFile,
    configSchema: (manifest.configSchema as any[]) ?? [],
    actions: (manifest.actions as any[]) ?? [],
    requiresPassword: (manifest.requiresPassword as boolean) ?? false,
  };
  if (existing) {
    await this.pluginRepo.update(existing.id, fields);
  } else {
    await this.pluginRepo.save({ slug, ...fields, status: 'inactive', config: {} });
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd /home/dama/repo/auto-hub/backend
npm test -- --passWithNoTests --testPathPattern="plugins.service"
```

Expected: All 8 tests PASS (5 original + 3 new).

- [ ] **Step 6: Run the DB migration to add columns**

```bash
docker compose exec postgres psql -U autohub autohub -c "
ALTER TABLE plugins ADD COLUMN IF NOT EXISTS actions jsonb NOT NULL DEFAULT '[]';
ALTER TABLE plugins ADD COLUMN IF NOT EXISTS \"requiresPassword\" boolean NOT NULL DEFAULT false;
"
```

Expected output:
```
ALTER TABLE
ALTER TABLE
```

- [ ] **Step 7: Commit**

```bash
git add backend/src/plugins/entities/plugin.entity.ts \
        backend/src/plugins/plugins.service.ts \
        backend/src/plugins/plugins.service.spec.ts
git commit -m "feat: add actions and requiresPassword columns to Plugin entity"
```

---

### Task 2: Password-gated run endpoint

**Files:**
- Modify: `backend/src/plugins/plugins.service.ts` (run method only)
- Modify: `backend/src/plugins/plugins.controller.ts`
- Modify: `backend/src/plugins/plugins.service.spec.ts`

**Interfaces:**
- Consumes: `Plugin.requiresPassword: boolean`, `Plugin.actions: PluginAction[]` from Task 1
- Produces: `PluginsService.run(id, triggeredBy, action?: string)` passes `action` to plugin fn; `POST /api/plugins/:id/run` with body `{ action?: string, password?: string }` → 403 if wrong password

- [ ] **Step 1: Write failing tests for password validation**

Add to `backend/src/plugins/plugins.service.spec.ts` inside the `describe('PluginsService')` block (after the `upsertFromManifest` describe block):

```typescript
describe('run', () => {
  afterEach(() => jest.clearAllMocks());

  it('passes action to plugin function context', async () => {
    const plugin = {
      id: '1', slug: 'host-control', entryFile: 'index.js',
      status: 'active', config: {}, requiresPassword: false,
    };
    mockPluginRepo.findOne.mockResolvedValue(plugin);
    mockExecutionRepo.save.mockResolvedValue({ id: 'exec-1', status: 'running' });
    mockExecutionRepo.update.mockResolvedValue({});
    mockPluginRepo.update.mockResolvedValue({});

    const mockFn = jest.fn().mockResolvedValue(undefined);
    // Point the service at a temp plugin dir with a real file
    const tmpDir = require('os').tmpdir();
    const pluginDir = require('path').join(tmpDir, 'test-plugins-action', 'host-control');
    require('fs').mkdirSync(pluginDir, { recursive: true });
    require('fs').writeFileSync(
      require('path').join(pluginDir, 'index.js'),
      `module.exports = async function(ctx) { global.__testCtx = ctx; }`,
    );

    const tmpService = new (require('./plugins.service').PluginsService)(
      mockPluginRepo,
      mockExecutionRepo,
      { get: () => require('path').join(tmpDir, 'test-plugins-action') },
      mockNotifications,
    );

    await tmpService.run('1', 'manual', 'reboot');
    expect((global as any).__testCtx?.action).toBe('reboot');
    delete (global as any).__testCtx;
  });
});
```

Now write the controller test. Add a new file `backend/src/plugins/plugins.controller.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { HttpException, HttpStatus } from '@nestjs/common';
import { PluginsController } from './plugins.controller';
import { PluginsService } from './plugins.service';

describe('PluginsController.run', () => {
  let controller: PluginsController;
  const mockService = {
    findOne: jest.fn(),
    run: jest.fn(),
  };

  beforeEach(async () => {
    process.env.ADMIN_PASSWORD = 'secret123';
    const module = await Test.createTestingModule({
      controllers: [PluginsController],
      providers: [{ provide: PluginsService, useValue: mockService }],
    }).compile();
    controller = module.get(PluginsController);
    jest.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.ADMIN_PASSWORD;
  });

  it('calls run without password check when requiresPassword is false', async () => {
    mockService.findOne.mockResolvedValue({ id: '1', requiresPassword: false });
    mockService.run.mockResolvedValue({ id: 'exec-1', status: 'success' });
    const result = await controller.run('1', {});
    expect(mockService.run).toHaveBeenCalledWith('1', 'manual', undefined);
    expect(result).toEqual({ id: 'exec-1', status: 'success' });
  });

  it('throws 403 when requiresPassword is true and password is missing', async () => {
    mockService.findOne.mockResolvedValue({ id: '1', requiresPassword: true });
    await expect(controller.run('1', {})).rejects.toMatchObject({
      response: { error: 'Invalid password' },
      status: 403,
    });
    expect(mockService.run).not.toHaveBeenCalled();
  });

  it('throws 403 when requiresPassword is true and password is wrong', async () => {
    mockService.findOne.mockResolvedValue({ id: '1', requiresPassword: true });
    await expect(controller.run('1', { password: 'wrong' })).rejects.toMatchObject({
      response: { error: 'Invalid password' },
      status: 403,
    });
  });

  it('calls run when requiresPassword is true and correct password provided', async () => {
    mockService.findOne.mockResolvedValue({ id: '1', requiresPassword: true });
    mockService.run.mockResolvedValue({ id: 'exec-1', status: 'success' });
    const result = await controller.run('1', { action: 'reboot', password: 'secret123' });
    expect(mockService.run).toHaveBeenCalledWith('1', 'manual', 'reboot');
    expect(result).toEqual({ id: 'exec-1', status: 'success' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /home/dama/repo/auto-hub/backend
npm test -- --passWithNoTests --testPathPattern="plugins\.(service|controller)"
```

Expected: controller tests FAIL (controller.run doesn't accept body yet), service `action` test FAIL.

- [ ] **Step 3: Update PluginsService.run() to accept and pass `action`**

In `backend/src/plugins/plugins.service.ts`, update the `run` method signature and the fn call. Find this block:

```typescript
async run(
  id: string,
  triggeredBy: 'manual' | 'scheduled' = 'manual',
): Promise<PluginExecution> {
```

Replace it with:

```typescript
async run(
  id: string,
  triggeredBy: 'manual' | 'scheduled' = 'manual',
  action?: string,
): Promise<PluginExecution> {
```

Then find this line in the same method:

```typescript
        await Promise.race([
          fn({ config: plugin.config, log }),
```

Replace with:

```typescript
        await Promise.race([
          fn({ config: plugin.config, log, action }),
```

- [ ] **Step 4: Update PluginsController.run() to read body and validate password**

Replace the contents of `backend/src/plugins/plugins.controller.ts` with:

```typescript
import {
  Controller, Get, Post, Patch, Param, Body, Query, HttpException, HttpStatus,
} from '@nestjs/common';
import { PluginsService } from './plugins.service';

@Controller('plugins')
export class PluginsController {
  constructor(private pluginsService: PluginsService) {}

  @Get()
  findAll() {
    return this.pluginsService.findAll();
  }

  // Static routes MUST come before :id routes to avoid NestJS matching them as id params
  @Get('executions')
  getAllExecutions(
    @Query('pluginId') pluginId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.pluginsService.getAllExecutions({ pluginId, from, to });
  }

  @Post('register')
  register(@Body() body: { slug: string }) {
    return this.pluginsService.registerFromManifest(body.slug);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.pluginsService.findOne(id);
  }

  @Post(':id/run')
  async run(
    @Param('id') id: string,
    @Body() body: { action?: string; password?: string } = {},
  ) {
    const plugin = await this.pluginsService.findOne(id);
    if (plugin.requiresPassword) {
      const adminPassword = process.env.ADMIN_PASSWORD;
      if (!adminPassword || body.password !== adminPassword) {
        throw new HttpException({ error: 'Invalid password' }, HttpStatus.FORBIDDEN);
      }
    }
    return this.pluginsService.run(id, 'manual', body.action);
  }

  @Patch(':id/config')
  updateConfig(
    @Param('id') id: string,
    @Body() body: { config: Record<string, unknown> },
  ) {
    return this.pluginsService.updateConfig(id, body.config);
  }

  @Post(':id/toggle')
  toggle(@Param('id') id: string) {
    return this.pluginsService.toggle(id);
  }

  @Get(':id/executions')
  getExecutions(@Param('id') id: string) {
    return this.pluginsService.getExecutions(id);
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd /home/dama/repo/auto-hub/backend
npm test -- --passWithNoTests --testPathPattern="plugins\.(service|controller)"
```

Expected: All tests PASS (including new controller tests and service action test).

- [ ] **Step 6: Run full backend test suite**

```bash
cd /home/dama/repo/auto-hub/backend && npm test
```

Expected: All tests PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/plugins/plugins.service.ts \
        backend/src/plugins/plugins.controller.ts \
        backend/src/plugins/plugins.service.spec.ts \
        backend/src/plugins/plugins.controller.spec.ts
git commit -m "feat: password-gated run endpoint and action forwarding in PluginsService"
```

---

### Task 3: Host-control plugin files + docker-compose

**Files:**
- Create: `backend/plugins/host-control/manifest.json`
- Create: `backend/plugins/host-control/index.js`
- Modify: `docker-compose.yml`

**Interfaces:**
- Consumes: `{ config, log, action }` context from Task 2's `run()` method
- Produces: Plugin discoverable at `/app/plugins/host-control/` in backend container; Docker socket accessible to backend

- [ ] **Step 1: Create plugin directory and manifest**

Create directory `backend/plugins/host-control/` and file `backend/plugins/host-control/manifest.json`:

```json
{
  "slug": "host-control",
  "name": "Host Control",
  "description": "Safely reboot or shut down the Raspberry Pi host",
  "version": "1.0.0",
  "category": "ops",
  "icon": "⚡",
  "entryFile": "index.js",
  "requiresPassword": true,
  "actions": [
    { "key": "reboot",   "label": "Reboot",   "danger": true },
    { "key": "shutdown", "label": "Shutdown",  "danger": true }
  ],
  "configSchema": []
}
```

- [ ] **Step 2: Create plugin index.js**

Create `backend/plugins/host-control/index.js`:

```js
const http = require('http');

function dockerRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = body != null ? JSON.stringify(body) : null;
    const req = http.request(
      {
        socketPath: '/var/run/docker.sock',
        method,
        path,
        headers: {
          'Content-Type': 'application/json',
          ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode, body: data });
          }
        });
      },
    );
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

module.exports = async function ({ log, action }) {
  const cmd = action === 'shutdown' ? 'poweroff' : 'reboot';
  log(`Initiating host ${cmd} via nsenter...`);

  const createRes = await dockerRequest('POST', '/containers/create', {
    Image: 'alpine',
    Cmd: ['nsenter', '-t', '1', '-m', '-u', '-i', '-n', '--', cmd],
    HostConfig: {
      Privileged: true,
      PidMode: 'host',
      AutoRemove: false,
    },
  });

  if (createRes.status !== 201) {
    throw new Error(`Failed to create container: ${JSON.stringify(createRes.body)}`);
  }

  const containerId = createRes.body.Id;
  log(`Container ${containerId.slice(0, 12)} created`);

  const startRes = await dockerRequest('POST', `/containers/${containerId}/start`, null);
  if (startRes.status !== 204) {
    throw new Error(`Failed to start container: ${JSON.stringify(startRes.body)}`);
  }
  log('Container started, waiting for nsenter to complete...');

  await dockerRequest('POST', `/containers/${containerId}/wait`, null);
  log('nsenter completed');

  await dockerRequest('DELETE', `/containers/${containerId}?force=true`, null);
  log(`Container removed. Host ${cmd} initiated.`);
};
```

- [ ] **Step 3: Update docker-compose.yml**

In `docker-compose.yml`, make these three changes to the `backend` service:

1. Change the plugins volume from named volume to bind-mount:
   - Find: `      - plugins_data:/app/plugins`
   - Replace with: `      - ./backend/plugins:/app/plugins`

2. Add Docker socket and group_add to backend. After the `volumes:` block under `backend`, add:
   ```yaml
       - /var/run/docker.sock:/var/run/docker.sock
   group_add:
     - "984"
   ```

3. Remove `plugins_data:` from the bottom `volumes:` section.

The full updated backend service block should look like:

```yaml
  backend:
    build: ./backend
    environment:
      DATABASE_URL: postgresql://autohub:${POSTGRES_PASSWORD}@postgres:5432/autohub
      REDIS_URL: redis://redis:6379
      ADMIN_PASSWORD: ${ADMIN_PASSWORD}
      JWT_SECRET: ${JWT_SECRET}
      TELEGRAM_BOT_TOKEN: ${TELEGRAM_BOT_TOKEN}
      TELEGRAM_CHAT_ID: ${TELEGRAM_CHAT_ID}
      N8N_API_KEY: ${N8N_API_KEY}
      N8N_URL: http://n8n:5678
      PLUGIN_DIR: /app/plugins
      TIMEZONE: ${TIMEZONE}
      TERMINAL_DIRS: /workspace/data,/workspace/github,/workspace/auto-hub
    volumes:
      - ./backend/plugins:/app/plugins
      - /var/run/docker.sock:/var/run/docker.sock
    group_add:
      - "984"
    depends_on:
      - postgres
      - redis
    restart: unless-stopped
```

And the `volumes:` section at the bottom becomes:

```yaml
volumes:
  postgres_data:
  n8n_data:
```

- [ ] **Step 4: Verify manifest JSON is valid**

```bash
cd /home/dama/repo/auto-hub
node -e "JSON.parse(require('fs').readFileSync('backend/plugins/host-control/manifest.json', 'utf8')); console.log('OK')"
```

Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add backend/plugins/host-control/manifest.json \
        backend/plugins/host-control/index.js \
        docker-compose.yml
git commit -m "feat: add host-control plugin files and wire docker socket to backend"
```

---

### Task 4: Frontend — Plugin type + useRunPlugin hook

**Files:**
- Modify: `frontend/src/lib/types.ts`
- Modify: `frontend/src/lib/hooks/usePlugins.ts`

**Interfaces:**
- Produces: `PluginAction` type; `Plugin.actions: PluginAction[]`, `Plugin.requiresPassword: boolean`; `useRunPlugin().mutateAsync` accepts `{ id: string, action?: string, password?: string }`

- [ ] **Step 1: Add PluginAction + update Plugin interface in types.ts**

In `frontend/src/lib/types.ts`, find the `Plugin` interface and add two fields. Also add the `PluginAction` interface above `Plugin`.

After the `ConfigSchemaItem` interface (around line 14), add:

```typescript
export interface PluginAction {
  key: string
  label: string
  danger?: boolean
}
```

Then inside the `Plugin` interface, after `configSchema: ConfigSchemaItem[]`, add:

```typescript
  actions: PluginAction[]
  requiresPassword: boolean
```

- [ ] **Step 2: Update useRunPlugin to accept optional body**

In `frontend/src/lib/hooks/usePlugins.ts`, replace the `useRunPlugin` function (lines 52–65) with:

```typescript
export function useRunPlugin() {
  const queryClient = useQueryClient()
  return useMutation<PluginExecution, Error, { id: string; action?: string; password?: string }>({
    mutationFn: async ({ id, action, password }) => {
      const { data } = await api.post(`/api/plugins/${id}/run`, { action, password })
      return data
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['plugins'] })
      queryClient.invalidateQueries({ queryKey: ['executions', id] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}
```

- [ ] **Step 3: Fix the existing PluginCard handleRun call**

`PluginCard.tsx` currently calls `runPlugin.mutateAsync(plugin.id)`. This must be updated to match the new signature `{ id }`. Open `frontend/src/components/plugins/PluginCard.tsx` and replace:

```typescript
      const result = await runPlugin.mutateAsync(plugin.id)
```

with:

```typescript
      const result = await runPlugin.mutateAsync({ id: plugin.id })
```

- [ ] **Step 4: Run frontend tests**

```bash
cd /home/dama/repo/auto-hub/frontend && npm test
```

Expected: All tests PASS (type changes are additive; existing tests unaffected).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/types.ts \
        frontend/src/lib/hooks/usePlugins.ts \
        frontend/src/components/plugins/PluginCard.tsx
git commit -m "feat: add PluginAction type and extend useRunPlugin to accept action body"
```

---

### Task 5: ActionConfirmModal component

**Files:**
- Create: `frontend/src/components/plugins/ActionConfirmModal.tsx`
- Create: `frontend/src/components/plugins/ActionConfirmModal.test.tsx`

**Interfaces:**
- Consumes: `PluginAction` from Task 4; `useRunPlugin` from Task 4 (accepts `{id, action, password}`)
- Produces: `ActionConfirmModal` component with props `{ pluginId: string, action: PluginAction, onClose: () => void }`

- [ ] **Step 1: Write failing tests**

Create `frontend/src/components/plugins/ActionConfirmModal.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ActionConfirmModal from './ActionConfirmModal'
import type { PluginAction } from '@/lib/types'
import * as usePluginsModule from '@/lib/hooks/usePlugins'
import { ToastProvider } from '@/components/ui/Toast'

const rebootAction: PluginAction = { key: 'reboot', label: 'Reboot', danger: true }

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <QueryClientProvider client={qc}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  )
}

describe('ActionConfirmModal', () => {
  it('renders action label in heading', () => {
    vi.spyOn(usePluginsModule, 'useRunPlugin').mockReturnValue({
      mutateAsync: vi.fn(), isPending: false,
    } as any)
    render(
      <Wrapper>
        <ActionConfirmModal pluginId="p1" action={rebootAction} onClose={() => {}} />
      </Wrapper>
    )
    expect(screen.getByRole('heading', { name: /Reboot Pi\?/i })).toBeInTheDocument()
  })

  it('shows warning text', () => {
    vi.spyOn(usePluginsModule, 'useRunPlugin').mockReturnValue({
      mutateAsync: vi.fn(), isPending: false,
    } as any)
    render(
      <Wrapper>
        <ActionConfirmModal pluginId="p1" action={rebootAction} onClose={() => {}} />
      </Wrapper>
    )
    expect(screen.getByText(/immediately restart the host/i)).toBeInTheDocument()
  })

  it('calls onClose when Cancel is clicked', () => {
    vi.spyOn(usePluginsModule, 'useRunPlugin').mockReturnValue({
      mutateAsync: vi.fn(), isPending: false,
    } as any)
    const onClose = vi.fn()
    render(
      <Wrapper>
        <ActionConfirmModal pluginId="p1" action={rebootAction} onClose={onClose} />
      </Wrapper>
    )
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('calls mutateAsync with pluginId, action key, and password on confirm', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({ status: 'success' })
    vi.spyOn(usePluginsModule, 'useRunPlugin').mockReturnValue({
      mutateAsync, isPending: false,
    } as any)
    render(
      <Wrapper>
        <ActionConfirmModal pluginId="p1" action={rebootAction} onClose={() => {}} />
      </Wrapper>
    )
    fireEvent.change(screen.getByPlaceholderText(/dashboard password/i), {
      target: { value: 'mysecret' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^Reboot$/i }))
    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith({
        id: 'p1',
        action: 'reboot',
        password: 'mysecret',
      })
    })
  })

  it('shows inline "Wrong password" error on 403 response', async () => {
    const mutateAsync = vi.fn().mockRejectedValue({
      response: { status: 403, data: { error: 'Invalid password' } },
    })
    vi.spyOn(usePluginsModule, 'useRunPlugin').mockReturnValue({
      mutateAsync, isPending: false,
    } as any)
    render(
      <Wrapper>
        <ActionConfirmModal pluginId="p1" action={rebootAction} onClose={() => {}} />
      </Wrapper>
    )
    fireEvent.change(screen.getByPlaceholderText(/dashboard password/i), {
      target: { value: 'wrong' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^Reboot$/i }))
    await waitFor(() => {
      expect(screen.getByText(/wrong password/i)).toBeInTheDocument()
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /home/dama/repo/auto-hub/frontend
npm test -- ActionConfirmModal
```

Expected: FAIL — component file not found.

- [ ] **Step 3: Implement ActionConfirmModal**

Create `frontend/src/components/plugins/ActionConfirmModal.tsx`:

```typescript
'use client'
import { useState } from 'react'
import { useRunPlugin } from '@/lib/hooks/usePlugins'
import { useToast } from '@/components/ui/Toast'
import type { PluginAction } from '@/lib/types'

interface Props {
  pluginId: string
  action: PluginAction
  onClose: () => void
}

export default function ActionConfirmModal({ pluginId, action, onClose }: Props) {
  const [password, setPassword] = useState('')
  const [wrongPassword, setWrongPassword] = useState(false)
  const runPlugin = useRunPlugin()
  const toast = useToast()

  const warningText =
    action.key === 'shutdown'
      ? 'This will immediately shut down the host. You will need physical access to turn it back on.'
      : 'This will immediately restart the host. All active terminal sessions will be lost.'

  const handleConfirm = async () => {
    setWrongPassword(false)
    try {
      const result = await runPlugin.mutateAsync({ id: pluginId, action: action.key, password })
      if (result.status === 'success') {
        toast.success(`${action.label} command sent`)
        onClose()
      } else {
        toast.error(`${action.label} failed`)
        onClose()
      }
    } catch (err: any) {
      if (err?.response?.status === 403) {
        setWrongPassword(true)
      } else {
        toast.error(`Failed to run ${action.label}`)
        onClose()
      }
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-6 w-full max-w-sm flex flex-col gap-4">
        <h2 className="text-white font-semibold text-base">{action.label} Pi?</h2>
        <p className="text-[#9ca3af] text-sm">{warningText}</p>

        <div className="flex flex-col gap-1.5">
          <input
            type="password"
            placeholder="Dashboard password"
            value={password}
            onChange={e => { setPassword(e.target.value); setWrongPassword(false) }}
            onKeyDown={e => { if (e.key === 'Enter') void handleConfirm() }}
            className="w-full px-3 py-2 text-sm bg-[#0a0a0a] border border-[#2a2a2a] rounded-md text-white placeholder:text-[#4b5563] focus:outline-none focus:border-[#3b82f6]"
            autoFocus
          />
          {wrongPassword && (
            <p className="text-[#ef4444] text-xs">Wrong password</p>
          )}
        </div>

        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            disabled={runPlugin.isPending}
            className="px-4 py-2 text-xs border border-[#2a2a2a] text-[#9ca3af] rounded-md hover:border-[#3b82f6] hover:text-[#f1f1f1] transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => void handleConfirm()}
            disabled={runPlugin.isPending || !password}
            className={`px-4 py-2 text-xs text-white rounded-md transition-colors disabled:opacity-50 ${
              action.danger
                ? 'bg-[#ef4444] hover:bg-[#dc2626]'
                : 'bg-[#3b82f6] hover:bg-[#2563eb]'
            }`}
          >
            {runPlugin.isPending ? 'Running…' : action.label}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /home/dama/repo/auto-hub/frontend
npm test -- ActionConfirmModal
```

Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/plugins/ActionConfirmModal.tsx \
        frontend/src/components/plugins/ActionConfirmModal.test.tsx
git commit -m "feat: add ActionConfirmModal with password input and inline 403 error"
```

---

### Task 6: PluginCard — per-action buttons

**Files:**
- Modify: `frontend/src/components/plugins/PluginCard.tsx`
- Create: `frontend/src/components/plugins/PluginCard.test.tsx`

**Interfaces:**
- Consumes: `Plugin.actions: PluginAction[]`, `ActionConfirmModal` from Task 5; `useRunPlugin` signature from Task 4

- [ ] **Step 1: Write failing tests**

Create `frontend/src/components/plugins/PluginCard.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import PluginCard from './PluginCard'
import type { Plugin } from '@/lib/types'
import * as usePluginsModule from '@/lib/hooks/usePlugins'
import { ToastProvider } from '@/components/ui/Toast'

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <QueryClientProvider client={qc}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  )
}

const basePlugin: Plugin = {
  id: 'p1', slug: 'test-plugin', name: 'Test Plugin', description: 'A test',
  icon: '⚙️', category: 'utility', version: '1.0.0', entryFile: 'index.js',
  status: 'active', config: {}, configSchema: [], actions: [], requiresPassword: false,
  lastRunAt: null, lastRunStatus: null, createdAt: '2024-01-01', updatedAt: '2024-01-01',
}

describe('PluginCard', () => {
  beforeEach(() => {
    vi.spyOn(usePluginsModule, 'useRunPlugin').mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ status: 'success' }),
      isPending: false,
    } as any)
  })

  it('shows "Run now" button when plugin has no actions', () => {
    render(<Wrapper><PluginCard plugin={basePlugin} /></Wrapper>)
    expect(screen.getByRole('button', { name: /run now/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /reboot/i })).not.toBeInTheDocument()
  })

  it('hides "Run now" and shows action buttons when plugin.actions is non-empty', () => {
    const plugin: Plugin = {
      ...basePlugin,
      actions: [
        { key: 'reboot', label: 'Reboot', danger: true },
        { key: 'shutdown', label: 'Shutdown', danger: true },
      ],
      requiresPassword: true,
    }
    render(<Wrapper><PluginCard plugin={plugin} /></Wrapper>)
    expect(screen.queryByRole('button', { name: /run now/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Reboot$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Shutdown$/i })).toBeInTheDocument()
  })

  it('opens ActionConfirmModal when an action button is clicked', () => {
    const plugin: Plugin = {
      ...basePlugin,
      actions: [{ key: 'reboot', label: 'Reboot', danger: true }],
      requiresPassword: true,
    }
    render(<Wrapper><PluginCard plugin={plugin} /></Wrapper>)
    fireEvent.click(screen.getByRole('button', { name: /^Reboot$/i }))
    expect(screen.getByRole('heading', { name: /Reboot Pi\?/i })).toBeInTheDocument()
  })

  it('applies red style to danger action buttons', () => {
    const plugin: Plugin = {
      ...basePlugin,
      actions: [{ key: 'reboot', label: 'Reboot', danger: true }],
    }
    render(<Wrapper><PluginCard plugin={plugin} /></Wrapper>)
    const btn = screen.getByRole('button', { name: /^Reboot$/i })
    expect(btn.className).toContain('bg-[#ef4444]')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /home/dama/repo/auto-hub/frontend
npm test -- PluginCard
```

Expected: tests about action buttons FAIL (PluginCard doesn't render them yet).

- [ ] **Step 3: Update PluginCard.tsx to render action buttons and modal**

Replace the full contents of `frontend/src/components/plugins/PluginCard.tsx`:

```typescript
'use client'
import { useState } from 'react'
import { Play, Settings2, Clock } from 'lucide-react'
import ConfigModal from './ConfigModal'
import ScheduleModal from './ScheduleModal'
import ActionConfirmModal from './ActionConfirmModal'
import { useRunPlugin } from '@/lib/hooks/usePlugins'
import { useToast } from '@/components/ui/Toast'
import { formatDistanceToNow } from 'date-fns'
import type { Plugin, PluginAction } from '@/lib/types'
import {
  ClipboardList, Server, Wrench, TrendingUp, DollarSign, Puzzle,
  type LucideIcon,
} from 'lucide-react'

const categoryMeta: Record<string, { icon: LucideIcon; bg: string; fg: string }> = {
  productivity: { icon: ClipboardList, bg: 'bg-[#3b82f6]/10', fg: 'text-[#3b82f6]' },
  ops:          { icon: Server,        bg: 'bg-[#8b5cf6]/10', fg: 'text-[#8b5cf6]' },
  utility:      { icon: Wrench,        bg: 'bg-[#6b7280]/10', fg: 'text-[#9ca3af]' },
  marketing:    { icon: TrendingUp,    bg: 'bg-[#f59e0b]/10', fg: 'text-[#f59e0b]' },
  finance:      { icon: DollarSign,    bg: 'bg-[#22c55e]/10', fg: 'text-[#22c55e]' },
}
const defaultMeta = { icon: Puzzle, bg: 'bg-[#6b7280]/10', fg: 'text-[#9ca3af]' }

export default function PluginCard({ plugin }: { plugin: Plugin }) {
  const [configOpen, setConfigOpen] = useState(false)
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [pendingAction, setPendingAction] = useState<PluginAction | null>(null)
  const runPlugin = useRunPlugin()
  const toast = useToast()

  const handleRun = async () => {
    try {
      const result = await runPlugin.mutateAsync({ id: plugin.id })
      if (result.status === 'success') {
        toast.success(`${plugin.name} ran successfully`)
      } else if (result.status === 'failed') {
        toast.error(`${plugin.name} failed: ${result.error ?? 'Unknown error'}`)
      } else {
        toast.info(`${plugin.name} is running`)
      }
    } catch {
      toast.error(`Failed to run ${plugin.name}`)
    }
  }

  const meta = categoryMeta[plugin.category] ?? defaultMeta
  const CategoryIcon = meta.icon

  return (
    <>
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-4 flex flex-col gap-3 hover:border-[#3b82f6]/40 transition-colors">
        <div className="flex items-center gap-2">
          <div className={`p-1.5 rounded-md ${meta.bg}`}>
            <CategoryIcon size={16} className={meta.fg} />
          </div>
          <div>
            <h3 className="text-white font-medium text-sm">{plugin.name}</h3>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${meta.bg} ${meta.fg}`}>
              {plugin.category}
            </span>
          </div>
        </div>

        <p className="text-[#6b7280] text-xs leading-relaxed line-clamp-2">
          {plugin.description || 'No description.'}
        </p>

        <div className="text-xs text-[#6b7280]">
          {plugin.lastRunAt ? (
            <span>
              Last run:{' '}
              <span className={plugin.lastRunStatus === 'failed' ? 'text-[#ef4444]' : 'text-[#9ca3af]'}>
                {formatDistanceToNow(new Date(plugin.lastRunAt), { addSuffix: true })}
              </span>
            </span>
          ) : (
            <span>Never run</span>
          )}
        </div>

        <div className="flex gap-2 flex-wrap pt-1 border-t border-[#2a2a2a]">
          {plugin.actions.length > 0 ? (
            plugin.actions.map(action => (
              <button
                key={action.key}
                onClick={() => setPendingAction(action)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs text-white rounded-md transition-colors ${
                  action.danger
                    ? 'bg-[#ef4444] hover:bg-[#dc2626]'
                    : 'bg-[#3b82f6] hover:bg-[#2563eb]'
                }`}
              >
                {action.label}
              </button>
            ))
          ) : (
            <button
              onClick={handleRun}
              disabled={runPlugin.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[#3b82f6] text-white rounded-md hover:bg-[#2563eb] disabled:opacity-50 transition-colors"
              data-testid={`run-plugin-${plugin.id}`}
            >
              <Play size={12} />
              {runPlugin.isPending ? 'Running…' : 'Run now'}
            </button>
          )}

          {plugin.configSchema.length > 0 && (
            <button
              onClick={() => setConfigOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-[#2a2a2a] text-[#9ca3af] rounded-md hover:border-[#3b82f6] hover:text-[#f1f1f1] transition-colors"
            >
              <Settings2 size={12} />
              Configure
            </button>
          )}

          <button
            onClick={() => setScheduleOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-[#2a2a2a] text-[#9ca3af] rounded-md hover:border-[#3b82f6] hover:text-[#f1f1f1] transition-colors"
          >
            <Clock size={12} />
            Schedule
          </button>
        </div>
      </div>

      {configOpen && (
        <ConfigModal plugin={plugin} isOpen={configOpen} onClose={() => setConfigOpen(false)} />
      )}
      {scheduleOpen && (
        <ScheduleModal plugin={plugin} isOpen={scheduleOpen} onClose={() => setScheduleOpen(false)} />
      )}
      {pendingAction && (
        <ActionConfirmModal
          pluginId={plugin.id}
          action={pendingAction}
          onClose={() => setPendingAction(null)}
        />
      )}
    </>
  )
}
```

- [ ] **Step 4: Run PluginCard tests**

```bash
cd /home/dama/repo/auto-hub/frontend
npm test -- PluginCard
```

Expected: All 4 tests PASS.

- [ ] **Step 5: Run full frontend test suite**

```bash
cd /home/dama/repo/auto-hub/frontend && npm test
```

Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/plugins/PluginCard.tsx \
        frontend/src/components/plugins/PluginCard.test.tsx
git commit -m "feat: render per-action buttons in PluginCard and open ActionConfirmModal"
```

---

### Task 7: Deploy and verify

- [ ] **Step 1: Rebuild and restart the backend container**

```bash
cd /home/dama/repo/auto-hub
docker compose up -d --build backend
```

Expected: backend container rebuilds and starts. The `scanPlugins()` call on startup should find `host-control` in `/app/plugins/host-control/manifest.json` and register it in the DB.

- [ ] **Step 2: Verify plugin was registered**

```bash
docker compose exec backend wget -qO- 'http://localhost:4000/health' | grep -o '"status":"ok"'
docker compose exec postgres psql -U autohub autohub -c "SELECT slug, name, \"requiresPassword\", actions FROM plugins WHERE slug = 'host-control';"
```

Expected:
```
"status":"ok"
    slug     |     name     | requiresPassword |                     actions
-------------+--------------+------------------+--------------------------------------------------
 host-control | Host Control | t               | [{"key":"reboot","label":"Reboot","danger":true},...]
```

- [ ] **Step 3: Rebuild frontend**

```bash
docker compose up -d --build frontend
```

- [ ] **Step 4: Verify in the browser**

Navigate to the Plugins page. The Host Control plugin card should show two red buttons ("Reboot" and "Shutdown") instead of the "Run now" button. Clicking either should open a modal requesting the dashboard password.

- [ ] **Step 5: Commit deploy verification**

No files changed — this is a manual verification step. Skip commit.

---

## Self-Review

**Spec coverage:**
- ✅ `host-control` plugin with Reboot + Shutdown actions (Task 3)
- ✅ `requiresPassword: true`, `actions` array in manifest (Task 3, Step 1)
- ✅ Password validated server-side against `ADMIN_PASSWORD` env var (Task 2)
- ✅ 403 `{ error: 'Invalid password' }` on wrong password (Task 2, Task 5)
- ✅ Docker socket via Unix socket http module (Task 3, Step 2)
- ✅ `nsenter -t 1 -m -u -i -n -- reboot|poweroff` inside privileged alpine (Task 3, Step 2)
- ✅ `ActionConfirmModal` with password input + inline error (Task 5)
- ✅ Per-action buttons in PluginCard when `plugin.actions.length > 0` (Task 6)
- ✅ Danger actions get red style (Task 6)
- ✅ Docker socket + group_add 984 in backend docker-compose (Task 3, Step 3)
- ✅ DB migration for new columns (Task 1, Step 6)
- ✅ Bind-mount `./backend/plugins:/app/plugins` (Task 3, Step 3)

**Placeholder scan:** None found — all code blocks are complete.

**Type consistency:**
- `PluginAction` defined in Task 1 (entity) and Task 4 (frontend types) — both use `{ key, label, danger? }` shape
- `useRunPlugin.mutateAsync({ id, action?, password? })` defined in Task 4, consumed in Tasks 5 and 6 (via ActionConfirmModal which calls `{ id: pluginId, action: action.key, password }`)
- `PluginsService.run(id, triggeredBy, action?)` defined in Task 2, consumed only via controller
