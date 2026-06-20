# Terminal: claude User, Repo Picker & Clone Flow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the browser terminal to run as a dedicated `claude` Linux user, always show a workspace/repo picker on page load, and offer a REST-based clone flow for repos not yet present in `/home/claude/github`.

**Architecture:** The terminal service (Node.js/express) gains two REST endpoints (`GET /repos`, `POST /clone`) guarded by JWT auth. The backend proxies those via two new NestJS controller methods. The frontend replaces the single directory picker with a three-step flow (workspace → repo list → optional clone), implemented as four small components orchestrated by `page.tsx`.

**Tech Stack:** Node.js 20, Express, node-pty, ws, jsonwebtoken, jest, supertest (terminal service); NestJS 10, TypeScript (backend); Next.js 14, React 18, Vitest, @testing-library/react (frontend).

## Global Constraints

- Dark palette: `#0d0d0d` page bg, `#1a1a1a` card bg, `#2a2a2a` border, `#10b981` green accent, `#ef4444` error red, `#6b7280` muted text, `#e5e7eb` body text
- No localStorage auto-restore of last directory — picker shows on every page load
- All terminal service HTTP endpoints require `Authorization: Bearer <jwt>` header
- Frontend calls backend at `/api/terminal/*` only — never directly to `:7681`
- `claude` Linux user uid/gid (e.g. 1001:1001) must be discovered on Pi before updating docker-compose

---

## File Map

| Action | Path |
|---|---|
| **Modify** | `docker-compose.yml` — terminal service user/volumes/env |
| **Rewrite** | `terminal/src/server.js` — cwd prefix check, claude env, /repos, /clone |
| **Create** | `terminal/src/server.test.js` — jest + supertest tests for all new logic |
| **Modify** | `terminal/package.json` — add jest, supertest devDependencies + test script |
| **Modify** | `backend/src/terminal/terminal.controller.ts` — add getRepos, cloneRepo proxy methods |
| **Modify** | `backend/src/terminal/terminal.controller.spec.ts` — tests for new proxy methods |
| **Create** | `frontend/src/app/(app)/terminal/components/WorkspacePicker.tsx` |
| **Create** | `frontend/src/app/(app)/terminal/components/WorkspacePicker.test.tsx` |
| **Create** | `frontend/src/app/(app)/terminal/components/RepoPicker.tsx` |
| **Create** | `frontend/src/app/(app)/terminal/components/RepoPicker.test.tsx` |
| **Create** | `frontend/src/app/(app)/terminal/components/CloneDialog.tsx` |
| **Create** | `frontend/src/app/(app)/terminal/components/CloneDialog.test.tsx` |
| **Create** | `frontend/src/app/(app)/terminal/components/TerminalBreadcrumb.tsx` |
| **Create** | `frontend/src/app/(app)/terminal/components/TerminalBreadcrumb.test.tsx` |
| **Rewrite** | `frontend/src/app/(app)/terminal/page.tsx` — step-based orchestration |

---

### Task 1: System Setup + Docker Infrastructure

**Files:**
- Modify: `docker-compose.yml`

**Interfaces:**
- Produces: terminal container runs as `claude` user, mounts `/home/claude` and `/home/claude/github`, `TERMINAL_DIRS=/workspace/claude-home,/workspace/github`

- [ ] **Step 1: Create the `claude` Linux user on the Pi**

Run these commands as `dama` on the Raspberry Pi host (not inside Docker):

```bash
sudo useradd -m -s /bin/bash -G adm,dialout,cdrom,sudo,audio,video,plugdev,games,users,input,render,netdev,spi,i2c,gpio,docker claude
sudo mkdir -p /home/claude/github
sudo chown claude:claude /home/claude /home/claude/github
```

Then note claude's uid and gid:

```bash
id claude
# uid=1001(claude) gid=1001(claude) groups=...
```

- [ ] **Step 2: Update `docker-compose.yml` terminal service**

Replace the `terminal:` block (currently lines 69–78) with:

```yaml
  terminal:
    build: ./terminal
    user: "1001:1001"
    environment:
      JWT_SECRET: ${JWT_SECRET}
      TERMINAL_DIRS: /workspace/claude-home,/workspace/github
    volumes:
      - /home/claude:/workspace/claude-home:rw
      - /home/claude/github:/workspace/github:rw
    restart: unless-stopped
```

Replace `1001:1001` with the actual uid:gid from Step 1 if different.

- [ ] **Step 3: Verify docker-compose config is valid**

Run from `/home/dama/repo/auto-hub`:

```bash
docker compose config --quiet && echo "OK"
```

Expected: `OK` with no errors.

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml
git commit -m "feat: run terminal service as claude user with /home/claude mounts"
```

---

### Task 2: Terminal Service Rewrite + Tests

**Files:**
- Modify: `terminal/package.json`
- Rewrite: `terminal/src/server.js`
- Create: `terminal/src/server.test.js`

**Interfaces:**
- Produces:
  - `isValidCwd(cwd: string): boolean` — exported from server.js
  - `GET /repos` → `[{ name: string, path: string, isGitRepo: boolean }]`
  - `POST /clone` `{ url: string, name?: string }` → `{ path: string }` or `{ error: string }`
  - WebSocket spawns bash as USER=claude, HOME=/workspace/claude-home

- [ ] **Step 1: Add jest and supertest devDependencies**

Replace `terminal/package.json` with:

```json
{
  "name": "autohub-terminal",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "start": "node src/server.js",
    "test": "jest"
  },
  "dependencies": {
    "express": "^4.19.2",
    "jsonwebtoken": "^9.0.2",
    "node-pty": "^1.0.0",
    "ws": "^8.17.1"
  },
  "devDependencies": {
    "jest": "^29.0.0",
    "supertest": "^6.0.0"
  },
  "jest": {
    "testEnvironment": "node"
  }
}
```

Run:

```bash
cd /home/dama/repo/auto-hub/terminal && npm install
```

Expected: `added N packages` with no errors.

- [ ] **Step 2: Write failing tests for isValidCwd + spawn env + /repos + /clone**

Create `terminal/src/server.test.js`:

```javascript
process.env.JWT_SECRET = 'test-secret';
process.env.TERMINAL_DIRS = '/workspace/claude-home,/workspace/github';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const cp = require('child_process');

