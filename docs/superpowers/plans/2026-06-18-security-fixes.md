# AutoHub Security Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all 8 confirmed security vulnerabilities and bugs found in the code review.

**Architecture:** Backend fixes are isolated to individual service/controller/config files. Frontend fixes touch the API client, auth shell, and one page component. No new modules are created except `@nestjs/throttler` for rate limiting.

**Tech Stack:** NestJS 10, TypeScript, Next.js 14, nginx

## Global Constraints

- No `Co-Authored-By` lines in any commit message.
- All commits go on the current branch; push to `main` at the end of the final task.
- Do not run `npm install` in the `frontend/` directory unless a task explicitly requires it.
- All backend changes must preserve existing passing unit tests (`cd backend && npm test`).
- Keep commits small and focused — one commit per task.

---

### Task 1: Path Traversal Guard in PluginsService

**Files:**
- Modify: `backend/src/plugins/plugins.service.ts`

**What this fixes:** `plugin.slug` and `plugin.entryFile` come from the database (originally from manifest.json). A malicious manifest with `slug: "../../etc"` or `entryFile: "../../../proc/self/environ"` would cause `path.join(pluginDir, slug, entryFile)` to escape the plugin directory, then `require()` would execute that arbitrary path.

**Interfaces:**
- No interface changes. `run()` and `registerFromManifest()` keep the same signatures.

- [ ] **Step 1: Add `BadRequestException` to imports and add path guard helper**

In `backend/src/plugins/plugins.service.ts`, change the import on line 1:

```typescript
import {
  Injectable, NotFoundException, BadRequestException, OnModuleInit, Logger,
} from '@nestjs/common';
```

Then add this private method inside the `PluginsService` class (after the constructor, before `onModuleInit`):

```typescript
private assertPathWithinPluginDir(resolvedPath: string): void {
  const resolvedBase = path.resolve(this.pluginDir) + path.sep;
  if (!resolvedPath.startsWith(resolvedBase)) {
    throw new BadRequestException('Plugin path escapes the plugin directory');
  }
}
```

- [ ] **Step 2: Guard the `run()` method**

Replace the path construction at the top of `run()` (lines 101–101):

```typescript
// BEFORE
const pluginPath = path.join(this.pluginDir, plugin.slug, plugin.entryFile);

// AFTER
const pluginPath = path.resolve(this.pluginDir, plugin.slug, plugin.entryFile);
this.assertPathWithinPluginDir(pluginPath);
```

- [ ] **Step 3: Validate slug in `registerFromManifest()`**

Add slug validation at the top of `registerFromManifest()` (before the `manifestPath` line):

```typescript
async registerFromManifest(slug: string): Promise<Plugin> {
  if (!/^[a-zA-Z0-9_-]+$/.test(slug)) {
    throw new BadRequestException(`Invalid plugin slug "${slug}": only alphanumeric, hyphens and underscores allowed`);
  }
  const manifestPath = path.join(this.pluginDir, slug, 'manifest.json');
  // ... rest unchanged
```

- [ ] **Step 4: Run backend unit tests to confirm no regressions**

```bash
cd backend && npm test -- --passWithNoTests 2>&1 | tail -10
```

Expected: all suites pass, no test failures.

- [ ] **Step 5: Commit**

```bash
git add backend/src/plugins/plugins.service.ts
git commit -m "fix: guard against plugin path traversal in require() and registerFromManifest"
```

---

### Task 2: Remove Hardcoded JWT Secret Fallbacks

**Files:**
- Modify: `backend/src/auth/strategies/jwt.strategy.ts`
- Modify: `backend/src/auth/auth.module.ts`

**What this fixes:** Both files contain `?? 'fallback-secret'`. If `JWT_SECRET` is not set (fresh deploy without .env), the app silently uses the public string `'fallback-secret'`, allowing anyone who read the source code to forge valid JWTs.

**Interfaces:** No interface changes.

- [ ] **Step 1: Throw on missing secret in `jwt.strategy.ts`**

Replace the entire constructor body in `backend/src/auth/strategies/jwt.strategy.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    const secret = config.get<string>('JWT_SECRET');
    if (!secret) throw new Error('JWT_SECRET environment variable is required');
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: { sub: string }) {
    return { userId: payload.sub };
  }
}
```

- [ ] **Step 2: Throw on missing secret in `auth.module.ts`**

Replace the `useFactory` inside `JwtModule.registerAsync` in `backend/src/auth/auth.module.ts`:

```typescript
useFactory: (config: ConfigService) => {
  const secret = config.get<string>('JWT_SECRET');
  if (!secret) throw new Error('JWT_SECRET environment variable is required');
  return { secret, signOptions: { expiresIn: '7d' } };
},
```

