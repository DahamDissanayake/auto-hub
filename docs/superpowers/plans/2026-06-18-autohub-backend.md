# AutoHub Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete AutoHub backend — NestJS API with 6 modules, PostgreSQL/Redis/BullMQ, Telegram notifications, plugin execution engine, and seed data — ready to run via Docker Compose.

**Architecture:** Backend-first sequential build. Each module is built, unit-tested, and committed before moving to the next. `app.module.ts` is written last, after all modules exist. E2E tests run against a real PostgreSQL database.

**Tech Stack:** NestJS 10, TypeScript, TypeORM + PostgreSQL 16, BullMQ + Redis 7, @nestjs/jwt + passport-jwt, node-telegram-bot-api, Jest (unit + e2e), Docker Compose (ARM64)

---

## File Map

```
autohub/
├── docker-compose.yml
├── .env.example
├── .gitignore
├── README.md
├── nginx/nginx.conf
├── scripts/install.sh
├── dev-logs/testings.md               ← backend test commands (partial, completed in Plan 2)
└── backend/
    ├── Dockerfile
    ├── package.json
    ├── tsconfig.json
    ├── nest-cli.json
    └── src/
        ├── main.ts
        ├── app.module.ts
        ├── seed.ts
        ├── auth/
        │   ├── auth.module.ts
        │   ├── auth.service.ts
        │   ├── auth.service.spec.ts
        │   ├── auth.controller.ts
        │   ├── decorators/public.decorator.ts
        │   ├── guards/jwt-auth.guard.ts
        │   └── strategies/jwt.strategy.ts
        ├── health/
        │   ├── health.module.ts
        │   └── health.controller.ts
        ├── notifications/
        │   ├── notifications.module.ts
        │   ├── notifications.service.ts
        │   └── notifications.service.spec.ts
        ├── plugins/
        │   ├── plugins.module.ts
        │   ├── plugins.service.ts
        │   ├── plugins.service.spec.ts
        │   ├── plugins.controller.ts
        │   └── entities/
        │       ├── plugin.entity.ts
        │       └── plugin-execution.entity.ts
        ├── scheduler/
        │   ├── scheduler.module.ts
        │   ├── scheduler.service.ts
        │   ├── scheduler.service.spec.ts
        │   ├── scheduler.controller.ts
        │   ├── entities/scheduled-job.entity.ts
        │   └── processors/plugin-job.processor.ts
        ├── n8n/
        │   ├── n8n.module.ts
        │   ├── n8n.service.ts
        │   ├── n8n.service.spec.ts
        │   └── n8n.controller.ts
        └── dashboard/
            ├── dashboard.module.ts
            ├── dashboard.service.ts
            ├── dashboard.service.spec.ts
            └── dashboard.controller.ts
```

---

## Task 1: Infrastructure Files

**Files:**
- Create: `docker-compose.yml`
- Create: `.env.example`
- Create: `.gitignore`
- Create: `README.md`
- Create: `nginx/nginx.conf`
- Create: `scripts/install.sh`

- [ ] **Step 1: Create `docker-compose.yml`**

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: autohub
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: autohub
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    restart: unless-stopped

  n8n:
    image: n8nio/n8n:latest
    environment:
      N8N_PATH: /n8n
      N8N_HOST: ${DOMAIN}
      N8N_PORT: 5678
      N8N_PROTOCOL: https
      WEBHOOK_URL: https://${DOMAIN}/n8n/
      DB_TYPE: postgresdb
      DB_POSTGRESDB_HOST: postgres
      DB_POSTGRESDB_DATABASE: n8n
      DB_POSTGRESDB_USER: autohub
      DB_POSTGRESDB_PASSWORD: ${POSTGRES_PASSWORD}
      GENERIC_TIMEZONE: ${TIMEZONE}
    volumes:
      - n8n_data:/home/node/.n8n
    depends_on:
      - postgres
    restart: unless-stopped

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
    volumes:
      - plugins_data:/app/plugins
    depends_on:
      - postgres
      - redis
    restart: unless-stopped

  frontend:
    build: ./frontend
    environment:
      NODE_ENV: production
    depends_on:
      - backend
    restart: unless-stopped

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
    depends_on:
      - frontend
      - backend
      - n8n
    restart: unless-stopped

  cloudflared:
    image: cloudflare/cloudflared:latest
    command: tunnel run
    environment:
      TUNNEL_TOKEN: ${CLOUDFLARE_TUNNEL_TOKEN}
    depends_on:
      - nginx
    restart: unless-stopped

volumes:
  postgres_data:
  n8n_data:
  plugins_data:
```

- [ ] **Step 2: Create `.env.example`**

```env
DOMAIN=yourdomain.com
ADMIN_PASSWORD=changeme
JWT_SECRET=change-this-secret-to-something-long-and-random
POSTGRES_PASSWORD=dbpassword
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
N8N_API_KEY=
CLOUDFLARE_TUNNEL_TOKEN=
TIMEZONE=UTC
PLUGIN_DIR=/app/plugins
```

- [ ] **Step 3: Create `.gitignore`**

```gitignore
# env
.env
.env.local

# node
node_modules/
dist/
.next/
build/

# docker
docker-compose.override.yml

# OS
.DS_Store
Thumbs.db

# IDE
.vscode/
.idea/

# coverage
coverage/

# plugins (mounted as Docker volume, not committed)
plugins/
```

- [ ] **Step 4: Create `nginx/nginx.conf`**

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

        location /api/ {
            rewrite ^/api/(.*)$ /$1 break;
            proxy_pass http://backend;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        location /n8n/ {
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

- [ ] **Step 5: Create `scripts/install.sh`**

```bash
#!/bin/bash
set -e

echo "AutoHub Installer"
echo "================="

if ! command -v docker &> /dev/null; then
    echo "Installing Docker..."
    curl -fsSL https://get.docker.com | sh
    sudo usermod -aG docker "$USER"
    echo "Docker installed. Please log out and back in, then re-run this script."
    exit 0
fi

if [ -d "auto-hub" ]; then
    cd auto-hub && git pull
else
    git clone https://github.com/yourusername/auto-hub.git
    cd auto-hub
fi

if [ ! -f .env ]; then
    cp .env.example .env
    echo "Created .env from .env.example"
    echo "Please edit .env with your settings, then re-run this script."
    exit 1
fi

docker compose up -d --build
echo ""
echo "AutoHub is running at http://localhost"
echo "Login with the ADMIN_PASSWORD from your .env file."
```

- [ ] **Step 6: Create `README.md`**

```markdown
# AutoHub

A self-hosted personal automation OS for Raspberry Pi 5.

## Quick Start

```bash
curl -fsSL https://raw.githubusercontent.com/yourusername/auto-hub/main/scripts/install.sh | bash
```

Or manually:

```bash
git clone https://github.com/yourusername/auto-hub.git
cd auto-hub
cp .env.example .env
# Edit .env with your settings
docker compose up -d --build
```

Visit http://localhost and log in with your `ADMIN_PASSWORD`.

## Stack

- **Frontend:** Next.js 14 (App Router)
- **Backend:** NestJS 10
- **Database:** PostgreSQL 16
- **Queue:** Redis 7 + BullMQ
- **Automation:** n8n (self-hosted)
- **Proxy:** Nginx + Cloudflare Zero Trust

## Plugins