const { app, isValidCwd } = require('./server');

const token = jwt.sign({ sub: 1 }, 'test-secret');
const auth = `Bearer ${token}`;

describe('isValidCwd', () => {
  it('accepts exact dir match', () =>
    expect(isValidCwd('/workspace/claude-home')).toBe(true));

  it('accepts subdirectory of configured dir', () =>
    expect(isValidCwd('/workspace/github/my-repo')).toBe(true));

  it('rejects unrelated path', () =>
    expect(isValidCwd('/etc/passwd')).toBe(false));

  it('rejects path that shares prefix but no slash boundary', () =>
    expect(isValidCwd('/workspace/github-evil')).toBe(false));
});

describe('GET /repos', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns 401 without Authorization header', async () => {
    await request(app).get('/repos').expect(401);
  });

  it('returns repo list with isGitRepo flag', async () => {
    jest.spyOn(fs, 'readdirSync').mockReturnValue([
      { name: 'auto-hub', isDirectory: () => true },
    ]);
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);

    const res = await request(app)
      .get('/repos')
      .set('authorization', auth)
      .expect(200);

    expect(res.body).toEqual([{
      name: 'auto-hub',
      path: '/workspace/github/auto-hub',
      isGitRepo: true,
    }]);
  });

  it('returns empty array when github dir is missing', async () => {
    jest.spyOn(fs, 'readdirSync').mockImplementation(() => {
      throw new Error('ENOENT');
    });

    const res = await request(app)
      .get('/repos')
      .set('authorization', auth)
      .expect(200);

    expect(res.body).toEqual([]);
  });

  it('excludes non-directory entries', async () => {
    jest.spyOn(fs, 'readdirSync').mockReturnValue([
      { name: 'README.md', isDirectory: () => false },
      { name: 'my-repo', isDirectory: () => true },
    ]);
    jest.spyOn(fs, 'existsSync').mockReturnValue(false);

    const res = await request(app)
      .get('/repos')
      .set('authorization', auth)
      .expect(200);

    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('my-repo');
  });
});

describe('POST /clone', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns 401 without Authorization header', async () => {
    await request(app)
      .post('/clone')
      .send({ url: 'https://github.com/u/r' })
      .expect(401);
  });

  it('returns 400 when url is missing', async () => {
    await request(app)
      .post('/clone')
      .set('authorization', auth)
      .send({})
      .expect(400);
  });

  it('returns 409 when target directory already exists', async () => {
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);

    await request(app)
      .post('/clone')
      .set('authorization', auth)
      .send({ url: 'https://github.com/u/my-repo' })
      .expect(409);
  });

  it('clones and returns path on success', async () => {
    jest.spyOn(fs, 'existsSync').mockReturnValue(false);
    jest.spyOn(cp, 'execFile').mockImplementation((_cmd, _args, _opts, cb) =>
      cb(null, '', ''));

    const res = await request(app)
      .post('/clone')
      .set('authorization', auth)
      .send({ url: 'https://github.com/u/my-repo' })
      .expect(200);

    expect(res.body).toEqual({ path: '/workspace/github/my-repo' });
  });

  it('uses explicit name param when provided', async () => {
    jest.spyOn(fs, 'existsSync').mockReturnValue(false);
    jest.spyOn(cp, 'execFile').mockImplementation((_cmd, args, _opts, cb) => {
      expect(args[2]).toBe('/workspace/github/custom-name');
      cb(null, '', '');
    });

    await request(app)
      .post('/clone')
      .set('authorization', auth)
      .send({ url: 'https://github.com/u/my-repo', name: 'custom-name' })
      .expect(200);
  });

  it('returns 500 with first stderr line on clone failure', async () => {
    jest.spyOn(fs, 'existsSync').mockReturnValue(false);
    jest.spyOn(cp, 'execFile').mockImplementation((_cmd, _args, _opts, cb) =>
      cb(new Error('exit 128'), '', 'fatal: repository not found\n'));

    const res = await request(app)
      .post('/clone')
      .set('authorization', auth)
      .send({ url: 'https://github.com/u/bad-repo' })
      .expect(500);

    expect(res.body.error).toBe('fatal: repository not found');
  });

  it('returns 400 for invalid repo name with path traversal', async () => {
    await request(app)
      .post('/clone')
      .set('authorization', auth)
      .send({ url: 'https://github.com/u/repo', name: '../etc' })
      .expect(400);
  });
});
```

- [ ] **Step 3: Run tests — verify they fail**

```bash
cd /home/dama/repo/auto-hub/terminal && npm test
```

Expected: multiple failures including `Cannot find module './server'` or export errors.

- [ ] **Step 4: Rewrite `terminal/src/server.js`**

Replace the entire file with:

```javascript
'use strict';
const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const nodePty = require('node-pty');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET env var is required');
  process.exit(1);
}

const TERMINAL_DIRS = (process.env.TERMINAL_DIRS ?? '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const GITHUB_DIR = '/workspace/github';

function isValidCwd(cwd) {
  return TERMINAL_DIRS.some(dir => cwd === dir || cwd.startsWith(dir + '/'));
}

function requireAuth(req, res) {
  const authHeader = req.headers['authorization'] ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  try {
    jwt.verify(token, JWT_SECRET);
    return true;
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
}

const app = express();
app.use(express.json());
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.get('/repos', (req, res) => {
  if (!requireAuth(req, res)) return;
  let entries;
  try {
    entries = fs.readdirSync(GITHUB_DIR, { withFileTypes: true });
  } catch {
    return res.json([]);
  }
  const repos = entries
    .filter(e => e.isDirectory())
    .map(e => ({
      name: e.name,
      path: path.join(GITHUB_DIR, e.name),
      isGitRepo: fs.existsSync(path.join(GITHUB_DIR, e.name, '.git')),
    }));
  res.json(repos);
});

app.post('/clone', (req, res) => {
  if (!requireAuth(req, res)) return;
  const { url, name } = req.body ?? {};
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'url is required' });
  }
  const repoName = (name?.trim() || url.split('/').pop()?.replace(/\.git$/, '') || '').trim();
  if (!repoName || repoName.includes('/') || repoName.includes('..')) {
    return res.status(400).json({ error: 'Invalid repo name' });
  }
  const targetPath = path.join(GITHUB_DIR, repoName);
  if (fs.existsSync(targetPath)) {
    return res.status(409).json({ error: `Directory "${repoName}" already exists` });
  }
  cp.execFile('git', ['clone', url, targetPath], { timeout: 120_000 }, (err, _stdout, stderr) => {
    if (err) {
      const detail = (stderr ?? '').split('\n').filter(Boolean)[0] ?? err.message;
      return res.status(500).json({ error: err.killed ? 'Clone timed out. Try again.' : detail });
    }
    res.json({ path: targetPath });
  });
});