- [ ] **Step 3: Run unit tests**

```bash
cd backend && npm test 2>&1 | tail -10
```

Expected: all suites pass.

- [ ] **Step 4: Commit**

```bash
git add backend/src/auth/strategies/jwt.strategy.ts backend/src/auth/auth.module.ts
git commit -m "fix: throw on missing JWT_SECRET instead of using hardcoded fallback"
```

---

### Task 3: Rate Limiting on Login Endpoint

**Files:**
- Modify: `backend/package.json` (add `@nestjs/throttler`)
- Modify: `backend/src/app.module.ts`
- Modify: `backend/src/auth/auth.controller.ts`

**What this fixes:** The login endpoint (`POST /api/auth/login`) has no rate limiting. An attacker can brute-force thousands of password attempts per second with no delay or lockout.

**Interfaces:** No interface changes.

- [ ] **Step 1: Install `@nestjs/throttler`**

```bash
cd backend && npm install @nestjs/throttler
```

Expected: package added to `node_modules` and `package.json` dependencies.

- [ ] **Step 2: Register `ThrottlerModule` in `app.module.ts`**

Add the import at the top of `backend/src/app.module.ts`:

```typescript
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
```

Add `ThrottlerModule` to the `imports` array (after `ConfigModule.forRoot`):

```typescript
ThrottlerModule.forRoot([{
  ttl: 60_000,
  limit: 10,
}]),
```

Add `ThrottlerGuard` to the `providers` array (alongside the existing `APP_GUARD`):

```typescript
providers: [
  { provide: APP_GUARD, useClass: JwtAuthGuard },
  { provide: APP_GUARD, useClass: ThrottlerGuard },
],
```

- [ ] **Step 3: Mark the login endpoint with a tighter throttle**

In `backend/src/auth/auth.controller.ts`, add the import and decorator:

```typescript
import { Controller, Post, Body } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  login(@Body() body: { password: string }) {
    return this.authService.login(body.password);
  }
}
```

This allows 5 login attempts per minute per IP, overriding the global 10/min default.

- [ ] **Step 4: Run unit tests**

```bash
cd backend && npm test 2>&1 | tail -10
```

Expected: all suites pass.