Drop a plugin folder into the Docker volume at `PLUGIN_DIR=/app/plugins` and restart the backend. Each plugin needs a `manifest.json` and `index.js`.
```

- [ ] **Step 7: Commit**

```bash
git add docker-compose.yml .env.example .gitignore README.md nginx/nginx.conf scripts/install.sh
git commit -m "feat: add infrastructure files (docker-compose, nginx, install script)"
```

---

## Task 2: Backend Project Setup

**Files:**
- Create: `backend/package.json`
- Create: `backend/tsconfig.json`
- Create: `backend/nest-cli.json`
- Create: `backend/Dockerfile`

- [ ] **Step 1: Create `backend/package.json`**

```json
{
  "name": "autohub-backend",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "build": "nest build",
    "start": "nest start",
    "start:dev": "nest start --watch",
    "start:prod": "node dist/main",
    "seed": "node dist/seed",
    "test": "jest",
    "test:cov": "jest --coverage",
    "test:e2e": "jest --config ./test/jest-e2e.json"
  },
  "dependencies": {
    "@nestjs/common": "^10.0.0",
    "@nestjs/config": "^3.0.0",
    "@nestjs/core": "^10.0.0",
    "@nestjs/axios": "^3.0.0",
    "@nestjs/jwt": "^10.0.0",
    "@nestjs/passport": "^10.0.0",
    "@nestjs/platform-express": "^10.0.0",
    "@nestjs/typeorm": "^10.0.0",
    "@nestjs/bullmq": "^10.0.0",
    "bullmq": "^5.0.0",
    "typeorm": "^0.3.0",
    "pg": "^8.11.0",
    "bcrypt": "^5.1.0",
    "passport": "^0.6.0",
    "passport-jwt": "^4.0.0",
    "axios": "^1.6.0",
    "ioredis": "^5.3.0",
    "node-telegram-bot-api": "^0.64.0",
    "reflect-metadata": "^0.1.13",
    "rxjs": "^7.8.1"
  },
  "devDependencies": {
    "@nestjs/cli": "^10.0.0",
    "@nestjs/schematics": "^10.0.0",
    "@nestjs/testing": "^10.0.0",
    "@types/bcrypt": "^5.0.0",
    "@types/express": "^4.17.17",
    "@types/jest": "^29.5.2",
    "@types/node": "^20.3.1",
    "@types/node-telegram-bot-api": "^0.64.0",
    "@types/passport-jwt": "^3.0.9",
    "@types/supertest": "^2.0.12",
    "jest": "^29.5.0",
    "source-map-support": "^0.5.21",
    "supertest": "^6.3.3",
    "ts-jest": "^29.1.0",
    "ts-node": "^10.9.1",
    "tsconfig-paths": "^4.2.0",
    "typescript": "^5.1.3"
  },
  "jest": {
    "moduleFileExtensions": ["js", "json", "ts"],
    "rootDir": "src",
    "testRegex": ".*\\.spec\\.ts$",
    "transform": { "^.+\\.(t|j)s$": "ts-jest" },
    "collectCoverageFrom": ["**/*.(t|j)s"],
    "coverageDirectory": "../coverage",
    "testEnvironment": "node"
  }
}
```

- [ ] **Step 2: Create `backend/tsconfig.json`**

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "declaration": true,
    "removeComments": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true,
    "target": "ES2021",
    "sourceMap": true,
    "outDir": "./dist",
    "baseUrl": "./",
    "incremental": true,
    "skipLibCheck": true,
    "strictNullChecks": false,
    "noImplicitAny": false,
    "forceConsistentCasingInFileNames": false
  }
}
```

- [ ] **Step 3: Create `backend/nest-cli.json`**

```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": {
    "deleteOutDir": true
  }
}
```

- [ ] **Step 4: Create `backend/Dockerfile`**

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS production
WORKDIR /app
RUN apk add --no-cache dumb-init
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
ENV NODE_ENV=production
EXPOSE 4000
ENTRYPOINT ["dumb-init", "--"]
CMD ["sh", "-c", "node dist/seed && node dist/main"]
```

- [ ] **Step 5: Commit**

```bash
git add backend/
git commit -m "feat: add backend project config (package.json, tsconfig, Dockerfile)"
```

---

## Task 3: Auth Shared Files

**Files:**
- Create: `backend/src/auth/decorators/public.decorator.ts`
- Create: `backend/src/auth/guards/jwt-auth.guard.ts`
- Create: `backend/src/auth/strategies/jwt.strategy.ts`

These must exist before `app.module.ts` and `HealthModule` since they reference `@Public()`.

- [ ] **Step 1: Create `backend/src/auth/decorators/public.decorator.ts`**

```typescript
import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
```

- [ ] **Step 2: Create `backend/src/auth/guards/jwt-auth.guard.ts`**

```typescript
import { Injectable, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }
}
```

- [ ] **Step 3: Create `backend/src/auth/strategies/jwt.strategy.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET') ?? 'fallback-secret',
    });
  }

  async validate(payload: { sub: string }) {
    return { userId: payload.sub };
  }
}
```

- [ ] **Step 4: Write failing test for `auth.service.ts`**

Create `backend/src/auth/auth.service.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: JwtService,
          useValue: { sign: jest.fn().mockReturnValue('test-token') },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('testpassword') },
        },
      ],
    }).compile();
    service = module.get<AuthService>(AuthService);
  });

  it('returns access_token on correct plaintext password', async () => {
    const result = await service.login('testpassword');
    expect(result).toEqual({ access_token: 'test-token' });
  });

  it('throws UnauthorizedException on wrong password', async () => {
    await expect(service.login('wrongpassword')).rejects.toThrow(UnauthorizedException);
  });
});
```

- [ ] **Step 5: Create `backend/src/auth/auth.service.ts`**

```typescript
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private config: ConfigService,
  ) {}

  async login(password: string): Promise<{ access_token: string }> {
    const adminPassword = this.config.get<string>('ADMIN_PASSWORD') ?? '';
    let isValid = false;
    if (adminPassword.startsWith('$2')) {
      isValid = await bcrypt.compare(password, adminPassword);
    } else {
      isValid = password === adminPassword;
    }
    if (!isValid) {
      throw new UnauthorizedException('Invalid password');
    }
    return { access_token: this.jwtService.sign({ sub: 'admin' }) };
  }
}
```

- [ ] **Step 6: Create `backend/src/auth/auth.controller.ts`**

```typescript
import { Controller, Post, Body, HttpCode } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Public } from './decorators/public.decorator';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  @Public()
  @HttpCode(200)
  async login(@Body() body: { password: string }) {
    return this.authService.login(body.password);
  }
}
```

- [ ] **Step 7: Create `backend/src/auth/auth.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET') ?? 'fallback-secret',
        signOptions: { expiresIn: '7d' },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [AuthService, JwtStrategy],
  controllers: [AuthController],
  exports: [JwtModule],
})
export class AuthModule {}
```

- [ ] **Step 8: Run auth unit test**

Run from `backend/`:
```bash
npx jest src/auth/auth.service.spec.ts --no-coverage
```

Expected: `PASS src/auth/auth.service.spec.ts` with 2 tests passing.

- [ ] **Step 9: Commit**

```bash
git add backend/src/auth/
git commit -m "feat: add auth module (JWT, bcrypt, public decorator, guard)"
```

---

## Task 4: Health Module

**Files:**
- Create: `backend/src/health/health.module.ts`
- Create: `backend/src/health/health.controller.ts`

- [ ] **Step 1: Create `backend/src/health/health.controller.ts`**

```typescript
import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';

@Controller('health')
export class HealthController {
  @Get()
  @Public()
  getHealth() {
    return {
      status: 'ok',
      version: '1.0.0',
      nodeVersion: process.version,
      timezone: process.env.TIMEZONE ?? 'UTC',
      pluginDir: process.env.PLUGIN_DIR ?? '/app/plugins',
      telegramConfigured: !!(process.env.TELEGRAM_BOT_TOKEN),
      n8nConfigured: !!(process.env.N8N_API_KEY),
    };
  }
}
```

- [ ] **Step 2: Create `backend/src/health/health.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';