wss.on('connection', (ws, req) => {
  const params = new URL(req.url, 'http://localhost').searchParams;
  const token = params.get('token') ?? '';
  const cwd = params.get('cwd') ?? '';

  try {
    jwt.verify(token, JWT_SECRET);
  } catch {
    ws.close(4401, 'Unauthorized');
    return;
  }

  if (!cwd || !isValidCwd(cwd)) {
    ws.close(4400, 'Bad cwd');
    return;
  }

  let pty;
  let ptyDead = false;
  try {
    pty = nodePty.spawn('bash', ['-l'], {
      name: 'xterm-256color',
      cwd,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        HOME: '/workspace/claude-home',
        USER: 'claude',
        LOGNAME: 'claude',
        SHELL: '/bin/bash',
      },
      cols: 80,
      rows: 24,
    });
  } catch {
    ws.close(4500, 'Spawn failed');
    return;
  }

  pty.onData(data => { if (ws.readyState === ws.OPEN) ws.send(data); });
  pty.onExit(() => { ptyDead = true; ws.close(1000, 'Process exited'); });

  ws.on('message', raw => {
    if (ptyDead) return;
    const msg = raw.toString();
    try {
      const parsed = JSON.parse(msg);
      if (parsed.type === 'resize' && parsed.cols && parsed.rows) {
        pty.resize(Number(parsed.cols), Number(parsed.rows));
        return;
      }
    } catch { /* raw terminal input */ }
    pty.write(msg);
  });

  ws.on('close', () => { if (!ptyDead) pty.kill(); });
});

const PORT = 7681;
if (require.main === module) {
  server.listen(PORT, () => console.log(`Terminal service listening on :${PORT}`));
}

module.exports = { app, server, isValidCwd };
```

- [ ] **Step 5: Run tests — verify they pass**

```bash
cd /home/dama/repo/auto-hub/terminal && npm test
```

Expected: all tests pass, output ends with `Tests: N passed`.

- [ ] **Step 6: Commit**

```bash
git add terminal/package.json terminal/src/server.js terminal/src/server.test.js
git commit -m "feat: add /repos and /clone endpoints, fix cwd prefix check, spawn as claude user"
```

---

### Task 3: Backend Proxy Endpoints

**Files:**
- Modify: `backend/src/terminal/terminal.controller.ts`
- Modify: `backend/src/terminal/terminal.controller.spec.ts`

**Interfaces:**
- Consumes: `GET http://terminal:7681/repos` and `POST http://terminal:7681/clone` (from Task 2)
- Produces:
  - `GET /api/terminal/repos` → `RepoEntry[]`
  - `POST /api/terminal/clone` `{ url: string, name?: string }` → `{ path: string }`

- [ ] **Step 1: Add proxy method tests to the spec file**

Append these `describe` blocks to `backend/src/terminal/terminal.controller.spec.ts` (inside the outer `describe('TerminalController', ...)` block, after the existing `it(...)` calls):

```typescript
  describe('getRepos', () => {
    afterEach(() => jest.resetAllMocks());

    it('proxies to terminal service forwarding auth header', async () => {
      const mockRepos = [{ name: 'auto-hub', path: '/workspace/github/auto-hub', isGitRepo: true }];
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => mockRepos,
      } as unknown as Response);

      const result = await controller.getRepos('Bearer test-token');

      expect(global.fetch).toHaveBeenCalledWith('http://terminal:7681/repos', {
        headers: { authorization: 'Bearer test-token' },
      });
      expect(result).toEqual(mockRepos);
    });

    it('throws 503 when terminal service is unreachable', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
      await expect(controller.getRepos('Bearer token')).rejects.toThrow(HttpException);
    });

    it('throws with upstream status when terminal service returns error', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      } as unknown as Response);
      await expect(controller.getRepos('Bearer bad')).rejects.toThrow(HttpException);
    });
  });

  describe('cloneRepo', () => {
    afterEach(() => jest.resetAllMocks());

    it('proxies clone request forwarding auth header', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ path: '/workspace/github/my-repo' }),
      } as unknown as Response);

      const result = await controller.cloneRepo(
        { url: 'https://github.com/u/my-repo' },
        'Bearer test-token',
      );

      expect(global.fetch).toHaveBeenCalledWith('http://terminal:7681/clone', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer test-token' },
        body: JSON.stringify({ url: 'https://github.com/u/my-repo' }),
      });
      expect(result).toEqual({ path: '/workspace/github/my-repo' });
    });

    it('throws 503 when terminal service is unreachable', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
      await expect(
        controller.cloneRepo({ url: 'https://github.com/u/r' }, 'Bearer token'),
      ).rejects.toThrow(HttpException);
    });

    it('throws with clone error payload when terminal service returns error', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({ error: 'Directory already exists' }),
      } as unknown as Response);
      await expect(
        controller.cloneRepo({ url: 'https://github.com/u/r' }, 'Bearer token'),
      ).rejects.toThrow(HttpException);
    });
  });
```

Also add `HttpException` to the import at the top of the spec file:

```typescript
import { HttpException } from '@nestjs/common';
import { TerminalController } from './terminal.controller';
```

- [ ] **Step 2: Run backend tests — verify new tests fail**

```bash
cd /home/dama/repo/auto-hub/backend && npm test -- terminal.controller
```

Expected: existing tests pass, new `getRepos` and `cloneRepo` tests fail with "not a function".

- [ ] **Step 3: Update `backend/src/terminal/terminal.controller.ts`**

Replace the entire file with:

```typescript
import { Controller, Get, Post, Body, Headers, HttpException, HttpStatus } from '@nestjs/common';

interface DirEntry {
  label: string;
  path: string;
}

interface RepoEntry {
  name: string;
  path: string;
  isGitRepo: boolean;
}

interface CloneBody {
  url: string;
  name?: string;
}

const LABEL_MAP: Record<string, string> = {
  '/workspace/home': 'Home',
  '/workspace/repo': 'Repos',
};

const TERMINAL_SERVICE = 'http://terminal:7681';

@Controller('terminal')
export class TerminalController {
  @Get('dirs')
  getDirs(): DirEntry[] {
    return (process.env.TERMINAL_DIRS ?? '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
      .map(path => ({
        label: LABEL_MAP[path] ?? path.split('/').pop() ?? path,
        path,
      }));
  }

  @Get('repos')
  async getRepos(@Headers('authorization') auth: string): Promise<RepoEntry[]> {
    let res: Response;
    try {
      res = await fetch(`${TERMINAL_SERVICE}/repos`, {
        headers: { authorization: auth ?? '' },
      });
    } catch {
      throw new HttpException('Terminal service unavailable', HttpStatus.SERVICE_UNAVAILABLE);
    }
    if (!res.ok) throw new HttpException(await res.text(), res.status);
    return res.json() as Promise<RepoEntry[]>;
  }

  @Post('clone')
  async cloneRepo(
    @Body() body: CloneBody,
    @Headers('authorization') auth: string,
  ): Promise<{ path: string }> {
    let res: Response;
    try {
      res = await fetch(`${TERMINAL_SERVICE}/clone`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: auth ?? '' },
        body: JSON.stringify(body),
      });
    } catch {
      throw new HttpException('Terminal service unavailable', HttpStatus.SERVICE_UNAVAILABLE);
    }
    if (!res.ok) throw new HttpException(await res.json() as object, res.status);
    return res.json() as Promise<{ path: string }>;
  }
}
```

- [ ] **Step 4: Run backend tests — verify all pass**

```bash
cd /home/dama/repo/auto-hub/backend && npm test -- terminal.controller
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/terminal/terminal.controller.ts backend/src/terminal/terminal.controller.spec.ts
git commit -m "feat: add /api/terminal/repos and /api/terminal/clone proxy endpoints"
```

---

### Task 4: WorkspacePicker + RepoPicker + page.tsx Step Orchestration

**Files:**
- Create: `frontend/src/app/(app)/terminal/components/WorkspacePicker.tsx`
- Create: `frontend/src/app/(app)/terminal/components/WorkspacePicker.test.tsx`
- Create: `frontend/src/app/(app)/terminal/components/RepoPicker.tsx`
- Create: `frontend/src/app/(app)/terminal/components/RepoPicker.test.tsx`
- Rewrite: `frontend/src/app/(app)/terminal/page.tsx`

**Interfaces:**
- Consumes: `GET /api/terminal/repos` → `Repo[]` (from Task 3)
- Produces:
  - `WorkspacePicker({ onSelect: (ws: 'home' | 'github') => void })`
  - `RepoPicker({ onSelect: (repo: Repo) => void, onClone: () => void, onBack: () => void })`
  - `page.tsx` manages `step: 'workspace' | 'repo' | 'clone' | 'terminal'`

- [ ] **Step 1: Create the components directory**

```bash
mkdir -p /home/dama/repo/auto-hub/frontend/src/app/\(app\)/terminal/components
```

- [ ] **Step 2: Write failing tests for WorkspacePicker**

Create `frontend/src/app/(app)/terminal/components/WorkspacePicker.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WorkspacePicker } from './WorkspacePicker'

describe('WorkspacePicker', () => {
  it('renders Home and GitHub Repos options', () => {
    render(<WorkspacePicker onSelect={vi.fn()} />)
    expect(screen.getByText('Home')).toBeInTheDocument()
    expect(screen.getByText('GitHub Repos')).toBeInTheDocument()
  })

  it('calls onSelect with "home" when Home is clicked', () => {
    const onSelect = vi.fn()
    render(<WorkspacePicker onSelect={onSelect} />)
    fireEvent.click(screen.getByText('Home'))
    expect(onSelect).toHaveBeenCalledWith('home')
  })

  it('calls onSelect with "github" when GitHub Repos is clicked', () => {
    const onSelect = vi.fn()
    render(<WorkspacePicker onSelect={onSelect} />)
    fireEvent.click(screen.getByText('GitHub Repos'))
    expect(onSelect).toHaveBeenCalledWith('github')
  })
})
```

- [ ] **Step 3: Run WorkspacePicker tests — verify they fail**

```bash
cd /home/dama/repo/auto-hub/frontend && npm test -- WorkspacePicker
```

Expected: FAIL — module not found.

- [ ] **Step 4: Create `WorkspacePicker.tsx`**

```tsx
'use client'
import { FolderOpen } from 'lucide-react'

interface WorkspacePickerProps {
  onSelect: (workspace: 'home' | 'github') => void
}

export function WorkspacePicker({ onSelect }: WorkspacePickerProps) {
  return (
    <div className="fixed inset-0 bg-[#0d0d0d] flex items-center justify-center p-4">
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-6 w-full max-w-sm">
        <div className="flex items-center gap-2 mb-4">
          <FolderOpen size={18} className="text-[#10b981]" />
          <h2 className="text-white text-sm font-semibold">Select Workspace</h2>
        </div>
        <div className="space-y-2">
          <button
            onClick={() => onSelect('home')}
            className="w-full text-left p-3 rounded-md bg-[#111111] border border-[#2a2a2a] hover:border-[#10b981]/50 transition-colors"
          >
            <p className="text-white text-sm font-medium">Home</p>
            <p className="text-[#6b7280] text-xs mt-0.5 font-mono">/home/claude</p>
          </button>
          <button
            onClick={() => onSelect('github')}
            className="w-full text-left p-3 rounded-md bg-[#111111] border border-[#2a2a2a] hover:border-[#10b981]/50 transition-colors"
          >
            <p className="text-white text-sm font-medium">GitHub Repos</p>
            <p className="text-[#6b7280] text-xs mt-0.5 font-mono">/home/claude/github</p>
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Run WorkspacePicker tests — verify they pass**

```bash
cd /home/dama/repo/auto-hub/frontend && npm test -- WorkspacePicker
```

Expected: 3 tests pass.

- [ ] **Step 6: Write failing tests for RepoPicker**

Create `frontend/src/app/(app)/terminal/components/RepoPicker.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { RepoPicker } from './RepoPicker'