- [ ] **Step 5: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/src/app.module.ts backend/src/auth/auth.controller.ts
git commit -m "fix: add rate limiting to login endpoint (5 attempts per minute per IP)"
```

---

### Task 4: Fix Wildcard CORS

**Files:**
- Modify: `backend/src/main.ts`
- Modify: `.env.example`

**What this fixes:** `origin: '*'` allows any website to read API responses in a browser. Restricting to the known frontend origin prevents cross-origin data leakage.

**Interfaces:** No interface changes.

- [ ] **Step 1: Update `main.ts` CORS config**

Replace the `enableCors` call in `backend/src/main.ts`:

```typescript
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  app.enableCors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:3000',
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    credentials: true,
  });
  await app.listen(process.env.PORT ?? 4000);
  console.log(`AutoHub backend running on port ${process.env.PORT ?? 4000}`);
}
bootstrap();
```

- [ ] **Step 2: Document the new env var in `.env.example`**

Add after the `DOMAIN=` line in `.env.example`:

```
FRONTEND_URL=http://localhost:3000
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/main.ts .env.example
git commit -m "fix: restrict CORS to FRONTEND_URL instead of wildcard origin"
```

---

### Task 5: Validate n8n Workflow IDs

**Files:**
- Modify: `backend/src/n8n/n8n.service.ts`

**What this fixes:** Workflow `id` parameters are interpolated directly into n8n API URLs. An attacker can pass `id='../credentials'` to reach unintended n8n internal endpoints through the AutoHub proxy.

**Interfaces:** No interface changes.

- [ ] **Step 1: Add `BadRequestException` to imports and add a validator**

Replace the imports and add a private validator in `backend/src/n8n/n8n.service.ts`:

```typescript
import { Injectable, ServiceUnavailableException, BadRequestException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class N8nService {
  private readonly n8nUrl: string;
  private readonly apiKey: string;

  constructor(
    private httpService: HttpService,
    private config: ConfigService,
  ) {
    this.n8nUrl = config.get<string>('N8N_URL') ?? 'http://n8n:5678';
    this.apiKey = config.get<string>('N8N_API_KEY') ?? '';
  }

  private checkApiKey() {
    if (!this.apiKey) {
      throw new ServiceUnavailableException('N8N_API_KEY not configured');
    }
  }

  private validateWorkflowId(id: string): void {
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
      throw new BadRequestException(`Invalid workflow id: "${id}"`);
    }
  }

  private get headers() {
    return { 'X-N8N-API-KEY': this.apiKey };
  }

  async getWorkflows() {
    this.checkApiKey();
    const { data } = await firstValueFrom(
      this.httpService.get(`${this.n8nUrl}/api/v1/workflows`, { headers: this.headers }),
    );
    return data;
  }

  async getWorkflow(id: string) {
    this.checkApiKey();
    this.validateWorkflowId(id);
    const { data } = await firstValueFrom(
      this.httpService.get(`${this.n8nUrl}/api/v1/workflows/${id}`, { headers: this.headers }),
    );
    return data;
  }

  async activateWorkflow(id: string) {
    this.checkApiKey();
    this.validateWorkflowId(id);
    const { data } = await firstValueFrom(
      this.httpService.post(
        `${this.n8nUrl}/api/v1/workflows/${id}/activate`,
        {},
        { headers: this.headers },
      ),
    );
    return data;
  }

  async deactivateWorkflow(id: string) {
    this.checkApiKey();
    this.validateWorkflowId(id);
    const { data } = await firstValueFrom(
      this.httpService.post(
        `${this.n8nUrl}/api/v1/workflows/${id}/deactivate`,
        {},
        { headers: this.headers },
      ),
    );
    return data;
  }

  async getExecutions() {
    this.checkApiKey();
    const { data } = await firstValueFrom(
      this.httpService.get(`${this.n8nUrl}/api/v1/executions`, { headers: this.headers }),
    );
    return data;
  }
}
```

- [ ] **Step 2: Run unit tests**

```bash
cd backend && npm test 2>&1 | tail -10
```

Expected: all suites pass.

- [ ] **Step 3: Commit**

```bash
git add backend/src/n8n/n8n.service.ts
git commit -m "fix: validate n8n workflow IDs to prevent path injection"
```

---

### Task 6: Validate Cron Expressions in SchedulerService

**Files:**
- Modify: `backend/src/scheduler/scheduler.service.ts`

**What this fixes:** The `cron` string from `POST /schedules` body is passed verbatim to BullMQ. An invalid or sub-second cron expression can crash BullMQ or schedule a plugin to run thousands of times per minute.

**Interfaces:** `create(pluginId, name, cron)` gains validation — same signature, now throws `BadRequestException` for invalid cron.

- [ ] **Step 1: Add cron validation to `scheduler.service.ts`**

Add `BadRequestException` to the NestJS imports and add a private `validateCron` method. Find the top of `backend/src/scheduler/scheduler.service.ts`:

```typescript
import {
  Injectable, NotFoundException, BadRequestException, OnModuleInit, Logger,
} from '@nestjs/common';
```

Add the following private method inside the `SchedulerService` class, before `create()`:

```typescript
private validateCron(cron: string): void {
  // Must be a valid 5-field cron expression (no sub-minute seconds field)
  const FIELDS = 5;
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== FIELDS) {
    throw new BadRequestException(
      `Invalid cron expression "${cron}": expected 5 fields (minute hour day month weekday), got ${parts.length}`,
    );
  }
  // Each field must be a valid cron token: *, digit, range, step, or list
  const FIELD_RE = /^(\*|(\d+)(-\d+)?(\/\d+)?)(\,(\*|(\d+)(-\d+)?(\/\d+)?))*$/;
  for (const part of parts) {
    if (!FIELD_RE.test(part)) {
      throw new BadRequestException(
        `Invalid cron expression "${cron}": unrecognised token "${part}"`,
      );
    }
  }
}
```

- [ ] **Step 2: Call `validateCron` at the top of `create()`**

Find the `create` method and add the call as the first line:

```typescript
async create(pluginId: string, name: string, cron: string): Promise<ScheduledJob> {
  this.validateCron(cron);
  const job = await this.jobRepo.save({ pluginId, name, cron, enabled: true });
  await this.addToQueue(job);
  return job;
}
```

- [ ] **Step 3: Run unit tests**

```bash
cd backend && npm test 2>&1 | tail -10
```

Expected: all suites pass.

- [ ] **Step 4: Commit**

```bash
git add backend/src/scheduler/scheduler.service.ts
git commit -m "fix: validate cron expressions before passing to BullMQ"
```

---

### Task 7: Add HTTP Security Headers to nginx

**Files:**
- Modify: `nginx/nginx.conf`

**What this fixes:** nginx emits no security headers, leaving the app open to clickjacking, MIME-sniffing, and protocol downgrade attacks.

**Interfaces:** No interface changes — headers are additive.

- [ ] **Step 1: Replace `nginx/nginx.conf` with a version that adds security headers**

```nginx
events {
    worker_connections 1024;
}