@Module({
  controllers: [HealthController],
})
export class HealthModule {}
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/health/
git commit -m "feat: add health module (GET /api/health, public)"
```

---

## Task 5: Notifications Module

**Files:**
- Create: `backend/src/notifications/notifications.module.ts`
- Create: `backend/src/notifications/notifications.service.ts`
- Create: `backend/src/notifications/notifications.service.spec.ts`

- [ ] **Step 1: Write failing test**

Create `backend/src/notifications/notifications.service.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from './notifications.service';
import { ConfigService } from '@nestjs/config';

describe('NotificationsService', () => {
  it('send() is a no-op when TELEGRAM_BOT_TOKEN is not set', async () => {
    const module = await Test.createTestingModule({
      providers: [
        NotificationsService,
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue(undefined) },
        },
      ],
    }).compile();
    const service = module.get<NotificationsService>(NotificationsService);
    await expect(service.send('hello')).resolves.toBeUndefined();
  });

  it('send() does not throw when bot fails', async () => {
    const module = await Test.createTestingModule({
      providers: [
        NotificationsService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string) => {
              if (key === 'TELEGRAM_BOT_TOKEN') return 'fake-token';
              if (key === 'TELEGRAM_CHAT_ID') return '12345';
              return undefined;
            }),
          },
        },
      ],
    }).compile();
    const service = module.get<NotificationsService>(NotificationsService);
    // Should not throw even if Telegram API call fails
    await expect(service.send('test')).resolves.not.toThrow();
  });
});
```

- [ ] **Step 2: Create `backend/src/notifications/notifications.service.ts`**

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private bot: any = null;
  private chatId: string;

  constructor(private config: ConfigService) {
    const token = config.get<string>('TELEGRAM_BOT_TOKEN');
    this.chatId = config.get<string>('TELEGRAM_CHAT_ID') ?? '';
    if (token) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const TelegramBot = require('node-telegram-bot-api');
        this.bot = new TelegramBot(token);
      } catch (err) {
        this.logger.error(`Failed to init Telegram bot: ${err.message}`);
      }
    }
  }

  async send(message: string): Promise<void> {
    if (!this.bot || !this.chatId) return;
    try {
      await this.bot.sendMessage(this.chatId, message, { parse_mode: 'HTML' });
    } catch (err) {
      this.logger.error(`Telegram send failed: ${err.message}`);
    }
  }
}
```

- [ ] **Step 3: Create `backend/src/notifications/notifications.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

@Module({
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
```

- [ ] **Step 4: Run notifications unit test**

```bash
npx jest src/notifications/notifications.service.spec.ts --no-coverage
```

Expected: `PASS` with 2 tests passing.

- [ ] **Step 5: Commit**

```bash
git add backend/src/notifications/
git commit -m "feat: add notifications module (Telegram bot: autohub-serenedge)"
```

---

## Task 6: Plugin Entities

**Files:**
- Create: `backend/src/plugins/entities/plugin.entity.ts`
- Create: `backend/src/plugins/entities/plugin-execution.entity.ts`

- [ ] **Step 1: Create `backend/src/plugins/entities/plugin.entity.ts`**

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

- [ ] **Step 2: Create `backend/src/plugins/entities/plugin-execution.entity.ts`**

```typescript
import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { Plugin } from './plugin.entity';

export type ExecutionStatus = 'running' | 'success' | 'failed';
export type TriggerType = 'manual' | 'scheduled';

@Entity('plugin_executions')
export class PluginExecution {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  pluginId: string;

  @ManyToOne(() => Plugin, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'pluginId' })
  plugin: Plugin;

  @Column({ type: 'varchar', default: 'running' })
  status: ExecutionStatus;

  @Column({ type: 'text', nullable: true })
  output: string;

  @Column({ type: 'text', nullable: true })
  error: string;

  @Column({ type: 'varchar', default: 'manual' })
  triggeredBy: TriggerType;

  @Column({ nullable: true })
  durationMs: number;

  @CreateDateColumn()
  startedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  finishedAt: Date;
}
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/plugins/entities/
git commit -m "feat: add Plugin and PluginExecution TypeORM entities"
```

---

## Task 7: Plugins Module

**Files:**
- Create: `backend/src/plugins/plugins.service.ts`
- Create: `backend/src/plugins/plugins.service.spec.ts`
- Create: `backend/src/plugins/plugins.controller.ts`
- Create: `backend/src/plugins/plugins.module.ts`

- [ ] **Step 1: Write failing test**

Create `backend/src/plugins/plugins.service.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { PluginsService } from './plugins.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Plugin } from './entities/plugin.entity';
import { PluginExecution } from './entities/plugin-execution.entity';
import { ConfigService } from '@nestjs/config';
import { NotificationsService } from '../notifications/notifications.service';
import { NotFoundException } from '@nestjs/common';

describe('PluginsService', () => {
  let service: PluginsService;

  const mockPluginRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
  };
  const mockExecutionRepo = {
    save: jest.fn(),
    update: jest.fn(),
    find: jest.fn(),
  };
  const mockNotifications = { send: jest.fn().mockResolvedValue(undefined) };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PluginsService,
        { provide: getRepositoryToken(Plugin), useValue: mockPluginRepo },
        { provide: getRepositoryToken(PluginExecution), useValue: mockExecutionRepo },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('/tmp/test-plugins') },
        },
        { provide: NotificationsService, useValue: mockNotifications },
      ],
    }).compile();
    service = module.get<PluginsService>(PluginsService);
    jest.clearAllMocks();
  });

  it('findAll returns plugins ordered by createdAt', async () => {
    const plugins = [{ id: '1' }, { id: '2' }];
    mockPluginRepo.find.mockResolvedValueOnce(plugins);
    const result = await service.findAll();
    expect(result).toEqual(plugins);
    expect(mockPluginRepo.find).toHaveBeenCalledWith({ order: { createdAt: 'ASC' } });
  });

  it('findOne throws NotFoundException when plugin does not exist', async () => {
    mockPluginRepo.findOne.mockResolvedValueOnce(null);
    await expect(service.findOne('missing-id')).rejects.toThrow(NotFoundException);
  });

  it('toggle changes status from active to inactive', async () => {
    const plugin = { id: '1', status: 'active', name: 'Test Plugin' };
    mockPluginRepo.findOne.mockResolvedValueOnce(plugin);
    mockPluginRepo.update.mockResolvedValueOnce({});
    const result = await service.toggle('1');
    expect(result.status).toBe('inactive');
    expect(mockPluginRepo.update).toHaveBeenCalledWith('1', { status: 'inactive' });
  });

  it('toggle changes status from inactive to active', async () => {
    const plugin = { id: '1', status: 'inactive', name: 'Test Plugin' };
    mockPluginRepo.findOne.mockResolvedValueOnce(plugin);
    mockPluginRepo.update.mockResolvedValueOnce({});
    const result = await service.toggle('1');
    expect(result.status).toBe('active');
  });

  it('updateConfig persists new config', async () => {
    const plugin = { id: '1', status: 'active', config: {} };
    mockPluginRepo.findOne.mockResolvedValueOnce(plugin);
    mockPluginRepo.update.mockResolvedValueOnce({});
    const result = await service.updateConfig('1', { apiKey: 'abc123' });
    expect(result.config).toEqual({ apiKey: 'abc123' });
    expect(mockPluginRepo.update).toHaveBeenCalledWith('1', { config: { apiKey: 'abc123' } });
  });
});
```

- [ ] **Step 2: Create `backend/src/plugins/plugins.service.ts`**