vi.mock('@/lib/api', () => ({
  default: { get: vi.fn() },
}))

import api from '@/lib/api'

describe('RepoPicker', () => {
  const onSelect = vi.fn()
  const onClone = vi.fn()
  const onBack = vi.fn()

  beforeEach(() => vi.clearAllMocks())

  it('shows loading state initially', () => {
    vi.mocked(api.get).mockReturnValue(new Promise(() => {}))
    render(<RepoPicker onSelect={onSelect} onClone={onClone} onBack={onBack} />)
    expect(screen.getByText('Loading repos...')).toBeInTheDocument()
  })

  it('renders repo list with git badge on success', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: [{ name: 'auto-hub', path: '/workspace/github/auto-hub', isGitRepo: true }],
    })
    render(<RepoPicker onSelect={onSelect} onClone={onClone} onBack={onBack} />)
    await waitFor(() => expect(screen.getByText('auto-hub')).toBeInTheDocument())
    expect(screen.getByText('git')).toBeInTheDocument()
  })

  it('shows empty state when no repos exist', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [] })
    render(<RepoPicker onSelect={onSelect} onClone={onClone} onBack={onBack} />)
    await waitFor(() => expect(screen.getByText('No repos cloned yet')).toBeInTheDocument())
  })

  it('calls onSelect with repo object when repo card is clicked', async () => {
    const repo = { name: 'auto-hub', path: '/workspace/github/auto-hub', isGitRepo: true }
    vi.mocked(api.get).mockResolvedValue({ data: [repo] })
    render(<RepoPicker onSelect={onSelect} onClone={onClone} onBack={onBack} />)
    await waitFor(() => fireEvent.click(screen.getByText('auto-hub')))
    expect(onSelect).toHaveBeenCalledWith(repo)
  })

  it('calls onClone when Clone Repo button is clicked', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [] })
    render(<RepoPicker onSelect={onSelect} onClone={onClone} onBack={onBack} />)
    await waitFor(() => fireEvent.click(screen.getByText('Clone Repo')))
    expect(onClone).toHaveBeenCalled()
  })

  it('calls onBack when back button is clicked', () => {
    vi.mocked(api.get).mockReturnValue(new Promise(() => {}))
    render(<RepoPicker onSelect={onSelect} onClone={onClone} onBack={onBack} />)
    fireEvent.click(screen.getByLabelText('Back'))
    expect(onBack).toHaveBeenCalled()
  })

  it('shows error message when api call fails', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('Network error'))
    render(<RepoPicker onSelect={onSelect} onClone={onClone} onBack={onBack} />)
    await waitFor(() => expect(screen.getByText('Failed to load repos')).toBeInTheDocument())
  })
})
```

- [ ] **Step 7: Run RepoPicker tests — verify they fail**

```bash
cd /home/dama/repo/auto-hub/frontend && npm test -- RepoPicker
```

Expected: FAIL — module not found.

- [ ] **Step 8: Create `RepoPicker.tsx`**

```tsx
'use client'
import { useEffect, useState } from 'react'
import { ArrowLeft, GitBranch, Plus } from 'lucide-react'
import api from '@/lib/api'

interface Repo {
  name: string
  path: string
  isGitRepo: boolean
}

interface RepoPickerProps {
  onSelect: (repo: Repo) => void
  onClone: () => void
  onBack: () => void
}