http {
    upstream backend {
        server backend:4000;
    }
    upstream frontend {
        server frontend:3000;
    }
    upstream n8n {
        server n8n:5678;
    }

    server {
        listen 80;

        # Security headers
        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-XSS-Protection "1; mode=block" always;
        add_header Referrer-Policy "strict-origin-when-cross-origin" always;
        add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;

        location /api/ {
            rewrite ^/api/(.*)$ /$1 break;
            proxy_pass http://backend;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        # n8n admin UI — protected by n8n's own authentication.
        # Restrict to private/internal networks; remove the allow/deny
        # lines if you are protecting this with Cloudflare Zero Trust.
        location /n8n/ {
            allow 127.0.0.1;
            allow 10.0.0.0/8;
            allow 172.16.0.0/12;
            allow 192.168.0.0/16;
            deny all;

            proxy_pass http://n8n/n8n/;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header X-Real-IP $remote_addr;
        }

        location / {
            proxy_pass http://frontend;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
        }
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add nginx/nginx.conf
git commit -m "fix: add HTTP security headers and restrict n8n UI to private networks"
```

---

### Task 8: Move JWT from localStorage to sessionStorage

**Files:**
- Modify: `frontend/src/app/(auth)/login/page.tsx`
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/components/layout/AppShell.tsx`

**What this fixes:** `localStorage` persists across browser sessions and is accessible to any JavaScript on the page. `sessionStorage` is cleared when the tab closes and is isolated per-tab, reducing the XSS exfiltration window.

**Interfaces:** Storage key `autohub_token` is unchanged.

- [ ] **Step 1: Update `login/page.tsx`**

Change line 18 in `frontend/src/app/(auth)/login/page.tsx`:

```typescript
// BEFORE
localStorage.setItem('autohub_token', data.access_token)

// AFTER
sessionStorage.setItem('autohub_token', data.access_token)
```

- [ ] **Step 2: Update `api.ts`**

Replace both `localStorage` references in `frontend/src/lib/api.ts`:

```typescript
import axios from 'axios'

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? '',
})

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = sessionStorage.getItem('autohub_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      sessionStorage.removeItem('autohub_token')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  },
)

export default api
```

- [ ] **Step 3: Update `AppShell.tsx`**

Change the `localStorage` call in `frontend/src/components/layout/AppShell.tsx`:

```typescript
'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from './Sidebar'

export default function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter()

  useEffect(() => {
    const token = sessionStorage.getItem('autohub_token')
    if (!token) {
      router.replace('/login')
    }
  }, [router])

  return (
    <div className="flex min-h-screen bg-[#0a0a0a]">
      <Sidebar />
      <main className="flex-1 overflow-auto p-6 min-w-0">
        {children}
      </main>
    </div>
  )
}
```

- [ ] **Step 4: Run frontend type check**

```bash
cd frontend && npm run build 2>&1 | tail -15
```

Expected: build exits 0, no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/\(auth\)/login/page.tsx frontend/src/lib/api.ts frontend/src/components/layout/AppShell.tsx
git commit -m "fix: move JWT storage from localStorage to sessionStorage"
```

---

### Task 9: Fix Calendar hasDots() Date Logic

**Files:**
- Modify: `frontend/src/app/(app)/calendar/page.tsx`

**What this fixes:** `hasDots()` at line 78 computes `purple` as `n8nWorkflows.some(w => w.active)` with no date argument. With even one active n8n workflow, every day in the month gets the purple dot, making the calendar misleading. The fix shows the purple dot only on today (active workflows are running "now").

**Interfaces:** No interface changes.

- [ ] **Step 1: Fix the `hasDots` function in `calendar/page.tsx`**

Find and replace the `hasDots` function (around line 76–79):

```typescript
// BEFORE
const hasDots = (date: Date) => ({
  blue: schedules.some(s => s.enabled && cronMatchesDay(s.cron, date)),
  purple: n8nWorkflows.some(w => w.active),
})

// AFTER
const hasDots = (date: Date) => ({
  blue: schedules.some(s => s.enabled && cronMatchesDay(s.cron, date)),
  purple: isToday(date) && n8nWorkflows.some(w => w.active),
})
```

`isToday` is already imported from `date-fns` at the top of the file (line 5).

- [ ] **Step 2: Run frontend type check**

```bash
cd frontend && npm run build 2>&1 | tail -15
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/\(app\)/calendar/page.tsx
git commit -m "fix: show n8n purple calendar dot only on today, not every day"
```

---

### Task 10: Push All Fixes to main

- [ ] **Step 1: Verify current branch is main or switch to it**

```bash
git branch --show-current
# If not main:
git checkout main
```

- [ ] **Step 2: Push to origin/main**

```bash
git push origin main
```

Expected: push succeeds, all 9 fix commits appear in the remote `main` branch.