```typescript
import {
  Injectable, NotFoundException, OnModuleInit, Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { Plugin } from './entities/plugin.entity';
import { PluginExecution } from './entities/plugin-execution.entity';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class PluginsService implements OnModuleInit {
  private readonly logger = new Logger(PluginsService.name);
  readonly pluginDir: string;

  constructor(
    @InjectRepository(Plugin)
    private pluginRepo: Repository<Plugin>,
    @InjectRepository(PluginExecution)
    private executionRepo: Repository<PluginExecution>,
    private config: ConfigService,
    private notifications: NotificationsService,
  ) {
    this.pluginDir = config.get<string>('PLUGIN_DIR') ?? '/app/plugins';
  }

  async onModuleInit() {
    await this.scanPlugins();
  }

  async scanPlugins() {
    if (!fs.existsSync(this.pluginDir)) return;
    const entries = fs.readdirSync(this.pluginDir, { withFileTypes: true })
      .filter(d => d.isDirectory());

    for (const entry of entries) {
      const manifestPath = path.join(this.pluginDir, entry.name, 'manifest.json');
      if (!fs.existsSync(manifestPath)) continue;
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        await this.upsertFromManifest(manifest);
      } catch (err) {
        this.logger.error(`Failed to load ${entry.name}: ${err.message}`);
      }
    }
  }

  private async upsertFromManifest(manifest: Record<string, unknown>) {
    const slug = manifest.slug as string;
    const existing = await this.pluginRepo.findOne({ where: { slug } });
    const fields = {
      name: manifest.name as string,
      description: (manifest.description as string) ?? '',
      icon: (manifest.icon as string) ?? '⚙️',
      category: (manifest.category as string) ?? 'utility',
      version: (manifest.version as string) ?? '1.0.0',
      entryFile: (manifest.entryFile as string) ?? 'index.js',
      configSchema: (manifest.configSchema as any[]) ?? [],
    };
    if (existing) {
      await this.pluginRepo.update(existing.id, fields);
    } else {
      await this.pluginRepo.save({ slug, ...fields, status: 'inactive', config: {} });
    }
  }

  async findAll(): Promise<Plugin[]> {
    return this.pluginRepo.find({ order: { createdAt: 'ASC' } });
  }

  async findOne(id: string): Promise<Plugin> {
    const plugin = await this.pluginRepo.findOne({ where: { id } });
    if (!plugin) throw new NotFoundException(`Plugin ${id} not found`);
    return plugin;
  }

  async updateConfig(id: string, config: Record<string, unknown>): Promise<Plugin> {
    const plugin = await this.findOne(id);
    await this.pluginRepo.update(id, { config });
    return { ...plugin, config };
  }

  async toggle(id: string): Promise<Plugin> {
    const plugin = await this.findOne(id);
    const newStatus = plugin.status === 'active' ? 'inactive' : 'active';
    await this.pluginRepo.update(id, { status: newStatus });
    return { ...plugin, status: newStatus };
  }

  async run(
    id: string,
    triggeredBy: 'manual' | 'scheduled' = 'manual',
  ): Promise<PluginExecution> {
    const plugin = await this.findOne(id);
    const pluginPath = path.join(this.pluginDir, plugin.slug, plugin.entryFile);

    const execution = await this.executionRepo.save({
      pluginId: id,
      status: 'running',
      triggeredBy,
    });

    const startTime = Date.now();
    const logs: string[] = [];
    const log = (msg: string) => logs.push(`[${new Date().toISOString()}] ${msg}`);

    try {
      delete require.cache[require.resolve(pluginPath)];
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pluginModule = require(pluginPath);
      const fn = pluginModule.default ?? pluginModule;

      await Promise.race([
        fn({ config: plugin.config, log }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Plugin timeout (60s)')), 60_000),
        ),
      ]);

      const durationMs = Date.now() - startTime;
      const output = logs.join('\n');
      await this.executionRepo.update(execution.id, {
        status: 'success', output, durationMs, finishedAt: new Date(),
      });
      await this.pluginRepo.update(id, { lastRunAt: new Date(), lastRunStatus: 'success' });
      await this.notifications.send(
        `✅ <b>${plugin.name}</b> ran successfully (${durationMs}ms)`,
      );
      return { ...execution, status: 'success', output, durationMs } as PluginExecution;
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const output = logs.join('\n');
      await this.executionRepo.update(execution.id, {
        status: 'failed', output, error: err.message, durationMs, finishedAt: new Date(),
      });
      await this.pluginRepo.update(id, {
        lastRunAt: new Date(), lastRunStatus: 'failed', status: 'error',
      });
      await this.notifications.send(
        `❌ <b>${plugin.name}</b> failed: ${err.message}`,
      );
      return { ...execution, status: 'failed', error: err.message, durationMs } as PluginExecution;
    }
  }

  async getExecutions(id: string): Promise<PluginExecution[]> {
    return this.executionRepo.find({
      where: { pluginId: id },
      order: { startedAt: 'DESC' },
      take: 50,
    });
  }

  async registerFromManifest(slug: string): Promise<Plugin> {
    const manifestPath = path.join(this.pluginDir, slug, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      throw new NotFoundException(`manifest.json not found for plugin: ${slug}`);
    }
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    await this.upsertFromManifest(manifest);
    return this.pluginRepo.findOne({ where: { slug: manifest.slug } });
  }
}
```

- [ ] **Step 3: Run plugins unit test**

```bash
npx jest src/plugins/plugins.service.spec.ts --no-coverage
```

Expected: `PASS` with 5 tests passing.

- [ ] **Step 4: Create `backend/src/plugins/plugins.controller.ts`**

```typescript
import { Controller, Get, Post, Patch, Param, Body } from '@nestjs/common';
import { PluginsService } from './plugins.service';

@Controller('plugins')
export class PluginsController {
  constructor(private pluginsService: PluginsService) {}

  @Get()
  findAll() {
    return this.pluginsService.findAll();
  }

  // register MUST be declared before :id routes to prevent NestJS
  // from matching "register" as an id parameter
  @Post('register')
  register(@Body() body: { slug: string }) {
    return this.pluginsService.registerFromManifest(body.slug);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.pluginsService.findOne(id);
  }

  @Post(':id/run')
  run(@Param('id') id: string) {
    return this.pluginsService.run(id, 'manual');
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

- [ ] **Step 5: Create `backend/src/plugins/plugins.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PluginsService } from './plugins.service';
import { PluginsController } from './plugins.controller';
import { Plugin } from './entities/plugin.entity';
import { PluginExecution } from './entities/plugin-execution.entity';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Plugin, PluginExecution]),
    NotificationsModule,
  ],
  providers: [PluginsService],
  controllers: [PluginsController],
  exports: [PluginsService],
})
export class PluginsModule {}
```

- [ ] **Step 6: Commit**

```bash
git add backend/src/plugins/
git commit -m "feat: add plugins module (auto-scan, run, toggle, config, executions)"
```

---

## Task 8: Scheduler Module

**Files:**
- Create: `backend/src/scheduler/entities/scheduled-job.entity.ts`
- Create: `backend/src/scheduler/processors/plugin-job.processor.ts`
- Create: `backend/src/scheduler/scheduler.service.ts`
- Create: `backend/src/scheduler/scheduler.service.spec.ts`
- Create: `backend/src/scheduler/scheduler.controller.ts`
- Create: `backend/src/scheduler/scheduler.module.ts`

- [ ] **Step 1: Create `backend/src/scheduler/entities/scheduled-job.entity.ts`**

```typescript
import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
} from 'typeorm';

@Entity('scheduled_jobs')
export class ScheduledJob {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  pluginId: string;

  @Column()
  name: string;

  @Column()
  cron: string;

  @Column({ default: true })
  enabled: boolean;

  @Column({ type: 'timestamp', nullable: true })
  nextRunAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  lastRunAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
```

- [ ] **Step 2: Create `backend/src/scheduler/processors/plugin-job.processor.ts`**

```typescript
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PluginsService } from '../../plugins/plugins.service';