export function RepoPicker({ onSelect, onClone, onBack }: RepoPickerProps) {
  const [repos, setRepos] = useState<Repo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    setError(null)
    api.get<Repo[]>('/api/terminal/repos')
      .then(r => { setRepos(r.data); setLoading(false) })
      .catch(() => { setError('Failed to load repos'); setLoading(false) })
  }

  useEffect(() => { load() }, [])

  return (
    <div className="fixed inset-0 bg-[#0d0d0d] flex items-center justify-center p-4">
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-6 w-full max-w-sm">
        <div className="flex items-center gap-2 mb-4">
          <button onClick={onBack} aria-label="Back" className="text-[#6b7280] hover:text-white transition-colors">
            <ArrowLeft size={16} />
          </button>
          <GitBranch size={18} className="text-[#10b981]" />
          <h2 className="text-white text-sm font-semibold">GitHub Repos</h2>
        </div>

        {loading && <p className="text-[#6b7280] text-xs">Loading repos...</p>}

        {error && (
          <div className="text-center py-4">
            <p className="text-[#ef4444] text-xs mb-3">{error}</p>
            <button
              onClick={load}
              className="px-3 py-1.5 text-xs bg-[#2a2a2a] text-[#e5e7eb] rounded hover:bg-[#3a3a3a] transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !error && repos.length === 0 && (
          <div className="text-center py-6">
            <p className="text-[#6b7280] text-sm mb-4">No repos cloned yet</p>
            <button
              onClick={onClone}
              className="flex items-center gap-1.5 mx-auto px-4 py-2 text-xs bg-[#10b981] text-white rounded hover:bg-[#059669] transition-colors"
            >
              <Plus size={14} />
              Clone Repo
            </button>
          </div>
        )}

        {!loading && !error && repos.length > 0 && (
          <div className="space-y-2">
            {repos.map(repo => (
              <button
                key={repo.path}
                onClick={() => onSelect(repo)}
                className="w-full text-left p-3 rounded-md bg-[#111111] border border-[#2a2a2a] hover:border-[#10b981]/50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <p className="text-white text-sm font-medium">{repo.name}</p>
                  {repo.isGitRepo && (
                    <span className="text-[10px] text-[#10b981] bg-[#10b981]/10 px-1.5 py-0.5 rounded font-mono">
                      git
                    </span>
                  )}
                </div>
              </button>
            ))}
            <button
              onClick={onClone}
              className="w-full flex items-center justify-center gap-1.5 p-3 rounded-md border border-dashed border-[#2a2a2a] text-[#6b7280] hover:border-[#10b981]/50 hover:text-[#10b981] transition-colors text-xs mt-1"
            >
              <Plus size={14} />
              Clone Repo
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 9: Run RepoPicker tests — verify they pass**

```bash
cd /home/dama/repo/auto-hub/frontend && npm test -- RepoPicker
```

Expected: 7 tests pass.

- [ ] **Step 10: Rewrite `frontend/src/app/(app)/terminal/page.tsx`**

Replace the entire file:

```tsx
'use client'
import '@xterm/xterm/css/xterm.css'
import { useEffect, useRef, useState } from 'react'
import { WorkspacePicker } from './components/WorkspacePicker'
import { RepoPicker } from './components/RepoPicker'
import { CloneDialog } from './components/CloneDialog'
import { TerminalBreadcrumb } from './components/TerminalBreadcrumb'

interface Repo {
  name: string
  path: string
  isGitRepo: boolean
}

type Step = 'workspace' | 'repo' | 'clone' | 'terminal'

const KEY_SEQUENCES = [
  { label: 'Tab', seq: '\t' },
  { label: 'Ctrl+C', seq: '\x03' },
  { label: 'Ctrl+D', seq: '\x04' },
  { label: 'Esc', seq: '\x1b' },
  { label: '↑', seq: '\x1b[A' },
  { label: '↓', seq: '\x1b[B' },
  { label: '←', seq: '\x1b[D' },
  { label: '→', seq: '\x1b[C' },
]

export default function TerminalPage() {
  const [step, setStep] = useState<Step>('workspace')
  const [workspace, setWorkspace] = useState<'home' | 'github' | null>(null)
  const [repoName, setRepoName] = useState<string | null>(null)
  const [cwd, setCwd] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sessionEnded, setSessionEnded] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const termContainerRef = useRef<HTMLDivElement>(null)
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    setIsMobile(window.innerWidth < 768 || navigator.maxTouchPoints > 0)
  }, [])

  useEffect(() => {
    if (!cwd || !termContainerRef.current) return

    let destroyed = false
    let cleanup: (() => void) | undefined

    const init = async () => {
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import('@xterm/xterm'),
        import('@xterm/addon-fit'),
      ])

      if (destroyed || !termContainerRef.current) return

      const term = new Terminal({
        fontSize: isMobile ? 15 : 12,
        fontFamily: 'Menlo, "DejaVu Sans Mono", monospace',
        theme: { background: '#0d0d0d', foreground: '#e5e7eb', cursor: '#3b82f6' },
        cursorBlink: true,
        scrollback: 5000,
      })

      const fitAddon = new FitAddon()
      term.loadAddon(fitAddon)
      term.open(termContainerRef.current)
      fitAddon.fit()

      const token = sessionStorage.getItem('autohub_token') ?? ''
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const ws = new WebSocket(
        `${proto}//${window.location.host}/terminal-ws/?cwd=${encodeURIComponent(cwd)}&token=${encodeURIComponent(token)}`
      )
      wsRef.current = ws

      ws.onmessage = e => term.write(e.data as string)
      ws.onerror = () => setError('Connection error. Authentication may have failed.')
      ws.onclose = e => {
        wsRef.current = null
        if (e.code === 4401) setError('Authentication failed. Please log in again.')
        else if (e.code === 4400) setError('Invalid working directory.')
        else if (e.code === 4500) setError('Failed to start terminal. Is the terminal service running?')
        else if (e.code === 1000) setSessionEnded(true)
      }

      term.onData(data => { if (ws.readyState === WebSocket.OPEN) ws.send(data) })

      const fit = () => {
        fitAddon.fit()
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }))
        }
      }

      ws.onopen = () => fit()

      const ro = new ResizeObserver(fit)
      ro.observe(termContainerRef.current!)
      window.visualViewport?.addEventListener('resize', fit)

      cleanup = () => {
        ro.disconnect()
        window.visualViewport?.removeEventListener('resize', fit)
        ws.close()
        term.dispose()
      }
    }

    init()

    return () => {
      destroyed = true
      wsRef.current?.close()
      wsRef.current = null
      cleanup?.()
    }
  }, [cwd, isMobile])

  const handleWorkspaceSelect = (ws: 'home' | 'github') => {
    setWorkspace(ws)
    if (ws === 'home') {
      setRepoName(null)
      setCwd('/workspace/claude-home')
      setStep('terminal')
    } else {
      setStep('repo')
    }
  }

  const handleRepoSelect = (repo: Repo) => {
    setRepoName(repo.name)
    setCwd(repo.path)
    setStep('terminal')
  }

  const handleCloneSuccess = (repoPath: string, name: string) => {
    setRepoName(name)
    setCwd(repoPath)
    setStep('terminal')
  }

  const handleChangeDir = () => {
    setCwd(null)
    setWorkspace(null)
    setRepoName(null)
    setError(null)
    setSessionEnded(false)
    setStep('workspace')
  }

  const reconnect = () => {
    const saved = cwd
    setSessionEnded(false)
    setError(null)
    setCwd(null)
    requestAnimationFrame(() => setCwd(saved))
  }

  if (step === 'workspace') return <WorkspacePicker onSelect={handleWorkspaceSelect} />
  if (step === 'repo') return <RepoPicker onSelect={handleRepoSelect} onClone={() => setStep('clone')} onBack={() => setStep('workspace')} />
  if (step === 'clone') return <CloneDialog onSuccess={handleCloneSuccess} onBack={() => setStep('repo')} />

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-[#ef4444] text-sm text-center">{error}</p>
        <button
          onClick={handleChangeDir}
          className="px-4 py-2 text-xs bg-[#2a2a2a] text-[#e5e7eb] rounded hover:bg-[#3a3a3a] transition-colors"
        >
          Change Directory
        </button>
      </div>
    )
  }

  if (sessionEnded) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-[#6b7280] text-sm">Session ended.</p>
        <div className="flex gap-2">
          <button
            onClick={reconnect}
            className="px-4 py-2 text-xs bg-[#3b82f6] text-white rounded hover:bg-[#2563eb] transition-colors"
          >
            Reconnect
          </button>
          <button
            onClick={handleChangeDir}
            className="px-4 py-2 text-xs bg-[#2a2a2a] text-[#e5e7eb] rounded hover:bg-[#3a3a3a] transition-colors"
          >
            Change Directory
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="-mx-6 -mt-6 -mb-20 md:-mb-6 flex flex-col" style={{ height: '100dvh' }}>
      <TerminalBreadcrumb workspace={workspace!} repoName={repoName} onChangeDir={handleChangeDir} />
      {isMobile && (
        <div className="h-10 flex gap-1 px-2 items-center bg-[#1a1a1a] border-b border-[#2a2a2a] overflow-x-auto shrink-0">
          {KEY_SEQUENCES.map(k => (
            <button
              key={k.label}
              onPointerDown={e => {
                e.preventDefault()
                if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(k.seq)
              }}
              className="px-3 py-1 rounded text-xs font-mono bg-[#2a2a2a] text-[#e5e7eb] active:bg-[#3b82f6] select-none whitespace-nowrap"
            >
              {k.label}
            </button>
          ))}
        </div>
      )}
      <div ref={termContainerRef} className="flex-1 overflow-hidden" />
    </div>
  )
}
```

- [ ] **Step 11: Commit**

```bash
git add frontend/src/app/\(app\)/terminal/
git commit -m "feat: add WorkspacePicker, RepoPicker, and step-based terminal flow"
```

---

### Task 5: CloneDialog + TerminalBreadcrumb

**Files:**
- Create: `frontend/src/app/(app)/terminal/components/CloneDialog.tsx`
- Create: `frontend/src/app/(app)/terminal/components/CloneDialog.test.tsx`
- Create: `frontend/src/app/(app)/terminal/components/TerminalBreadcrumb.tsx`
- Create: `frontend/src/app/(app)/terminal/components/TerminalBreadcrumb.test.tsx`

**Interfaces:**
- Consumes: `POST /api/terminal/clone` (from Task 3), `handleCloneSuccess` and `handleChangeDir` from page.tsx (from Task 4)
- Produces:
  - `CloneDialog({ onSuccess: (repoPath: string, repoName: string) => void, onBack: () => void })`
  - `TerminalBreadcrumb({ workspace: 'home' | 'github', repoName: string | null, onChangeDir: () => void })`

- [ ] **Step 1: Write failing tests for CloneDialog**

Create `frontend/src/app/(app)/terminal/components/CloneDialog.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CloneDialog } from './CloneDialog'