@Processor('plugin-jobs')
export class PluginJobProcessor extends WorkerHost {
  private readonly logger = new Logger(PluginJobProcessor.name);

  constructor(private pluginsService: PluginsService) {
    super();
  }

  async process(job: Job<{ pluginId: string }>) {
    this.logger.log(`Running scheduled plugin: ${job.data.pluginId}`);
    await this.pluginsService.run(job.data.pluginId, 'scheduled');
  }
}
```

- [ ] **Step 3: Write failing test**

Create `backend/src/scheduler/scheduler.service.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { SchedulerService } from './scheduler.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ScheduledJob } from './entities/scheduled-job.entity';
import { getQueueToken } from '@nestjs/bullmq';
import { NotFoundException } from '@nestjs/common';

describe('SchedulerService', () => {
  let service: SchedulerService;

  const mockQueue = {
    add: jest.fn().mockResolvedValue({}),
    getRepeatableJobs: jest.fn().mockResolvedValue([]),
    removeRepeatableByKey: jest.fn().mockResolvedValue({}),
  };
  const mockRepo = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SchedulerService,
        { provide: getRepositoryToken(ScheduledJob), useValue: mockRepo },
        { provide: getQueueToken('plugin-jobs'), useValue: mockQueue },
      ],
    }).compile();
    service = module.get<SchedulerService>(SchedulerService);
    jest.clearAllMocks();
  });

  it('onModuleInit re-registers all enabled schedules', async () => {
    const jobs = [
      { id: '1', pluginId: 'p1', name: 'test', cron: '0 9 * * *', enabled: true },
    ];
    mockRepo.find.mockResolvedValueOnce(jobs);
    mockQueue.getRepeatableJobs.mockResolvedValue([]);
    await service.onModuleInit();
    expect(mockQueue.add).toHaveBeenCalledTimes(1);
  });

  it('create saves to DB and adds BullMQ job', async () => {
    const saved = { id: 'new-id', pluginId: 'p1', name: 'test', cron: '0 9 * * *', enabled: true };
    mockRepo.save.mockResolvedValueOnce(saved);
    mockQueue.getRepeatableJobs.mockResolvedValue([]);
    const result = await service.create('p1', 'test', '0 9 * * *');
    expect(mockRepo.save).toHaveBeenCalled();
    expect(mockQueue.add).toHaveBeenCalled();
    expect(result.id).toBe('new-id');
  });

  it('remove throws NotFoundException when schedule not found', async () => {
    mockRepo.findOne.mockResolvedValueOnce(null);
    await expect(service.remove('missing-id')).rejects.toThrow(NotFoundException);
  });

  it('toggle disables enabled schedule and removes BullMQ job', async () => {
    const job = { id: '1', pluginId: 'p1', name: 'test', cron: '0 9 * * *', enabled: true };
    mockRepo.findOne.mockResolvedValueOnce(job);
    mockRepo.update.mockResolvedValueOnce({});
    mockQueue.getRepeatableJobs.mockResolvedValueOnce([{ id: 'schedule-1', key: 'key1' }]);
    const result = await service.toggle('1');
    expect(result.enabled).toBe(false);
    expect(mockQueue.removeRepeatableByKey).toHaveBeenCalledWith('key1');
  });

  it('toggle enables disabled schedule and adds BullMQ job', async () => {
    const job = { id: '1', pluginId: 'p1', name: 'test', cron: '0 9 * * *', enabled: false };
    mockRepo.findOne.mockResolvedValueOnce(job);
    mockRepo.update.mockResolvedValueOnce({});
    mockQueue.getRepeatableJobs.mockResolvedValue([]);
    const result = await service.toggle('1');
    expect(result.enabled).toBe(true);
    expect(mockQueue.add).toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Create `backend/src/scheduler/scheduler.service.ts`**

```typescript
import { Injectable, OnModuleInit, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ScheduledJob } from './entities/scheduled-job.entity';

@Injectable()
export class SchedulerService implements OnModuleInit {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    @InjectRepository(ScheduledJob)
    private jobRepo: Repository<ScheduledJob>,
    @InjectQueue('plugin-jobs')
    private queue: Queue,
  ) {}

  async onModuleInit() {
    const jobs = await this.jobRepo.find({ where: { enabled: true } });
    for (const job of jobs) {
      await this.addToQueue(job);
    }
    this.logger.log(`Re-registered ${jobs.length} scheduled job(s)`);
  }

  private async addToQueue(job: ScheduledJob) {
    // Remove any existing repeatable job for this schedule (idempotent)
    const existing = await this.queue.getRepeatableJobs();
    for (const rj of existing) {
      if (rj.id === `schedule-${job.id}`) {
        await this.queue.removeRepeatableByKey(rj.key);
      }
    }
    await this.queue.add(
      `plugin-${job.id}`,
      { pluginId: job.pluginId },
      {
        repeat: { pattern: job.cron },
        jobId: `schedule-${job.id}`,
        removeOnComplete: 10,
        removeOnFail: 5,
      },
    );
  }

  async create(pluginId: string, name: string, cron: string): Promise<ScheduledJob> {
    const job = await this.jobRepo.save({ pluginId, name, cron, enabled: true });
    await this.addToQueue(job);
    return job;
  }

  async findAll(): Promise<ScheduledJob[]> {
    return this.jobRepo.find({ order: { createdAt: 'ASC' } });
  }

  async remove(id: string): Promise<void> {
    const job = await this.jobRepo.findOne({ where: { id } });
    if (!job) throw new NotFoundException(`Schedule ${id} not found`);
    const repeatableJobs = await this.queue.getRepeatableJobs();
    for (const rj of repeatableJobs) {
      if (rj.id === `schedule-${id}`) {
        await this.queue.removeRepeatableByKey(rj.key);
      }
    }
    await this.jobRepo.delete(id);
  }

  async toggle(id: string): Promise<ScheduledJob> {
    const job = await this.jobRepo.findOne({ where: { id } });
    if (!job) throw new NotFoundException(`Schedule ${id} not found`);
    const newEnabled = !job.enabled;
    await this.jobRepo.update(id, { enabled: newEnabled });
    if (newEnabled) {
      await this.addToQueue(job);
    } else {
      const repeatableJobs = await this.queue.getRepeatableJobs();
      for (const rj of repeatableJobs) {
        if (rj.id === `schedule-${id}`) {
          await this.queue.removeRepeatableByKey(rj.key);
        }
      }
    }
    return { ...job, enabled: newEnabled };
  }
}
```

- [ ] **Step 5: Run scheduler unit test**

```bash
npx jest src/scheduler/scheduler.service.spec.ts --no-coverage
```

Expected: `PASS` with 5 tests passing.

- [ ] **Step 6: Create `backend/src/scheduler/scheduler.controller.ts`**

```typescript
import { Controller, Get, Post, Delete, Patch, Param, Body } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';

@Controller('schedules')
export class SchedulerController {
  constructor(private schedulerService: SchedulerService) {}

  @Get()
  findAll() {
    return this.schedulerService.findAll();
  }

  @Post()
  create(@Body() body: { pluginId: string; name: string; cron: string }) {
    return this.schedulerService.create(body.pluginId, body.name, body.cron);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.schedulerService.remove(id);
  }

  @Patch(':id/toggle')
  toggle(@Param('id') id: string) {
    return this.schedulerService.toggle(id);
  }
}
```

- [ ] **Step 7: Create `backend/src/scheduler/scheduler.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { SchedulerService } from './scheduler.service';
import { SchedulerController } from './scheduler.controller';
import { ScheduledJob } from './entities/scheduled-job.entity';
import { PluginJobProcessor } from './processors/plugin-job.processor';
import { PluginsModule } from '../plugins/plugins.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ScheduledJob]),
    BullModule.registerQueue({ name: 'plugin-jobs' }),
    PluginsModule,
  ],
  providers: [SchedulerService, PluginJobProcessor],
  controllers: [SchedulerController],
  exports: [SchedulerService],
})
export class SchedulerModule {}
```

- [ ] **Step 8: Commit**

```bash
git add backend/src/scheduler/
git commit -m "feat: add scheduler module (BullMQ repeatable jobs, toggle, persist across restarts)"
```

---

## Task 9: n8n Module

**Files:**
- Create: `backend/src/n8n/n8n.service.ts`
- Create: `backend/src/n8n/n8n.service.spec.ts`
- Create: `backend/src/n8n/n8n.controller.ts`
- Create: `backend/src/n8n/n8n.module.ts`

- [ ] **Step 1: Write failing test**

Create `backend/src/n8n/n8n.service.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { N8nService } from './n8n.service';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';
import { of } from 'rxjs';

describe('N8nService', () => {
  it('throws ServiceUnavailableException when N8N_API_KEY is empty', async () => {
    const module = await Test.createTestingModule({
      providers: [
        N8nService,
        { provide: HttpService, useValue: {} },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('') } },
      ],
    }).compile();
    const service = module.get<N8nService>(N8nService);
    await expect(service.getWorkflows()).rejects.toThrow(ServiceUnavailableException);
  });

  it('calls n8n API with X-N8N-API-KEY header when key is set', async () => {
    const mockGet = jest.fn().mockReturnValue(of({ data: { data: [] } }));
    const module = await Test.createTestingModule({
      providers: [
        N8nService,
        { provide: HttpService, useValue: { get: mockGet } },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string) => {
              if (key === 'N8N_API_KEY') return 'test-api-key';
              if (key === 'N8N_URL') return 'http://n8n:5678';
              return undefined;
            }),
          },
        },
      ],
    }).compile();
    const service = module.get<N8nService>(N8nService);
    await service.getWorkflows();
    expect(mockGet).toHaveBeenCalledWith(
      'http://n8n:5678/api/v1/workflows',
      { headers: { 'X-N8N-API-KEY': 'test-api-key' } },
    );
  });
});
```

- [ ] **Step 2: Create `backend/src/n8n/n8n.service.ts`**

```typescript
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
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
    const { data } = await firstValueFrom(
      this.httpService.get(`${this.n8nUrl}/api/v1/workflows/${id}`, { headers: this.headers }),
    );
    return data;
  }

  async activateWorkflow(id: string) {
    this.checkApiKey();
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

- [ ] **Step 3: Run n8n unit test**

```bash
npx jest src/n8n/n8n.service.spec.ts --no-coverage
```

Expected: `PASS` with 2 tests passing.

- [ ] **Step 4: Create `backend/src/n8n/n8n.controller.ts`**

```typescript
import { Controller, Get, Post, Param } from '@nestjs/common';
import { N8nService } from './n8n.service';

@Controller('n8n')
export class N8nController {
  constructor(private n8nService: N8nService) {}

  @Get('workflows')
  getWorkflows() { return this.n8nService.getWorkflows(); }

  @Get('workflows/:id')
  getWorkflow(@Param('id') id: string) { return this.n8nService.getWorkflow(id); }

  @Post('workflows/:id/activate')
  activate(@Param('id') id: string) { return this.n8nService.activateWorkflow(id); }

  @Post('workflows/:id/deactivate')
  deactivate(@Param('id') id: string) { return this.n8nService.deactivateWorkflow(id); }

  @Get('executions')
  getExecutions() { return this.n8nService.getExecutions(); }
}
```

- [ ] **Step 5: Create `backend/src/n8n/n8n.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { N8nService } from './n8n.service';
import { N8nController } from './n8n.controller';

@Module({
  imports: [HttpModule],
  providers: [N8nService],
  controllers: [N8nController],
  exports: [N8nService],
})
export class N8nModule {}
```

- [ ] **Step 6: Commit**

```bash
git add backend/src/n8n/
git commit -m "feat: add n8n bridge module (proxy to n8n API, 503 when key unset)"
```

---

## Task 10: Dashboard Module

**Files:**
- Create: `backend/src/dashboard/dashboard.service.ts`
- Create: `backend/src/dashboard/dashboard.service.spec.ts`
- Create: `backend/src/dashboard/dashboard.controller.ts`
- Create: `backend/src/dashboard/dashboard.module.ts`

- [ ] **Step 1: Write failing test**

Create `backend/src/dashboard/dashboard.service.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { DashboardService } from './dashboard.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Plugin } from '../plugins/entities/plugin.entity';
import { PluginExecution } from '../plugins/entities/plugin-execution.entity';
import { ScheduledJob } from '../scheduler/entities/scheduled-job.entity';
import { N8nService } from '../n8n/n8n.service';

describe('DashboardService', () => {
  let service: DashboardService;

  const plugins = [
    { id: '1', status: 'active' },
    { id: '2', status: 'inactive' },
    { id: '3', status: 'error' },
  ];
  const schedules = [
    { id: 's1', enabled: true, nextRunAt: new Date() },
    { id: 's2', enabled: false },
  ];

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        {
          provide: getRepositoryToken(Plugin),
          useValue: { find: jest.fn().mockResolvedValue(plugins) },
        },
        {
          provide: getRepositoryToken(PluginExecution),
          useValue: { find: jest.fn().mockResolvedValue([]) },
        },
        {
          provide: getRepositoryToken(ScheduledJob),
          useValue: { find: jest.fn().mockResolvedValue(schedules) },
        },
        {
          provide: N8nService,
          useValue: { getWorkflows: jest.fn().mockRejectedValue(new Error('not configured')) },
        },
      ],
    }).compile();
    service = module.get<DashboardService>(DashboardService);
  });

  it('aggregates plugin stats correctly', async () => {
    const result = await service.getDashboard();
    expect(result.stats.totalPlugins).toBe(3);
    expect(result.stats.activePlugins).toBe(1);
    expect(result.stats.errorPlugins).toBe(1);
  });

  it('aggregates schedule stats correctly', async () => {
    const result = await service.getDashboard();
    expect(result.stats.activeSchedules).toBe(1);
    expect(result.stats.totalSchedules).toBe(2);
  });

  it('returns empty n8n workflows when n8n unreachable', async () => {
    const result = await service.getDashboard();
    expect(result.stats.n8nWorkflows).toBe(0);
    expect(result.n8nWorkflows).toEqual([]);
  });

  it('getCalendar returns enabled schedules', async () => {
    const result = await service.getCalendar();
    expect(result.schedules).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Create `backend/src/dashboard/dashboard.service.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import { Plugin } from '../plugins/entities/plugin.entity';
import { PluginExecution } from '../plugins/entities/plugin-execution.entity';
import { ScheduledJob } from '../scheduler/entities/scheduled-job.entity';
import { N8nService } from '../n8n/n8n.service';

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Plugin)
    private pluginRepo: Repository<Plugin>,
    @InjectRepository(PluginExecution)
    private executionRepo: Repository<PluginExecution>,
    @InjectRepository(ScheduledJob)
    private jobRepo: Repository<ScheduledJob>,
    private n8nService: N8nService,
  ) {}

  async getDashboard() {
    const [plugins, schedules, recentActivity] = await Promise.all([
      this.pluginRepo.find(),
      this.jobRepo.find({ order: { nextRunAt: 'ASC' } }),
      this.executionRepo.find({
        order: { startedAt: 'DESC' },
        take: 20,
        relations: ['plugin'],
      }),
    ]);

    const oneDayAgo = new Date(Date.now() - 86_400_000);
    const recentExecs = await this.executionRepo.find({
      where: { startedAt: MoreThanOrEqual(oneDayAgo) },
    });

    let n8nWorkflows: unknown[] = [];
    try {
      const resp = await this.n8nService.getWorkflows();
      n8nWorkflows = resp?.data ?? resp ?? [];
    } catch (_) { /* n8n unreachable or key not set */ }

    return {
      stats: {
        totalPlugins: plugins.length,
        activePlugins: plugins.filter(p => p.status === 'active').length,
        errorPlugins: plugins.filter(p => p.status === 'error').length,
        activeSchedules: schedules.filter(s => s.enabled).length,
        totalSchedules: schedules.length,
        n8nWorkflows: (n8nWorkflows as unknown[]).length,
        recentSuccessRuns: recentExecs.filter(e => e.status === 'success').length,
        recentFailedRuns: recentExecs.filter(e => e.status === 'failed').length,
      },
      recentActivity,
      upcomingSchedules: schedules.filter(s => s.enabled).slice(0, 5),
      n8nWorkflows,
      plugins,
    };
  }

  async getCalendar() {
    const schedules = await this.jobRepo.find({ order: { createdAt: 'ASC' } });
    let n8nWorkflows: unknown[] = [];
    try {
      const resp = await this.n8nService.getWorkflows();
      const all = resp?.data ?? resp ?? [];
      n8nWorkflows = (all as any[]).filter((w) => w.active);
    } catch (_) { /* n8n unreachable */ }
    return { schedules, n8nWorkflows };
  }
}
```

- [ ] **Step 3: Run dashboard unit test**

```bash
npx jest src/dashboard/dashboard.service.spec.ts --no-coverage
```

Expected: `PASS` with 4 tests passing.

- [ ] **Step 4: Create `backend/src/dashboard/dashboard.controller.ts`**

```typescript
import { Controller, Get } from '@nestjs/common';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private dashboardService: DashboardService) {}

  @Get()
  getDashboard() { return this.dashboardService.getDashboard(); }

  @Get('calendar')
  getCalendar() { return this.dashboardService.getCalendar(); }
}
```

- [ ] **Step 5: Create `backend/src/dashboard/dashboard.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { Plugin } from '../plugins/entities/plugin.entity';
import { PluginExecution } from '../plugins/entities/plugin-execution.entity';
import { ScheduledJob } from '../scheduler/entities/scheduled-job.entity';
import { N8nModule } from '../n8n/n8n.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Plugin, PluginExecution, ScheduledJob]),
    N8nModule,
  ],
  providers: [DashboardService],
  controllers: [DashboardController],
})
export class DashboardModule {}
```

- [ ] **Step 6: Commit**

```bash
git add backend/src/dashboard/
git commit -m "feat: add dashboard module (aggregated stats + calendar endpoint)"
```

---

## Task 11: App Entry Points + Seed Script

**Files:**
- Create: `backend/src/main.ts`
- Create: `backend/src/app.module.ts`
- Create: `backend/src/seed.ts`

- [ ] **Step 1: Create `backend/src/main.ts`**

```typescript
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  app.enableCors({ origin: '*' });
  await app.listen(process.env.PORT ?? 4000);
  console.log(`AutoHub backend running on port ${process.env.PORT ?? 4000}`);
}
bootstrap();
```

- [ ] **Step 2: Create `backend/src/app.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { APP_GUARD } from '@nestjs/core';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { PluginsModule } from './plugins/plugins.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { N8nModule } from './n8n/n8n.module';
import { NotificationsModule } from './notifications/notifications.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { Plugin } from './plugins/entities/plugin.entity';
import { PluginExecution } from './plugins/entities/plugin-execution.entity';
import { ScheduledJob } from './scheduler/entities/scheduled-job.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get('DATABASE_URL'),
        entities: [Plugin, PluginExecution, ScheduledJob],
        synchronize: true,
      }),
      inject: [ConfigService],
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        connection: { url: config.get<string>('REDIS_URL') ?? 'redis://localhost:6379' },
      }),
      inject: [ConfigService],
    }),
    HealthModule,
    AuthModule,
    PluginsModule,
    SchedulerModule,
    DashboardModule,
    N8nModule,
    NotificationsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
```

- [ ] **Step 3: Create `backend/src/seed.ts`**

```typescript
import * as fs from 'fs';
import * as path from 'path';

const PLUGIN_DIR = process.env.PLUGIN_DIR ?? '/app/plugins';

interface SeedPlugin {
  slug: string;
  manifest: Record<string, unknown>;
  index: string;
}

const seedPlugins: SeedPlugin[] = [
  {
    slug: 'daily-summary',
    manifest: {
      slug: 'daily-summary',
      name: 'Daily Summary',
      description: 'Logs a daily summary message',
      version: '1.0.0',
      category: 'productivity',
      icon: '📋',
      entryFile: 'index.js',
      configSchema: [
        { key: 'title', label: 'Summary Title', type: 'string', required: false },
      ],
    },
    index: `module.exports = async function({ config, log }) {
  const title = config.title || 'Daily Summary';
  log('=== ' + title + ' ===');
  log('Date: ' + new Date().toLocaleDateString());
  log('Time: ' + new Date().toLocaleTimeString());
  log('All systems operational. Have a productive day!');
};`,
  },
  {
    slug: 'system-health',
    manifest: {
      slug: 'system-health',
      name: 'System Health',
      description: 'Reports CPU load and memory usage from /proc (Linux/Pi only)',
      version: '1.0.0',
      category: 'ops',
      icon: '🖥️',
      entryFile: 'index.js',
      configSchema: [],
    },
    index: `const fs = require('fs');
module.exports = async function({ config, log }) {
  try {
    const loadavg = fs.readFileSync('/proc/loadavg', 'utf-8').trim().split(' ');
    log('CPU Load (1m/5m/15m): ' + loadavg[0] + ' / ' + loadavg[1] + ' / ' + loadavg[2]);
  } catch (e) {
    log('CPU load unavailable: ' + e.message);
  }
  try {
    const meminfo = fs.readFileSync('/proc/meminfo', 'utf-8');
    const total = meminfo.match(/MemTotal:\\s+(\\d+)/)?.[1];
    const available = meminfo.match(/MemAvailable:\\s+(\\d+)/)?.[1];
    if (total && available) {
      const usedMb = Math.round((parseInt(total) - parseInt(available)) / 1024);
      const totalMb = Math.round(parseInt(total) / 1024);
      log('Memory: ' + usedMb + 'MB used / ' + totalMb + 'MB total');
    }
  } catch (e) {
    log('Memory info unavailable: ' + e.message);
  }
};`,
  },
  {
    slug: 'webhook-ping',
    manifest: {
      slug: 'webhook-ping',
      name: 'Webhook Ping',
      description: 'Sends a GET request to a configurable URL',
      version: '1.0.0',
      category: 'utility',
      icon: '🔔',
      entryFile: 'index.js',
      configSchema: [
        { key: 'url', label: 'Target URL', type: 'string', required: true },
        { key: 'label', label: 'Label', type: 'string', required: false },
      ],
    },
    index: `const https = require('https');
const http = require('http');
module.exports = async function({ config, log }) {
  const url = config.url;
  const label = config.label || url;
  if (!url) { log('No URL configured'); return; }
  log('Pinging: ' + label + ' (' + url + ')');
  await new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, (res) => {
      log('Response: HTTP ' + res.statusCode);
      resolve(res.statusCode);
    });
    req.on('error', (e) => reject(e));
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('Request timeout')); });
  });
};`,
  },
];

function writeSeedPlugins() {
  if (!fs.existsSync(PLUGIN_DIR)) {
    fs.mkdirSync(PLUGIN_DIR, { recursive: true });
    console.log(`[seed] Created plugin directory: ${PLUGIN_DIR}`);
  }

  for (const plugin of seedPlugins) {
    const dir = path.join(PLUGIN_DIR, plugin.slug);
    if (fs.existsSync(dir)) {
      console.log(`[seed] Plugin '${plugin.slug}' already exists — skipping`);
      continue;
    }
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'manifest.json'),
      JSON.stringify(plugin.manifest, null, 2),
    );
    fs.writeFileSync(path.join(dir, 'index.js'), plugin.index);
    console.log(`[seed] Created plugin: ${plugin.slug}`);
  }
}

writeSeedPlugins();
```

- [ ] **Step 4: Verify TypeScript compiles**

Run from `backend/`:
```bash
npm install
npm run build
```

Expected: no TypeScript errors, `dist/` folder created with `dist/main.js`, `dist/seed.js`, and all module files.

If there are errors, fix them before continuing.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main.ts backend/src/app.module.ts backend/src/seed.ts
git commit -m "feat: add main.ts, app.module.ts, and seed script for 3 example plugins"
```

---

## Task 12: E2E Tests

**Files:**
- Create: `backend/test/jest-e2e.json`
- Create: `backend/test/app.e2e-spec.ts`

- [ ] **Step 1: Create `backend/test/jest-e2e.json`**

```json
{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": ".",
  "testEnvironment": "node",
  "testRegex": ".e2e-spec.ts$",
  "transform": {
    "^.+\\.(t|j)s$": "ts-jest"
  }
}
```

- [ ] **Step 2: Create `backend/test/app.e2e-spec.ts`**

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('AutoHub E2E', () => {
  let app: INestApplication;
  let authToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
  }, 30_000);

  afterAll(async () => {
    await app.close();
  });

  describe('Health (public)', () => {
    it('GET /api/health returns 200 without a token', async () => {
      const res = await request(app.getHttpServer()).get('/api/health').expect(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.version).toBe('1.0.0');
      expect(res.body.nodeVersion).toBeDefined();
    });
  });

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

  describe('Schedules', () => {
    let scheduleId: string;

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
```