vi.mock('@/lib/api', () => ({
  default: { post: vi.fn() },
}))

import api from '@/lib/api'

describe('CloneDialog', () => {
  const onSuccess = vi.fn()
  const onBack = vi.fn()

  beforeEach(() => vi.clearAllMocks())

  it('renders URL input and disabled Clone button initially', () => {
    render(<CloneDialog onSuccess={onSuccess} onBack={onBack} />)
    expect(screen.getByPlaceholderText('https://github.com/user/repo')).toBeInTheDocument()
    expect(screen.getByText('Clone')).toBeDisabled()
  })

  it('enables Clone button when URL is entered', () => {
    render(<CloneDialog onSuccess={onSuccess} onBack={onBack} />)
    fireEvent.change(screen.getByPlaceholderText('https://github.com/user/repo'), {
      target: { value: 'https://github.com/user/my-repo' },
    })
    expect(screen.getByText('Clone')).not.toBeDisabled()
  })

  it('calls onSuccess with path and derived repo name on success', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { path: '/workspace/github/my-repo' } })
    render(<CloneDialog onSuccess={onSuccess} onBack={onBack} />)

    fireEvent.change(screen.getByPlaceholderText('https://github.com/user/repo'), {
      target: { value: 'https://github.com/user/my-repo' },
    })
    fireEvent.click(screen.getByText('Clone'))

    await waitFor(() =>
      expect(onSuccess).toHaveBeenCalledWith('/workspace/github/my-repo', 'my-repo')
    )
  })

  it('uses explicit name when provided', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { path: '/workspace/github/custom' } })
    render(<CloneDialog onSuccess={onSuccess} onBack={onBack} />)

    fireEvent.change(screen.getByPlaceholderText('https://github.com/user/repo'), {
      target: { value: 'https://github.com/user/my-repo' },
    })
    fireEvent.change(screen.getByPlaceholderText(/auto-derived/), {
      target: { value: 'custom' },
    })
    fireEvent.click(screen.getByText('Clone'))

    await waitFor(() =>
      expect(onSuccess).toHaveBeenCalledWith('/workspace/github/custom', 'custom')
    )
    expect(vi.mocked(api.post).mock.calls[0][1]).toMatchObject({ name: 'custom' })
  })

  it('shows error message on clone failure', async () => {
    vi.mocked(api.post).mockRejectedValue({
      response: { data: { error: 'Repository not found' } },
    })
    render(<CloneDialog onSuccess={onSuccess} onBack={onBack} />)

    fireEvent.change(screen.getByPlaceholderText('https://github.com/user/repo'), {
      target: { value: 'https://github.com/user/bad-repo' },
    })
    fireEvent.click(screen.getByText('Clone'))

    await waitFor(() =>
      expect(screen.getByText('Repository not found')).toBeInTheDocument()
    )
  })

  it('calls onBack when back button is clicked', () => {
    render(<CloneDialog onSuccess={onSuccess} onBack={onBack} />)
    fireEvent.click(screen.getByLabelText('Back'))
    expect(onBack).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run CloneDialog tests — verify they fail**

```bash
cd /home/dama/repo/auto-hub/frontend && npm test -- CloneDialog
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `CloneDialog.tsx`**

```tsx
'use client'
import { useState } from 'react'
import { ArrowLeft, GitFork, Loader2 } from 'lucide-react'
import api from '@/lib/api'

interface CloneDialogProps {
  onSuccess: (repoPath: string, repoName: string) => void
  onBack: () => void
}

export function CloneDialog({ onSuccess, onBack }: CloneDialogProps) {
  const [url, setUrl] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const derivedName = name.trim() || url.split('/').pop()?.replace(/\.git$/, '') || ''

  const handleClone = async () => {
    setLoading(true)
    setError(null)
    try {
      const body: { url: string; name?: string } = { url }
      if (name.trim()) body.name = name.trim()
      const res = await api.post<{ path: string }>('/api/terminal/clone', body)
      onSuccess(res.data.path, derivedName)
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Clone failed'
      setError(msg)
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-[#0d0d0d] flex items-center justify-center p-4">
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-6 w-full max-w-sm">
        <div className="flex items-center gap-2 mb-5">
          <button
            onClick={onBack}
            aria-label="Back"
            className="text-[#6b7280] hover:text-white transition-colors"
          >
            <ArrowLeft size={16} />
          </button>
          <GitFork size={18} className="text-[#10b981]" />
          <h2 className="text-white text-sm font-semibold">Clone Repository</h2>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-[#6b7280] text-xs mb-1.5 block">Git URL</label>
            <input
              type="text"
              placeholder="https://github.com/user/repo"
              value={url}
              onChange={e => setUrl(e.target.value)}
              className="w-full bg-[#111111] border border-[#2a2a2a] rounded-md px-3 py-2 text-white text-sm font-mono placeholder-[#4b5563] focus:outline-none focus:border-[#10b981]/50"
            />
            <p className="text-[#4b5563] text-xs mt-1.5">
              For private repos, set up SSH keys on the Pi first
            </p>
          </div>

          <div>
            <label className="text-[#6b7280] text-xs mb-1.5 block">
              Folder name <span className="text-[#4b5563]">(optional)</span>
            </label>
            <input
              type="text"
              placeholder={derivedName || 'auto-derived from URL'}
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full bg-[#111111] border border-[#2a2a2a] rounded-md px-3 py-2 text-white text-sm font-mono placeholder-[#4b5563] focus:outline-none focus:border-[#10b981]/50"
            />
          </div>

          {error && <p className="text-[#ef4444] text-xs">{error}</p>}

          <button
            onClick={handleClone}
            disabled={!url.trim() || loading}
            className="w-full flex items-center justify-center gap-2 py-2.5 text-sm bg-[#10b981] text-white rounded-md hover:bg-[#059669] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Cloning…
              </>
            ) : (
              'Clone'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run CloneDialog tests — verify they pass**

```bash
cd /home/dama/repo/auto-hub/frontend && npm test -- CloneDialog
```

Expected: 6 tests pass.

- [ ] **Step 5: Write failing tests for TerminalBreadcrumb**

Create `frontend/src/app/(app)/terminal/components/TerminalBreadcrumb.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TerminalBreadcrumb } from './TerminalBreadcrumb'

describe('TerminalBreadcrumb', () => {
  it('shows "Home" label for home workspace', () => {
    render(<TerminalBreadcrumb workspace="home" repoName={null} onChangeDir={vi.fn()} />)
    expect(screen.getByText('Home')).toBeInTheDocument()
  })

  it('shows "GitHub Repos" and repo name for github workspace', () => {
    render(<TerminalBreadcrumb workspace="github" repoName="auto-hub" onChangeDir={vi.fn()} />)
    expect(screen.getByText('GitHub Repos')).toBeInTheDocument()
    expect(screen.getByText('auto-hub')).toBeInTheDocument()
  })

  it('does not show repo name when repoName is null', () => {
    render(<TerminalBreadcrumb workspace="github" repoName={null} onChangeDir={vi.fn()} />)
    expect(screen.queryByText('auto-hub')).not.toBeInTheDocument()
  })

  it('calls onChangeDir when Change button is clicked', () => {
    const onChangeDir = vi.fn()
    render(<TerminalBreadcrumb workspace="home" repoName={null} onChangeDir={onChangeDir} />)
    fireEvent.click(screen.getByText('Change'))
    expect(onChangeDir).toHaveBeenCalled()
  })
})
```

- [ ] **Step 6: Run TerminalBreadcrumb tests — verify they fail**

```bash
cd /home/dama/repo/auto-hub/frontend && npm test -- TerminalBreadcrumb
```

Expected: FAIL — module not found.

- [ ] **Step 7: Create `TerminalBreadcrumb.tsx`**

```tsx
'use client'
import { ChevronRight } from 'lucide-react'

interface TerminalBreadcrumbProps {
  workspace: 'home' | 'github'
  repoName: string | null
  onChangeDir: () => void
}

export function TerminalBreadcrumb({ workspace, repoName, onChangeDir }: TerminalBreadcrumbProps) {
  return (
    <div className="h-9 flex items-center justify-between px-3 bg-[#111111] border-b border-[#2a2a2a] shrink-0">
      <div className="flex items-center gap-1 text-xs text-[#6b7280] font-mono overflow-hidden">
        <span className="truncate">
          {workspace === 'home' ? 'Home' : 'GitHub Repos'}
        </span>
        {repoName && (
          <>
            <ChevronRight size={12} className="shrink-0 text-[#3f3f3f]" />
            <span className="text-[#e5e7eb] truncate">{repoName}</span>
          </>
        )}
      </div>
      <button
        onClick={onChangeDir}
        className="text-xs text-[#6b7280] hover:text-[#10b981] transition-colors shrink-0 ml-2"
      >
        Change
      </button>
    </div>
  )
}
```

- [ ] **Step 8: Run TerminalBreadcrumb tests — verify they pass**

```bash
cd /home/dama/repo/auto-hub/frontend && npm test -- TerminalBreadcrumb
```

Expected: 4 tests pass.

- [ ] **Step 9: Run all frontend tests to confirm no regressions**

```bash
cd /home/dama/repo/auto-hub/frontend && npm test
```

Expected: all tests pass.

- [ ] **Step 10: Run full frontend type check**

```bash
cd /home/dama/repo/auto-hub/frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors (or only pre-existing errors unrelated to terminal).

- [ ] **Step 11: Commit**

```bash
git add frontend/src/app/\(app\)/terminal/components/
git commit -m "feat: add CloneDialog and TerminalBreadcrumb, complete terminal step flow"
```

---

## Deployment Checklist

After all tasks complete, rebuild and restart the terminal service:

```bash
cd /home/dama/repo/auto-hub
docker compose build terminal
docker compose up -d terminal
docker compose logs -f terminal
```

Verify in the browser:
1. Navigate to `/terminal` — workspace picker appears (no auto-connect)
2. Click **Home** — terminal opens, prompt shows `claude@...`
3. Click **Change** — returns to workspace picker
4. Click **GitHub Repos** — repo list shows with "git" badges
5. Click **+ Clone Repo** — clone dialog appears with URL input
6. Enter a public repo URL (e.g. `https://github.com/cli/cli`) — clone runs, terminal opens in the new repo
7. Click **Change**, go back to GitHub Repos — new repo appears in the list