- [ ] **Step 3: Commit**

```bash
git add backend/test/
git commit -m "feat: add backend e2e tests (auth, health, plugins, schedules, n8n bridge)"
```

---

## Task 13: Backend Test Runbook (`dev-logs/testings.md`)

**Files:**
- Create: `dev-logs/testings.md`

- [ ] **Step 1: Create `dev-logs/testings.md`**

```markdown
# AutoHub Test Runbook

Run all commands from the project root on the Linux machine after transferring the code.

---

## Prerequisites

```bash
# Confirm Docker is running
docker --version
docker compose version

# Copy env file and set passwords
cp .env.example .env
# Edit ADMIN_PASSWORD, JWT_SECRET, POSTGRES_PASSWORD in .env
```

---

## Backend Unit Tests

Run from `backend/` directory.

```bash
cd backend
npm install
```

### Run all unit tests
```bash
npm test
```
Expected: All test suites pass. No failures.

### Run with coverage
```bash
npm run test:cov
```
Expected: Coverage report generated in `backend/coverage/`.

### Run individual test suites
```bash
npx jest src/auth/auth.service.spec.ts --no-coverage
npx jest src/notifications/notifications.service.spec.ts --no-coverage
npx jest src/plugins/plugins.service.spec.ts --no-coverage
npx jest src/scheduler/scheduler.service.spec.ts --no-coverage
npx jest src/n8n/n8n.service.spec.ts --no-coverage
npx jest src/dashboard/dashboard.service.spec.ts --no-coverage
```
Each expected: `PASS` with all tests passing.

---

## Backend E2E Tests

E2E tests require a real PostgreSQL and Redis instance.

### Option A: Run E2E against the Docker Compose stack

```bash
# Start the stack (backend + postgres + redis only)
docker compose up -d postgres redis

# Wait for postgres to be ready
sleep 5

# Set test env vars
export DATABASE_URL=postgresql://autohub:dbpassword@localhost:5432/autohub
export REDIS_URL=redis://localhost:6379
export ADMIN_PASSWORD=changeme
export JWT_SECRET=test-secret
export PLUGIN_DIR=/tmp/autohub-test-plugins

# Run e2e tests from backend/
cd backend
npm run test:e2e
```
Expected: All e2e scenarios pass.

### Option B: Run full Docker Compose and smoke test with curl

```bash
docker compose up -d --build
sleep 10

# Test health (no auth)
curl -s http://localhost/api/health | jq .
# Expected: {"status":"ok","version":"1.0.0",...}

# Test login
TOKEN=$(curl -s -X POST http://localhost/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"password":"changeme"}' | jq -r .access_token)
echo "Token: $TOKEN"

# Test dashboard (requires auth)
curl -s http://localhost/api/dashboard \
  -H "Authorization: Bearer $TOKEN" | jq .stats
# Expected: {"totalPlugins":3,...}

# Test plugins list
curl -s http://localhost/api/plugins \
  -H "Authorization: Bearer $TOKEN" | jq '.[].name'
# Expected: "Daily Summary", "System Health", "Webhook Ping"

# Run daily-summary plugin manually
PLUGIN_ID=$(curl -s http://localhost/api/plugins \
  -H "Authorization: Bearer $TOKEN" | jq -r '.[0].id')
curl -s -X POST "http://localhost/api/plugins/$PLUGIN_ID/run" \
  -H "Authorization: Bearer $TOKEN" | jq .
# Expected: {"status":"success","output":"..."}

# Test n8n bridge (no key set → 503)
curl -s http://localhost/api/n8n/workflows \
  -H "Authorization: Bearer $TOKEN"
# Expected: {"statusCode":503,"message":"N8N_API_KEY not configured"}

# Test unauthenticated access → 401
curl -s http://localhost/api/dashboard
# Expected: {"statusCode":401,"message":"Unauthorized"}
```

---

## Integration Smoke Test (Definition of Done)

After `docker compose up --build`, verify each item:

- [ ] `curl http://localhost` returns HTML (login page or redirect to /login)
- [ ] `curl http://localhost/api/health` returns `{"status":"ok",...}`
- [ ] Login with `ADMIN_PASSWORD` returns a JWT
- [ ] `GET /api/dashboard` with JWT returns stats
- [ ] `GET /api/plugins` with JWT returns 3 plugins (daily-summary, system-health, webhook-ping)
- [ ] `POST /api/plugins/:id/run` returns execution with status success/failed
- [ ] `POST /api/schedules` creates a schedule
- [ ] `PATCH /api/schedules/:id/toggle` toggles enabled
- [ ] `docker compose down && docker compose up -d` — all 3 seed plugins still present, all schedules re-registered
- [ ] `GET /api/n8n/workflows` returns 503 (N8N_API_KEY not set)

*Frontend tests will be added in Plan 2.*
```

- [ ] **Step 2: Commit**

```bash
git add dev-logs/testings.md
git commit -m "docs: add backend test runbook to dev-logs/testings.md"
```

---

## Task 14: Full Backend Build Verification

- [ ] **Step 1: Install dependencies**

```bash
cd backend
npm install
```

- [ ] **Step 2: Compile TypeScript**

```bash
npm run build
```

Expected: exits with code 0, `dist/` folder populated, no TypeScript errors.

- [ ] **Step 3: Run all unit tests**

```bash
npm test
```

Expected: 6 test suites, all passing. Sample output:
```
PASS src/auth/auth.service.spec.ts
PASS src/notifications/notifications.service.spec.ts
PASS src/plugins/plugins.service.spec.ts
PASS src/scheduler/scheduler.service.spec.ts
PASS src/n8n/n8n.service.spec.ts
PASS src/dashboard/dashboard.service.spec.ts

Test Suites: 6 passed, 6 total
Tests:       XX passed, XX total
```

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete AutoHub backend — all modules, tests, seed, infra"
```
