# Terminal Persistent Sessions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add tmux-backed persistent named sessions to the Code Terminal app, with a session manager UI, tab-switching, and docker/tool parity inside the container.

**Architecture:** tmux runs inside the terminal container as a session daemon; a JSON manifest at `/workspace/data/.terminal-sessions.json` persists session metadata across container restarts; the WebSocket attaches to a named tmux session instead of spawning a bare shell; the frontend gains a session manager screen, session tabs, and a create-session dialog.

**Tech Stack:** Node.js (terminal service), Express + ws + node-pty, tmux, Docker, NestJS (backend proxy), Next.js + React + Vitest (frontend), xterm.js.

## Global Constraints

- Session names: 1–40 chars, only `[a-zA-Z0-9_-]`, no slashes or dots
- Manifest path: `/workspace/data/.terminal-sessions.json`
- Docker socket GID on this Pi: 984 — use `group_add: ["984"]` in docker-compose
- `claude` user UID/GID inside container: 1001/1001
- Home dir inside container: `/workspace/data`
- TERMINAL_DIRS (env): `/workspace/data,/workspace/github,/workspace/auto-hub`
- All REST endpoints require `Authorization: Bearer <token>`
- WebSocket params change from `?cwd=...` to `?session=...`
- App name: `'Code Terminal'` (was `'Claude Code Terminal'`)
- Workspace type: `'home' | 'github' | 'auto-hub'`

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Modify | `terminal/Dockerfile` | Add sudo, dev tools, tmux, docker.io, claude-code CLI, update user home |
| Create | `terminal/entrypoint.sh` | Resurrect sessions, exec server |
| Modify | `docker-compose.yml` | Add volumes, TERMINAL_DIRS, docker socket, group_add |
| Modify | `frontend/src/app/(app)/apps/apps.config.ts` | Rename to 'Code Terminal' |
| Modify | `frontend/src/app/(app)/terminal/components/WorkspacePicker.tsx` | Add auto-hub option + onBack prop |
| Modify | `frontend/src/app/(app)/terminal/components/WorkspacePicker.test.tsx` | Fix existing failures + add auto-hub tests |
| Create | `terminal/src/sessions.js` | Manifest read/write functions |
| Create | `terminal/src/resurrect.js` | Startup session resurrection |
| Create | `terminal/src/sessions.test.js` | Jest tests for sessions.js |
| Modify | `terminal/src/server.js` | Add session endpoints + switch WS to tmux attach |
| Modify | `terminal/src/server.test.js` | Tests for new endpoints |
| Modify | `backend/src/terminal/terminal.controller.ts` | Proxy GET/POST/DELETE /sessions |
| Modify | `backend/src/terminal/terminal.controller.spec.ts` | Tests for new proxy methods |
| Create | `frontend/src/app/(app)/terminal/components/SessionManager.tsx` | Session list UI |
| Create | `frontend/src/app/(app)/terminal/components/CreateSessionDialog.tsx` | Session name input |
| Create | `frontend/src/app/(app)/terminal/components/SessionManager.test.tsx` | Vitest tests |
| Create | `frontend/src/app/(app)/terminal/components/CreateSessionDialog.test.tsx` | Vitest tests |
| Create | `frontend/src/app/(app)/terminal/components/SessionTabs.tsx` | Tab strip above terminal |
| Create | `frontend/src/app/(app)/terminal/components/SessionTabs.test.tsx` | Vitest tests |
| Modify | `frontend/src/app/(app)/terminal/components/TerminalBreadcrumb.tsx` | Add sessionName prop + auto-hub label |
| Modify | `frontend/src/app/(app)/terminal/components/TerminalBreadcrumb.test.tsx` | Update for new prop |
| Modify | `frontend/src/app/(app)/terminal/page.tsx` | Full rewrite with session flow |

---

### Task 1: Infrastructure — Dockerfile, entrypoint, docker-compose, app rename, WorkspacePicker

**Files:**
- Modify: `terminal/Dockerfile`
- Create: `terminal/entrypoint.sh`
- Modify: `docker-compose.yml`
- Modify: `frontend/src/app/(app)/apps/apps.config.ts`
- Modify: `frontend/src/app/(app)/terminal/components/WorkspacePicker.tsx`
- Modify: `frontend/src/app/(app)/terminal/components/WorkspacePicker.test.tsx`

**Interfaces:**
- Produces: `WorkspacePicker` accepts `onSelect: (ws: 'home' | 'github' | 'auto-hub') => void` and `onBack: () => void`

- [ ] **Step 1: Write the failing WorkspacePicker tests**

Replace `frontend/src/app/(app)/terminal/components/WorkspacePicker.test.tsx` entirely:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WorkspacePicker } from './WorkspacePicker'

describe('WorkspacePicker', () => {
  it('renders all three workspace options', () => {
    render(<WorkspacePicker onSelect={vi.fn()} onBack={vi.fn()} />)
    expect(screen.getByText('Data Storage')).toBeInTheDocument()
    expect(screen.getByText('GitHub Repos')).toBeInTheDocument()
    expect(screen.getByText('Auto-Hub')).toBeInTheDocument()
  })

  it('calls onSelect with "home" when Data Storage is clicked', () => {
    const onSelect = vi.fn()
    render(<WorkspacePicker onSelect={onSelect} onBack={vi.fn()} />)
    fireEvent.click(screen.getByText('Data Storage'))
    expect(onSelect).toHaveBeenCalledWith('home')
  })

  it('calls onSelect with "github" when GitHub Repos is clicked', () => {
    const onSelect = vi.fn()
    render(<WorkspacePicker onSelect={onSelect} onBack={vi.fn()} />)
    fireEvent.click(screen.getByText('GitHub Repos'))
    expect(onSelect).toHaveBeenCalledWith('github')
  })

  it('calls onSelect with "auto-hub" when Auto-Hub is clicked', () => {
    const onSelect = vi.fn()
    render(<WorkspacePicker onSelect={onSelect} onBack={vi.fn()} />)
    fireEvent.click(screen.getByText('Auto-Hub'))
    expect(onSelect).toHaveBeenCalledWith('auto-hub')
  })

  it('calls onBack when Back button is clicked', () => {
    const onBack = vi.fn()
    render(<WorkspacePicker onSelect={vi.fn()} onBack={onBack} />)
    fireEvent.click(screen.getByLabelText('Back'))
    expect(onBack).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/dama/repo/auto-hub/frontend
npx vitest run "WorkspacePicker.test" 2>&1 | grep -E "✓|×|passed|failed"
```

Expected: 4-5 failing tests (component has wrong labels and no onBack).

- [ ] **Step 3: Update WorkspacePicker.tsx**

Replace `frontend/src/app/(app)/terminal/components/WorkspacePicker.tsx` entirely:

```tsx
'use client'
import { ArrowLeft, FolderOpen } from 'lucide-react'

interface WorkspacePickerProps {
  onSelect: (workspace: 'home' | 'github' | 'auto-hub') => void
  onBack: () => void
}

export function WorkspacePicker({ onSelect, onBack }: WorkspacePickerProps) {
  return (
    <div className="fixed inset-0 bg-[#0d0d0d] flex items-center justify-center p-4">
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-6 w-full max-w-sm">
        <div className="flex items-center gap-2 mb-4">
          <button onClick={onBack} aria-label="Back" className="text-[#6b7280] hover:text-white transition-colors">
            <ArrowLeft size={16} />
          </button>
          <FolderOpen size={18} className="text-[#10b981]" />
          <h2 className="text-white text-sm font-semibold">Select Workspace</h2>
        </div>
        <div className="space-y-2">
          <button
            onClick={() => onSelect('home')}
            className="w-full text-left p-3 rounded-md bg-[#111111] border border-[#2a2a2a] hover:border-[#10b981]/50 transition-colors"
          >
            <p className="text-white text-sm font-medium">Data Storage</p>
            <p className="text-[#6b7280] text-xs mt-0.5 font-mono">/mnt/data</p>
          </button>
          <button
            onClick={() => onSelect('github')}
            className="w-full text-left p-3 rounded-md bg-[#111111] border border-[#2a2a2a] hover:border-[#10b981]/50 transition-colors"
          >
            <p className="text-white text-sm font-medium">GitHub Repos</p>
            <p className="text-[#6b7280] text-xs mt-0.5 font-mono">/mnt/data/github</p>
          </button>
          <button
            onClick={() => onSelect('auto-hub')}
            className="w-full text-left p-3 rounded-md bg-[#111111] border border-[#2a2a2a] hover:border-[#10b981]/50 transition-colors"
          >
            <p className="text-white text-sm font-medium">Auto-Hub</p>
            <p className="text-[#6b7280] text-xs mt-0.5 font-mono">/home/dama/repo/auto-hub</p>
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify WorkspacePicker passes**

```bash
cd /home/dama/repo/auto-hub/frontend
npx vitest run "WorkspacePicker.test" 2>&1 | grep -E "✓|×|passed|failed"
```

Expected: 5 passing.

- [ ] **Step 5: Update terminal Dockerfile**

Replace `terminal/Dockerfile` entirely:

```dockerfile
FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ curl git openssh-client ca-certificates \
    sudo vim nano htop jq zip unzip build-essential python3-pip ripgrep tmux docker.io \
    && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
      | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
      > /etc/apt/sources.list.d/github-cli.list \
    && apt-get update && apt-get install -y --no-install-recommends gh \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g @anthropic-ai/claude-code

RUN groupadd --gid 1001 claude \
    && useradd --uid 1001 --gid 1001 --no-create-home \
       --home-dir /workspace/data --shell /bin/bash claude \
    && echo 'claude ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/claude \
    && chmod 440 /etc/sudoers.d/claude

ENV HOME=/workspace/data
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --production
COPY src/ ./src/
COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh

EXPOSE 7681
HEALTHCHECK --interval=30s --timeout=5s CMD curl -sf http://localhost:7681/health || exit 1
CMD ["./entrypoint.sh"]
```

- [ ] **Step 6: Create terminal/entrypoint.sh**

```bash
#!/bin/bash
set -e

# Resurrect tmux sessions from manifest (silently OK on first start)
node /app/src/resurrect.js || true

exec node src/server.js
```

- [ ] **Step 7: Update docker-compose.yml terminal block**

In `docker-compose.yml`, replace the `terminal:` service block:

```yaml
  terminal:
    build: ./terminal
    user: "1001:1001"
    group_add:
      - "984"
    environment:
      JWT_SECRET: ${JWT_SECRET}
      TERMINAL_DIRS: /workspace/data,/workspace/github,/workspace/auto-hub
      GH_TOKEN: ${GH_TOKEN}
    volumes:
      - /mnt/data:/workspace/data:rw
      - /mnt/data/github:/workspace/github:rw
      - /home/dama/repo/auto-hub:/workspace/auto-hub:rw
      - /var/run/docker.sock:/var/run/docker.sock:ro
    restart: unless-stopped
```

- [ ] **Step 8: Rename app in apps.config.ts**

In `frontend/src/app/(app)/apps/apps.config.ts`, change:

```ts
    name: 'Claude Code Terminal',
```

to:

```ts
    name: 'Code Terminal',
```

- [ ] **Step 9: Verify Dockerfile builds**

```bash
cd /home/dama/repo/auto-hub
docker build -t terminal-infra-test ./terminal 2>&1 | tail -10
```

Expected: `Successfully built <id>` or `FINISHED`. Fix any apt errors before continuing.

- [ ] **Step 10: Commit**

```bash
cd /home/dama/repo/auto-hub
git add terminal/Dockerfile terminal/entrypoint.sh docker-compose.yml \
  frontend/src/app/\(app\)/apps/apps.config.ts \
  frontend/src/app/\(app\)/terminal/components/WorkspacePicker.tsx \
  frontend/src/app/\(app\)/terminal/components/WorkspacePicker.test.tsx
git commit -m "feat: add infra for sessions — tools/tmux/docker in container, auto-hub workspace, app rename"
```

---

### Task 2: Session Manifest Module

**Files:**
- Create: `terminal/src/sessions.js`
- Create: `terminal/src/resurrect.js`
- Create: `terminal/src/sessions.test.js`

**Interfaces:**
- Produces: `sessions.js` exports `{ readManifest, writeManifest, getSessions, getSession, addSession, removeSession, updateLastActive }`
- Produces: `resurrect.js` exports `{ resurrect }` and calls it when run directly
- Consumes: manifest at `/workspace/data/.terminal-sessions.json`

- [ ] **Step 1: Write the failing tests**

Create `terminal/src/sessions.test.js`:

```js
'use strict';
jest.mock('fs');
const fs = require('fs');
const { readManifest, getSessions, getSession, addSession, removeSession, updateLastActive } = require('./sessions');

const EMPTY = JSON.stringify({ sessions: [] });
const WITH_ONE = JSON.stringify({
  sessions: [
    { name: 'alpha', cwd: '/workspace/data', workspace: 'home', repoName: null,
      createdAt: '2026-01-01T00:00:00.000Z', lastActive: '2026-01-01T00:00:00.000Z' }
  ]
});

beforeEach(() => jest.resetAllMocks());

describe('readManifest', () => {
  it('returns empty sessions when file does not exist', () => {
    fs.readFileSync.mockImplementation(() => { throw Object.assign(new Error(), { code: 'ENOENT' }) });
    expect(readManifest()).toEqual({ sessions: [] });
  });

  it('returns parsed manifest when file exists', () => {
    fs.readFileSync.mockReturnValue(WITH_ONE);
    expect(readManifest().sessions).toHaveLength(1);
  });
});

describe('getSessions', () => {
  it('returns sessions array', () => {
    fs.readFileSync.mockReturnValue(WITH_ONE);
    expect(getSessions()).toHaveLength(1);
  });

  it('returns empty array when manifest missing', () => {
    fs.readFileSync.mockImplementation(() => { throw new Error('ENOENT') });
    expect(getSessions()).toEqual([]);
  });
});

describe('getSession', () => {
  it('returns session when name matches', () => {
    fs.readFileSync.mockReturnValue(WITH_ONE);
    const s = getSession('alpha');
    expect(s).not.toBeNull();
    expect(s.name).toBe('alpha');
  });

  it('returns null when name not found', () => {
    fs.readFileSync.mockReturnValue(WITH_ONE);
    expect(getSession('nonexistent')).toBeNull();
  });
});

describe('addSession', () => {
  it('appends session and writes manifest', () => {
    fs.readFileSync.mockReturnValue(EMPTY);
    fs.writeFileSync.mockImplementation(() => {});
    addSession({ name: 'beta', cwd: '/workspace/data', workspace: 'home', repoName: null });
    expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
    const written = JSON.parse(fs.writeFileSync.mock.calls[0][1]);
    expect(written.sessions).toHaveLength(1);
    expect(written.sessions[0].name).toBe('beta');
  });
});

describe('removeSession', () => {
  it('removes session by name and writes manifest', () => {
    fs.readFileSync.mockReturnValue(WITH_ONE);
    fs.writeFileSync.mockImplementation(() => {});
    removeSession('alpha');
    const written = JSON.parse(fs.writeFileSync.mock.calls[0][1]);
    expect(written.sessions).toHaveLength(0);
  });

  it('is a no-op when name does not exist', () => {
    fs.readFileSync.mockReturnValue(EMPTY);
    fs.writeFileSync.mockImplementation(() => {});
    removeSession('ghost');
    const written = JSON.parse(fs.writeFileSync.mock.calls[0][1]);
    expect(written.sessions).toHaveLength(0);
  });
});

describe('updateLastActive', () => {
  it('updates lastActive timestamp of existing session', () => {
    fs.readFileSync.mockReturnValue(WITH_ONE);
    fs.writeFileSync.mockImplementation(() => {});
    const before = '2026-01-01T00:00:00.000Z';
    updateLastActive('alpha');
    const written = JSON.parse(fs.writeFileSync.mock.calls[0][1]);
    expect(written.sessions[0].lastActive).not.toBe(before);
  });

  it('does nothing when session not found', () => {
    fs.readFileSync.mockReturnValue(EMPTY);
    fs.writeFileSync.mockImplementation(() => {});
    updateLastActive('ghost');
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /home/dama/repo/auto-hub/terminal
npx jest sessions.test.js 2>&1 | tail -10
```

Expected: `Cannot find module './sessions'`

- [ ] **Step 3: Create terminal/src/sessions.js**

```js
'use strict';
const fs = require('fs');

const MANIFEST_PATH = '/workspace/data/.terminal-sessions.json';

function readManifest() {
  try {
    return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  } catch {
    return { sessions: [] };
  }
}

function writeManifest(manifest) {
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf8');
}

function getSessions() {
  return readManifest().sessions;
}

function getSession(name) {
  return readManifest().sessions.find(s => s.name === name) ?? null;
}

function addSession(session) {
  const manifest = readManifest();
  manifest.sessions.push(session);
  writeManifest(manifest);
}

function removeSession(name) {
  const manifest = readManifest();
  manifest.sessions = manifest.sessions.filter(s => s.name !== name);
  writeManifest(manifest);
}

function updateLastActive(name) {
  const manifest = readManifest();
  const session = manifest.sessions.find(s => s.name === name);
  if (session) {
    session.lastActive = new Date().toISOString();
    writeManifest(manifest);
  }
}

module.exports = { readManifest, writeManifest, getSessions, getSession, addSession, removeSession, updateLastActive };
```

- [ ] **Step 4: Create terminal/src/resurrect.js**

```js
'use strict';
const cp = require('child_process');
const { getSessions } = require('./sessions');

function resurrect() {
  const sessions = getSessions();
  for (const session of sessions) {
    try {
      cp.execFileSync('tmux', ['has-session', '-t', session.name], { stdio: 'ignore' });
      console.log(`Session "${session.name}" already alive`);
    } catch {
      try {
        cp.execFileSync('tmux', ['new-session', '-d', '-s', session.name, '-c', session.cwd]);
        console.log(`Resurrected session "${session.name}" at ${session.cwd}`);
      } catch (err) {
        console.error(`Failed to resurrect "${session.name}": ${err.message}`);
      }
    }
  }
}

if (require.main === module) resurrect();

module.exports = { resurrect };
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd /home/dama/repo/auto-hub/terminal
npx jest sessions.test.js 2>&1 | tail -10
```

Expected: all tests passing, no failures.

- [ ] **Step 6: Commit**

```bash
cd /home/dama/repo/auto-hub
git add terminal/src/sessions.js terminal/src/resurrect.js terminal/src/sessions.test.js
git commit -m "feat: add session manifest module and resurrection script"
```

---

### Task 3: Session REST Endpoints + WebSocket (Terminal Service)

**Files:**
- Modify: `terminal/src/server.js`
- Modify: `terminal/src/server.test.js`

**Interfaces:**
- Consumes: `sessions.js` exports from Task 2
- Produces: `GET /sessions`, `POST /sessions`, `DELETE /sessions/:name` REST endpoints
- Produces: WebSocket accepts `?session=<name>&token=<jwt>` instead of `?cwd=...`

- [ ] **Step 1: Add tests to server.test.js**

Open `terminal/src/server.test.js`. At the very top, before all existing `process.env` lines, add:

```js
jest.mock('./sessions');
```

Then update the existing `process.env.TERMINAL_DIRS` line from:

```js
process.env.TERMINAL_DIRS = '/workspace/claude-home,/workspace/github';
```

to:

```js
process.env.TERMINAL_DIRS = '/workspace/data,/workspace/github';
```

Add after the existing `const { app, isValidCwd } = require('./server');` line:

```js
const sessions = require('./sessions');
```

Update the `isValidCwd` test that uses `/workspace/claude-home` (line that says `'accepts exact dir match'`) to use `/workspace/data`:

```js
it('accepts exact dir match', () =>
  expect(isValidCwd('/workspace/data')).toBe(true));
```

Append these describe blocks at the end of the file:

```js
describe('GET /sessions', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns sessions with alive=true when tmux reports them', async () => {
    sessions.getSessions.mockReturnValue([
      { name: 'alpha', cwd: '/workspace/data', workspace: 'home', repoName: null,
        createdAt: '2026-01-01T00:00:00.000Z', lastActive: '2026-01-01T00:00:00.000Z' }
    ]);
    jest.spyOn(cp, 'execFileSync').mockReturnValue('alpha\n');
    const res = await request(app).get('/sessions').set('Authorization', auth).expect(200);
    expect(res.body[0].alive).toBe(true);
    expect(res.body[0].name).toBe('alpha');
  });

  it('marks session alive=false when tmux has no matching session', async () => {
    sessions.getSessions.mockReturnValue([
      { name: 'dead', cwd: '/workspace/data', workspace: 'home', repoName: null,
        createdAt: '2026-01-01T00:00:00.000Z', lastActive: '2026-01-01T00:00:00.000Z' }
    ]);
    jest.spyOn(cp, 'execFileSync').mockReturnValue('');
    const res = await request(app).get('/sessions').set('Authorization', auth).expect(200);
    expect(res.body[0].alive).toBe(false);
  });

  it('returns 401 without auth', async () => {
    await request(app).get('/sessions').expect(401);
  });
});

describe('POST /sessions', () => {
  afterEach(() => jest.restoreAllMocks());

  it('creates session and returns 201', async () => {
    sessions.getSession.mockReturnValue(null);
    sessions.addSession.mockImplementation(() => {});
    jest.spyOn(cp, 'execFileSync').mockReturnValue(undefined);
    const res = await request(app)
      .post('/sessions')
      .set('Authorization', auth)
      .send({ name: 'my-sess', cwd: '/workspace/data', workspace: 'home', repoName: null })
      .expect(201);
    expect(res.body.name).toBe('my-sess');
    expect(res.body.alive).toBe(true);
    expect(sessions.addSession).toHaveBeenCalledWith(expect.objectContaining({ name: 'my-sess' }));
  });

  it('returns 409 when session name already exists', async () => {
    sessions.getSession.mockReturnValue({ name: 'my-sess' });
    await request(app)
      .post('/sessions')
      .set('Authorization', auth)
      .send({ name: 'my-sess', cwd: '/workspace/data', workspace: 'home' })
      .expect(409);
  });

  it('returns 400 for name with slashes', async () => {
    await request(app)
      .post('/sessions')
      .set('Authorization', auth)
      .send({ name: 'bad/name', cwd: '/workspace/data', workspace: 'home' })
      .expect(400);
  });

  it('returns 400 for name over 40 chars', async () => {
    await request(app)
      .post('/sessions')
      .set('Authorization', auth)
      .send({ name: 'a'.repeat(41), cwd: '/workspace/data', workspace: 'home' })
      .expect(400);
  });

  it('returns 400 for invalid cwd', async () => {
    sessions.getSession.mockReturnValue(null);
    await request(app)
      .post('/sessions')
      .set('Authorization', auth)
      .send({ name: 'valid', cwd: '/etc/passwd', workspace: 'home' })
      .expect(400);
  });

  it('returns 401 without auth', async () => {
    await request(app)
      .post('/sessions')
      .send({ name: 'test', cwd: '/workspace/data', workspace: 'home' })
      .expect(401);
  });
});

describe('DELETE /sessions/:name', () => {
  afterEach(() => jest.restoreAllMocks());

  it('kills session and removes from manifest', async () => {
    sessions.removeSession.mockImplementation(() => {});
    jest.spyOn(cp, 'execFileSync').mockReturnValue(undefined);
    const res = await request(app)
      .delete('/sessions/my-sess')
      .set('Authorization', auth)
      .expect(200);
    expect(res.body).toEqual({ ok: true });
    expect(sessions.removeSession).toHaveBeenCalledWith('my-sess');
  });

  it('still returns ok when tmux session is already dead', async () => {
    sessions.removeSession.mockImplementation(() => {});
    jest.spyOn(cp, 'execFileSync').mockImplementation(() => {
      throw new Error('session not found');
    });
    const res = await request(app)
      .delete('/sessions/dead')
      .set('Authorization', auth)
      .expect(200);
    expect(res.body).toEqual({ ok: true });
    expect(sessions.removeSession).toHaveBeenCalledWith('dead');
  });

  it('returns 401 without auth', async () => {
    await request(app).delete('/sessions/test').expect(401);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /home/dama/repo/auto-hub/terminal
npx jest server.test.js 2>&1 | tail -15
```

Expected: 10+ new tests failing with "Cannot GET /sessions" etc.

- [ ] **Step 3: Update server.js**

Replace `terminal/src/server.js` entirely:

```js
'use strict';
const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const nodePty = require('node-pty');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const { getSessions, getSession, addSession, removeSession, updateLastActive } = require('./sessions');

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
const DATA_HOME = '/workspace/data';

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

function getLiveSessions() {
  try {
    const output = cp.execFileSync('tmux', ['list-sessions', '-F', '#{session_name}'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return new Set(output.trim().split('\n').filter(Boolean));
  } catch {
    return new Set();
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
  const ghMatch = url.match(/^(?:git@github\.com:|https?:\/\/github\.com\/)(.+?)(?:\.git)?$/);
  const ghRepo = ghMatch ? ghMatch[1] : null;
  const repoName = (name?.trim() || url.split('/').pop()?.replace(/\.git$/, '') || '').trim();
  if (!repoName || repoName.includes('/') || repoName.includes('..')) {
    return res.status(400).json({ error: 'Invalid repo name' });
  }
  const targetPath = path.join(GITHUB_DIR, repoName);
  if (fs.existsSync(targetPath)) {
    return res.status(409).json({ error: `Directory "${repoName}" already exists` });
  }
  const cloneEnv = { ...process.env, HOME: DATA_HOME, USER: 'claude', LOGNAME: 'claude' };
  let cmd, cmdArgs;
  if (ghRepo && process.env.GH_TOKEN) {
    cmd = 'gh'; cmdArgs = ['repo', 'clone', ghRepo, targetPath];
  } else {
    const httpsUrl = ghRepo ? `https://github.com/${ghRepo}.git` : url;
    cmd = 'git'; cmdArgs = ['clone', httpsUrl, targetPath];
  }
  cp.execFile(cmd, cmdArgs, { timeout: 120_000, env: cloneEnv }, (err, _stdout, stderr) => {
    if (err) {
      const lines = (stderr ?? '').split('\n').filter(Boolean);
      const detail = lines.find(l => !l.startsWith('Cloning into')) ?? lines[0] ?? err.message;
      return res.status(500).json({ error: err.killed ? 'Clone timed out. Try again.' : detail });
    }
    res.json({ path: targetPath });
  });
});

app.get('/sessions', (req, res) => {
  if (!requireAuth(req, res)) return;
  const liveSessions = getLiveSessions();
  const sessionList = getSessions().map(s => ({
    ...s,
    alive: liveSessions.has(s.name),
  }));
  res.json(sessionList);
});

app.post('/sessions', (req, res) => {
  if (!requireAuth(req, res)) return;
  const { name, cwd, workspace, repoName } = req.body ?? {};

  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'name is required' });
  }
  if (!/^[a-zA-Z0-9_-]{1,40}$/.test(name)) {
    return res.status(400).json({ error: 'name must be 1–40 alphanumeric/dash/underscore characters' });
  }
  if (!cwd || !isValidCwd(cwd)) {
    return res.status(400).json({ error: 'invalid cwd' });
  }
  if (getSession(name)) {
    return res.status(409).json({ error: `Session "${name}" already exists` });
  }

  try {
    cp.execFileSync('tmux', ['new-session', '-d', '-s', name, '-c', cwd], {
      env: { ...process.env, HOME: DATA_HOME, USER: 'claude', LOGNAME: 'claude' },
      stdio: 'ignore',
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  const session = {
    name,
    cwd,
    workspace: workspace ?? 'home',
    repoName: repoName ?? null,
    createdAt: new Date().toISOString(),
    lastActive: new Date().toISOString(),
  };
  addSession(session);
  res.status(201).json({ ...session, alive: true });
});

app.delete('/sessions/:name', (req, res) => {
  if (!requireAuth(req, res)) return;
  const { name } = req.params;

  try {
    cp.execFileSync('tmux', ['kill-session', '-t', name], { stdio: 'ignore' });
  } catch {
    // session may already be dead — not an error
  }

  removeSession(name);
  res.json({ ok: true });
});

wss.on('connection', (ws, req) => {
  const params = new URL(req.url, 'http://localhost').searchParams;
  const token = params.get('token') ?? '';
  const sessionName = params.get('session') ?? '';

  try {
    jwt.verify(token, JWT_SECRET);
  } catch {
    ws.close(4401, 'Unauthorized');
    return;
  }

  const session = getSession(sessionName);
  if (!session) {
    ws.close(4400, 'Session not found');
    return;
  }

  let pty;
  let ptyDead = false;
  try {
    pty = nodePty.spawn('tmux', ['attach-session', '-t', sessionName], {
      name: 'xterm-256color',
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        HOME: DATA_HOME,
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

  updateLastActive(sessionName);

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

- [ ] **Step 4: Run tests to verify all pass**

```bash
cd /home/dama/repo/auto-hub/terminal
npx jest server.test.js 2>&1 | tail -10
```

Expected: all tests pass. If `isValidCwd` tests fail because the `/workspace/claude-home` path was used in other test assertions (like the GET /repos tests), update those to use `/workspace/data`.

- [ ] **Step 5: Commit**

```bash
cd /home/dama/repo/auto-hub
git add terminal/src/server.js terminal/src/server.test.js
git commit -m "feat: add session REST endpoints and switch WebSocket to tmux attach"
```

---

### Task 4: Backend Proxy for Sessions

**Files:**
- Modify: `backend/src/terminal/terminal.controller.ts`
- Modify: `backend/src/terminal/terminal.controller.spec.ts`

**Interfaces:**
- Consumes: `GET /sessions`, `POST /sessions`, `DELETE /sessions/:name` on terminal service at `http://terminal:7681`
- Produces: `GET /api/terminal/sessions`, `POST /api/terminal/sessions`, `DELETE /api/terminal/sessions/:name`

- [ ] **Step 1: Write the failing tests**

Append to `backend/src/terminal/terminal.controller.spec.ts` (after the closing `});` of the `cloneRepo` describe block):

```ts
  describe('getSessions', () => {
    afterEach(() => jest.resetAllMocks());

    it('proxies to terminal service forwarding auth header', async () => {
      const mockSessions = [{ name: 'alpha', cwd: '/workspace/data', alive: true }];
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => mockSessions,
      } as unknown as Response);

      const result = await controller.getSessions('Bearer test-token');

      expect(global.fetch).toHaveBeenCalledWith('http://terminal:7681/sessions', {
        headers: { authorization: 'Bearer test-token' },
      });
      expect(result).toEqual(mockSessions);
    });

    it('throws 503 when terminal service is unreachable', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
      await expect(controller.getSessions('Bearer token')).rejects.toThrow(HttpException);
    });

    it('throws with upstream status when terminal service returns error', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 503,
        text: async () => 'Service down',
      } as unknown as Response);
      await expect(controller.getSessions('Bearer bad')).rejects.toThrow(HttpException);
    });
  });

  describe('createSession', () => {
    afterEach(() => jest.resetAllMocks());

    it('proxies create request forwarding auth and body', async () => {
      const mockSession = { name: 'alpha', cwd: '/workspace/data', alive: true };
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => mockSession,
      } as unknown as Response);
      const body = { name: 'alpha', cwd: '/workspace/data', workspace: 'home' };

      const result = await controller.createSession(body, 'Bearer test-token');

      expect(global.fetch).toHaveBeenCalledWith('http://terminal:7681/sessions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer test-token' },
        body: JSON.stringify(body),
      });
      expect(result).toEqual(mockSession);
    });

    it('throws 503 when terminal service is unreachable', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
      await expect(
        controller.createSession({ name: 'x', cwd: '/workspace/data', workspace: 'home' }, 'Bearer t'),
      ).rejects.toThrow(HttpException);
    });

    it('throws with upstream status when terminal service returns 409', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({ error: 'Session "x" already exists' }),
      } as unknown as Response);
      await expect(
        controller.createSession({ name: 'x', cwd: '/workspace/data', workspace: 'home' }, 'Bearer t'),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('deleteSession', () => {
    afterEach(() => jest.resetAllMocks());

    it('proxies delete request forwarding auth header', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true }),
      } as unknown as Response);

      const result = await controller.deleteSession('my-sess', 'Bearer test-token');

      expect(global.fetch).toHaveBeenCalledWith('http://terminal:7681/sessions/my-sess', {
        method: 'DELETE',
        headers: { authorization: 'Bearer test-token' },
      });
      expect(result).toEqual({ ok: true });
    });

    it('throws 503 when terminal service is unreachable', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
      await expect(controller.deleteSession('s', 'Bearer t')).rejects.toThrow(HttpException);
    });
  });
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /home/dama/repo/auto-hub/backend
npx jest terminal.controller 2>&1 | tail -10
```

Expected: `getSessions`, `createSession`, `deleteSession` method not found errors.

- [ ] **Step 3: Update terminal.controller.ts**

Replace `backend/src/terminal/terminal.controller.ts` entirely:

```ts
import { Controller, Get, Post, Delete, Body, Headers, Param, HttpException, HttpStatus } from '@nestjs/common';

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

interface SessionEntry {
  name: string;
  cwd: string;
  workspace: string;
  repoName: string | null;
  alive: boolean;
  lastActive: string;
  createdAt: string;
}

interface CreateSessionBody {
  name: string;
  cwd: string;
  workspace: string;
  repoName?: string;
}

const LABEL_MAP: Record<string, string> = {
  '/workspace/home': 'Home',
  '/workspace/repo': 'Repos',
  '/workspace/data': 'Data Storage',
  '/workspace/github': 'GitHub Repos',
  '/workspace/auto-hub': 'Auto-Hub',
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

  @Get('sessions')
  async getSessions(@Headers('authorization') auth: string): Promise<SessionEntry[]> {
    let res: Response;
    try {
      res = await fetch(`${TERMINAL_SERVICE}/sessions`, {
        headers: { authorization: auth ?? '' },
      });
    } catch {
      throw new HttpException('Terminal service unavailable', HttpStatus.SERVICE_UNAVAILABLE);
    }
    if (!res.ok) throw new HttpException(await res.text(), res.status);
    return res.json() as Promise<SessionEntry[]>;
  }

  @Post('sessions')
  async createSession(
    @Body() body: CreateSessionBody,
    @Headers('authorization') auth: string,
  ): Promise<SessionEntry> {
    let res: Response;
    try {
      res = await fetch(`${TERMINAL_SERVICE}/sessions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: auth ?? '' },
        body: JSON.stringify(body),
      });
    } catch {
      throw new HttpException('Terminal service unavailable', HttpStatus.SERVICE_UNAVAILABLE);
    }
    if (!res.ok) throw new HttpException(await res.json() as object, res.status);
    return res.json() as Promise<SessionEntry>;
  }

  @Delete('sessions/:name')
  async deleteSession(
    @Param('name') name: string,
    @Headers('authorization') auth: string,
  ): Promise<{ ok: boolean }> {
    let res: Response;
    try {
      res = await fetch(`${TERMINAL_SERVICE}/sessions/${encodeURIComponent(name)}`, {
        method: 'DELETE',
        headers: { authorization: auth ?? '' },
      });
    } catch {
      throw new HttpException('Terminal service unavailable', HttpStatus.SERVICE_UNAVAILABLE);
    }
    if (!res.ok) throw new HttpException(await res.text(), res.status);
    return res.json() as Promise<{ ok: boolean }>;
  }
}
```

- [ ] **Step 4: Run tests to verify all pass**

```bash
cd /home/dama/repo/auto-hub/backend
npx jest terminal.controller 2>&1 | tail -10
```

Expected: all tests passing.

- [ ] **Step 5: Commit**

```bash
cd /home/dama/repo/auto-hub
git add backend/src/terminal/terminal.controller.ts backend/src/terminal/terminal.controller.spec.ts
git commit -m "feat: add backend proxy for session REST endpoints"
```

---

### Task 5: Frontend SessionManager + CreateSessionDialog

**Files:**
- Create: `frontend/src/app/(app)/terminal/components/SessionManager.tsx`
- Create: `frontend/src/app/(app)/terminal/components/CreateSessionDialog.tsx`
- Create: `frontend/src/app/(app)/terminal/components/SessionManager.test.tsx`
- Create: `frontend/src/app/(app)/terminal/components/CreateSessionDialog.test.tsx`

**Interfaces:**
- `Session` interface exported from `SessionManager.tsx` — used by `page.tsx` in Task 6
- `SessionManager` props: `onOpen: (session: Session) => void`, `onNew: (name: string) => void`
- `CreateSessionDialog` props: `onSubmit: (name: string) => void`, `onCancel: () => void`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/app/(app)/terminal/components/CreateSessionDialog.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CreateSessionDialog } from './CreateSessionDialog'

describe('CreateSessionDialog', () => {
  it('renders name input and submit button', () => {
    render(<CreateSessionDialog onSubmit={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByPlaceholderText(/e.g. auto-hub-dev/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument()
  })

  it('calls onSubmit with trimmed name on form submit', () => {
    const onSubmit = vi.fn()
    render(<CreateSessionDialog onSubmit={onSubmit} onCancel={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText(/e.g. auto-hub-dev/i), {
      target: { value: '  my-session  ' },
    })
    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    expect(onSubmit).toHaveBeenCalledWith('my-session')
  })

  it('shows error when name is empty', () => {
    render(<CreateSessionDialog onSubmit={vi.fn()} onCancel={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    expect(screen.getByText(/required/i)).toBeInTheDocument()
  })

  it('shows error when name contains invalid characters', () => {
    render(<CreateSessionDialog onSubmit={vi.fn()} onCancel={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText(/e.g. auto-hub-dev/i), {
      target: { value: 'bad/name' },
    })
    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    expect(screen.getByText(/only letters/i)).toBeInTheDocument()
  })

  it('calls onCancel when Back button is clicked', () => {
    const onCancel = vi.fn()
    render(<CreateSessionDialog onSubmit={vi.fn()} onCancel={onCancel} />)
    fireEvent.click(screen.getByLabelText('Back'))
    expect(onCancel).toHaveBeenCalled()
  })
})
```

Create `frontend/src/app/(app)/terminal/components/SessionManager.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SessionManager } from './SessionManager'
import api from '@/lib/api'

vi.mock('@/lib/api')

const mockApi = api as unknown as {
  get: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
}

describe('SessionManager', () => {
  beforeEach(() => {
    mockApi.get = vi.fn()
    mockApi.delete = vi.fn()
  })

  it('shows empty state when no sessions', async () => {
    mockApi.get.mockResolvedValue({ data: [] })
    render(<SessionManager onOpen={vi.fn()} onNew={vi.fn()} />)
    await waitFor(() => expect(screen.getByText(/no sessions yet/i)).toBeInTheDocument())
  })

  it('lists sessions with alive indicator', async () => {
    mockApi.get.mockResolvedValue({
      data: [{ name: 'alpha', cwd: '/workspace/data', workspace: 'home',
        repoName: null, alive: true, lastActive: '2026-01-01T00:00:00.000Z',
        createdAt: '2026-01-01T00:00:00.000Z' }]
    })
    render(<SessionManager onOpen={vi.fn()} onNew={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('alpha')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /open/i })).toBeInTheDocument()
  })

  it('calls onOpen when Open button is clicked', async () => {
    const session = { name: 'alpha', cwd: '/workspace/data', workspace: 'home' as const,
      repoName: null, alive: true, lastActive: '2026-01-01T00:00:00.000Z',
      createdAt: '2026-01-01T00:00:00.000Z' }
    mockApi.get.mockResolvedValue({ data: [session] })
    const onOpen = vi.fn()
    render(<SessionManager onOpen={onOpen} onNew={vi.fn()} />)
    await waitFor(() => fireEvent.click(screen.getByRole('button', { name: /open/i })))
    expect(onOpen).toHaveBeenCalledWith(session)
  })

  it('shows CreateSessionDialog when New Session is clicked', async () => {
    mockApi.get.mockResolvedValue({ data: [] })
    render(<SessionManager onOpen={vi.fn()} onNew={vi.fn()} />)
    await waitFor(() => screen.getByText(/no sessions yet/i))
    fireEvent.click(screen.getByRole('button', { name: /new session/i }))
    expect(screen.getByPlaceholderText(/e.g. auto-hub-dev/i)).toBeInTheDocument()
  })

  it('calls onNew with session name submitted in dialog', async () => {
    mockApi.get.mockResolvedValue({ data: [] })
    const onNew = vi.fn()
    render(<SessionManager onOpen={vi.fn()} onNew={onNew} />)
    await waitFor(() => screen.getByText(/no sessions yet/i))
    fireEvent.click(screen.getByRole('button', { name: /new session/i }))
    fireEvent.change(screen.getByPlaceholderText(/e.g. auto-hub-dev/i), {
      target: { value: 'my-session' },
    })
    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    expect(onNew).toHaveBeenCalledWith('my-session')
  })

  it('shows error state when API fails', async () => {
    mockApi.get.mockRejectedValue(new Error('Network error'))
    render(<SessionManager onOpen={vi.fn()} onNew={vi.fn()} />)
    await waitFor(() => expect(screen.getByText(/failed to load/i)).toBeInTheDocument())
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /home/dama/repo/auto-hub/frontend
npx vitest run "SessionManager.test|CreateSessionDialog.test" 2>&1 | grep -E "×|FAIL|Cannot find" | head -15
```

Expected: module not found errors.

- [ ] **Step 3: Create CreateSessionDialog.tsx**

```tsx
'use client'
import { useState } from 'react'
import { ArrowLeft } from 'lucide-react'

interface CreateSessionDialogProps {
  onSubmit: (name: string) => void
  onCancel: () => void
}

export function CreateSessionDialog({ onSubmit, onCancel }: CreateSessionDialogProps) {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Session name is required')
      return
    }
    if (!/^[a-zA-Z0-9_-]{1,40}$/.test(trimmed)) {
      setError('Only letters, numbers, hyphens and underscores, up to 40 characters')
      return
    }
    onSubmit(trimmed)
  }

  return (
    <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-6 w-full max-w-sm">
      <div className="flex items-center gap-2 mb-5">
        <button onClick={onCancel} aria-label="Back" className="text-[#6b7280] hover:text-white transition-colors">
          <ArrowLeft size={16} />
        </button>
        <h2 className="text-white text-sm font-semibold">New Session</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-[#6b7280] text-xs mb-1.5 block">Session name</label>
          <input
            type="text"
            autoFocus
            value={name}
            onChange={e => { setName(e.target.value); setError(null) }}
            placeholder="e.g. auto-hub-dev"
            maxLength={40}
            className="w-full bg-[#111111] border border-[#2a2a2a] rounded-md px-3 py-2 text-white text-sm font-mono placeholder-[#4b5563] focus:outline-none focus:border-[#10b981]/50"
          />
          {error && <p className="text-[#ef4444] text-xs mt-1.5">{error}</p>}
        </div>

        <button
          type="submit"
          disabled={!name.trim()}
          className="w-full py-2.5 text-sm bg-[#10b981] text-white rounded-md hover:bg-[#059669] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Next: Choose Workspace
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 4: Create SessionManager.tsx**

```tsx
'use client'
import { useEffect, useState } from 'react'
import { Plus, Circle, Trash2 } from 'lucide-react'
import api from '@/lib/api'
import { CreateSessionDialog } from './CreateSessionDialog'

export interface Session {
  name: string
  cwd: string
  workspace: 'home' | 'github' | 'auto-hub'
  repoName: string | null
  alive: boolean
  lastActive: string
  createdAt: string
}

interface SessionManagerProps {
  onOpen: (session: Session) => void
  onNew: (name: string) => void
}

export function SessionManager({ onOpen, onNew }: SessionManagerProps) {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const load = () => {
    setLoading(true)
    setError(null)
    api.get<Session[]>('/api/terminal/sessions')
      .then(r => { setSessions(r.data); setLoading(false) })
      .catch(() => { setError('Failed to load sessions'); setLoading(false) })
  }

  useEffect(() => { load() }, [])

  const handleEnd = async (name: string) => {
    try {
      await api.delete(`/api/terminal/sessions/${encodeURIComponent(name)}`)
      setSessions(s => s.filter(x => x.name !== name))
    } catch {
      // ignore — session may already be gone
    }
  }

  const handleCreate = (name: string) => {
    setCreating(false)
    onNew(name)
  }

  if (creating) {
    return (
      <div className="fixed inset-0 bg-[#0d0d0d] flex items-center justify-center p-4">
        <CreateSessionDialog onSubmit={handleCreate} onCancel={() => setCreating(false)} />
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-[#0d0d0d] flex items-center justify-center p-4">
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg w-full max-w-md">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#2a2a2a]">
          <h2 className="text-white text-sm font-semibold">Code Terminal</h2>
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-[#10b981]/10 text-[#10b981] text-xs font-medium hover:bg-[#10b981]/20 transition-colors"
          >
            <Plus size={13} />
            New Session
          </button>
        </div>

        <div className="divide-y divide-[#2a2a2a] max-h-80 overflow-y-auto">
          {loading && (
            <p className="text-[#6b7280] text-xs text-center py-8">Loading…</p>
          )}
          {error && (
            <div className="p-4 text-center">
              <p className="text-[#ef4444] text-xs mb-2">{error}</p>
              <button onClick={load} className="text-xs text-[#10b981] hover:underline">Retry</button>
            </div>
          )}
          {!loading && !error && sessions.length === 0 && (
            <p className="text-[#6b7280] text-xs text-center py-8">
              No sessions yet — create one to get started
            </p>
          )}
          {sessions.map(s => (
            <div key={s.name} className="flex items-center gap-3 px-4 py-3 hover:bg-[#1f1f1f]">
              <Circle
                size={8}
                className={s.alive
                  ? 'text-[#10b981] fill-[#10b981]'
                  : 'text-[#4b5563] fill-[#4b5563]'}
              />
              <div className="flex-1 min-w-0">
                <p className="text-white text-xs font-medium truncate">{s.name}</p>
                <p className="text-[#6b7280] text-[10px] font-mono truncate">{s.cwd}</p>
              </div>
              <button
                onClick={() => onOpen(s)}
                className="px-2.5 py-1 rounded bg-[#10b981]/10 text-[#10b981] text-xs hover:bg-[#10b981]/20 transition-colors"
              >
                Open
              </button>
              <button
                onClick={() => handleEnd(s.name)}
                aria-label={`End ${s.name}`}
                className="p-1 rounded text-[#6b7280] hover:text-[#ef4444] hover:bg-[#ef4444]/10 transition-colors"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd /home/dama/repo/auto-hub/frontend
npx vitest run "SessionManager.test|CreateSessionDialog.test" 2>&1 | grep -E "✓|×|passed|failed"
```

Expected: all tests passing.

- [ ] **Step 6: Commit**

```bash
cd /home/dama/repo/auto-hub
git add frontend/src/app/\(app\)/terminal/components/SessionManager.tsx \
  frontend/src/app/\(app\)/terminal/components/CreateSessionDialog.tsx \
  frontend/src/app/\(app\)/terminal/components/SessionManager.test.tsx \
  frontend/src/app/\(app\)/terminal/components/CreateSessionDialog.test.tsx
git commit -m "feat: add SessionManager and CreateSessionDialog components"
```

---

### Task 6: SessionTabs + TerminalBreadcrumb + page.tsx

**Files:**
- Create: `frontend/src/app/(app)/terminal/components/SessionTabs.tsx`
- Create: `frontend/src/app/(app)/terminal/components/SessionTabs.test.tsx`
- Modify: `frontend/src/app/(app)/terminal/components/TerminalBreadcrumb.tsx`
- Modify: `frontend/src/app/(app)/terminal/components/TerminalBreadcrumb.test.tsx`
- Modify: `frontend/src/app/(app)/terminal/page.tsx`

**Interfaces:**
- `SessionTabs` props: `tabs: TabSession[]`, `activeTab: string`, `onSwitch: (name: string) => void`, `onEnd: (name: string) => void`, `onNew: () => void`
- `TabSession`: `{ name: string; workspace: 'home' | 'github' | 'auto-hub'; repoName: string | null }`
- `TerminalBreadcrumb` props: `sessionName: string`, `workspace: 'home' | 'github' | 'auto-hub'`, `repoName: string | null`, `onChangeDir: () => void`

- [ ] **Step 1: Write the failing SessionTabs tests**

Create `frontend/src/app/(app)/terminal/components/SessionTabs.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SessionTabs } from './SessionTabs'

const tabs = [
  { name: 'alpha', workspace: 'home' as const, repoName: null },
  { name: 'beta', workspace: 'github' as const, repoName: 'my-repo' },
]

describe('SessionTabs', () => {
  it('renders tab names', () => {
    render(<SessionTabs tabs={tabs} activeTab="alpha" onSwitch={vi.fn()} onEnd={vi.fn()} onNew={vi.fn()} />)
    expect(screen.getByText('alpha')).toBeInTheDocument()
    expect(screen.getByText('beta')).toBeInTheDocument()
  })

  it('calls onSwitch when a non-active tab is clicked', () => {
    const onSwitch = vi.fn()
    render(<SessionTabs tabs={tabs} activeTab="alpha" onSwitch={onSwitch} onEnd={vi.fn()} onNew={vi.fn()} />)
    fireEvent.click(screen.getByText('beta'))
    expect(onSwitch).toHaveBeenCalledWith('beta')
  })

  it('calls onEnd when the close button of a tab is clicked', () => {
    const onEnd = vi.fn()
    render(<SessionTabs tabs={tabs} activeTab="alpha" onSwitch={vi.fn()} onEnd={onEnd} onNew={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('Close alpha'))
    expect(onEnd).toHaveBeenCalledWith('alpha')
  })

  it('calls onNew when the + button is clicked', () => {
    const onNew = vi.fn()
    render(<SessionTabs tabs={tabs} activeTab="alpha" onSwitch={vi.fn()} onEnd={vi.fn()} onNew={onNew} />)
    fireEvent.click(screen.getByLabelText('New or existing session'))
    expect(onNew).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Write failing TerminalBreadcrumb tests**

Replace `frontend/src/app/(app)/terminal/components/TerminalBreadcrumb.test.tsx` entirely:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TerminalBreadcrumb } from './TerminalBreadcrumb'

describe('TerminalBreadcrumb', () => {
  it('shows session name and workspace label for home', () => {
    render(<TerminalBreadcrumb sessionName="my-sess" workspace="home" repoName={null} onChangeDir={vi.fn()} />)
    expect(screen.getByText('my-sess')).toBeInTheDocument()
    expect(screen.getByText('Home')).toBeInTheDocument()
  })

  it('shows session name, GitHub Repos, and repo name for github workspace', () => {
    render(<TerminalBreadcrumb sessionName="dev" workspace="github" repoName="auto-hub" onChangeDir={vi.fn()} />)
    expect(screen.getByText('dev')).toBeInTheDocument()
    expect(screen.getByText('GitHub Repos')).toBeInTheDocument()
    expect(screen.getByText('auto-hub')).toBeInTheDocument()
  })

  it('shows Auto-Hub label for auto-hub workspace', () => {
    render(<TerminalBreadcrumb sessionName="hub" workspace="auto-hub" repoName={null} onChangeDir={vi.fn()} />)
    expect(screen.getByText('Auto-Hub')).toBeInTheDocument()
  })

  it('does not show repo name when repoName is null', () => {
    render(<TerminalBreadcrumb sessionName="s" workspace="github" repoName={null} onChangeDir={vi.fn()} />)
    expect(screen.queryByText('auto-hub')).not.toBeInTheDocument()
  })

  it('calls onChangeDir when Change button is clicked', () => {
    const onChangeDir = vi.fn()
    render(<TerminalBreadcrumb sessionName="s" workspace="home" repoName={null} onChangeDir={onChangeDir} />)
    fireEvent.click(screen.getByText('Change'))
    expect(onChangeDir).toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Run tests to confirm they fail**

```bash
cd /home/dama/repo/auto-hub/frontend
npx vitest run "SessionTabs.test|TerminalBreadcrumb.test" 2>&1 | grep -E "×|FAIL|Cannot find" | head -15
```

Expected: SessionTabs not found, TerminalBreadcrumb tests fail on missing `sessionName` prop and `Auto-Hub` label.

- [ ] **Step 4: Create SessionTabs.tsx**

```tsx
'use client'
import { Plus, X } from 'lucide-react'

export interface TabSession {
  name: string
  workspace: 'home' | 'github' | 'auto-hub'
  repoName: string | null
}

interface SessionTabsProps {
  tabs: TabSession[]
  activeTab: string
  onSwitch: (name: string) => void
  onEnd: (name: string) => void
  onNew: () => void
}

export function SessionTabs({ tabs, activeTab, onSwitch, onEnd, onNew }: SessionTabsProps) {
  return (
    <div className="flex items-center gap-0.5 px-2 h-8 bg-[#0d0d0d] border-b border-[#2a2a2a] overflow-x-auto shrink-0">
      {tabs.map(tab => (
        <div
          key={tab.name}
          className={`flex items-center gap-1.5 px-2.5 h-full text-xs font-mono cursor-pointer shrink-0 border-b-2 transition-colors ${
            tab.name === activeTab
              ? 'text-white border-[#10b981]'
              : 'text-[#6b7280] border-transparent hover:text-[#9ca3af]'
          }`}
          onClick={() => onSwitch(tab.name)}
        >
          <span className="max-w-[120px] truncate">{tab.name}</span>
          <button
            onClick={e => { e.stopPropagation(); onEnd(tab.name) }}
            aria-label={`Close ${tab.name}`}
            className="text-[#4b5563] hover:text-[#ef4444] transition-colors ml-0.5"
          >
            <X size={10} />
          </button>
        </div>
      ))}
      <button
        onClick={onNew}
        aria-label="New or existing session"
        className="flex items-center justify-center w-6 h-6 rounded text-[#6b7280] hover:text-[#10b981] hover:bg-[#1a1a1a] transition-colors shrink-0 ml-0.5"
      >
        <Plus size={12} />
      </button>
    </div>
  )
}
```

- [ ] **Step 5: Update TerminalBreadcrumb.tsx**

Replace `frontend/src/app/(app)/terminal/components/TerminalBreadcrumb.tsx` entirely:

```tsx
'use client'
import { ChevronRight } from 'lucide-react'

const WORKSPACE_LABELS: Record<string, string> = {
  home: 'Home',
  github: 'GitHub Repos',
  'auto-hub': 'Auto-Hub',
}

interface TerminalBreadcrumbProps {
  sessionName: string
  workspace: 'home' | 'github' | 'auto-hub'
  repoName: string | null
  onChangeDir: () => void
}

export function TerminalBreadcrumb({ sessionName, workspace, repoName, onChangeDir }: TerminalBreadcrumbProps) {
  return (
    <div className="h-9 flex items-center justify-between px-3 bg-[#111111] border-b border-[#2a2a2a] shrink-0">
      <div className="flex items-center gap-1 text-xs text-[#6b7280] font-mono overflow-hidden">
        <span className="text-[#10b981] truncate">{sessionName}</span>
        <ChevronRight size={12} className="shrink-0 text-[#3f3f3f]" />
        <span className="truncate">{WORKSPACE_LABELS[workspace] ?? workspace}</span>
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

- [ ] **Step 6: Run SessionTabs + TerminalBreadcrumb tests**

```bash
cd /home/dama/repo/auto-hub/frontend
npx vitest run "SessionTabs.test|TerminalBreadcrumb.test" 2>&1 | grep -E "✓|×|passed|failed"
```

Expected: all tests passing.

- [ ] **Step 7: Rewrite page.tsx**

Replace `frontend/src/app/(app)/terminal/page.tsx` entirely:

```tsx
'use client'
import '@xterm/xterm/css/xterm.css'
import { useEffect, useRef, useState } from 'react'
import api from '@/lib/api'
import { SessionManager, Session } from './components/SessionManager'
import { WorkspacePicker } from './components/WorkspacePicker'
import { RepoPicker } from './components/RepoPicker'
import { CloneDialog } from './components/CloneDialog'
import { SessionTabs, TabSession } from './components/SessionTabs'
import { TerminalBreadcrumb } from './components/TerminalBreadcrumb'

interface Repo {
  name: string
  path: string
  isGitRepo: boolean
}

type Step = 'session' | 'workspace' | 'repo' | 'clone' | 'terminal'
type Workspace = 'home' | 'github' | 'auto-hub'

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
  const [step, setStep] = useState<Step>('session')
  const [sessionName, setSessionName] = useState<string | null>(null)
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [repoName, setRepoName] = useState<string | null>(null)
  const [pendingName, setPendingName] = useState<string | null>(null)
  const [openTabs, setOpenTabs] = useState<TabSession[]>([])
  const [error, setError] = useState<string | null>(null)
  const [sessionEnded, setSessionEnded] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const termContainerRef = useRef<HTMLDivElement>(null)
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    setIsMobile(window.innerWidth < 768 || navigator.maxTouchPoints > 0)
  }, [])

  useEffect(() => {
    if (!sessionName || !termContainerRef.current) return

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
        `${proto}//${window.location.host}/terminal-ws/?session=${encodeURIComponent(sessionName)}&token=${encodeURIComponent(token)}`
      )
      wsRef.current = ws

      ws.onmessage = e => term.write(e.data as string)
      ws.onerror = () => setError('Connection error. Authentication may have failed.')
      ws.onclose = e => {
        wsRef.current = null
        if (e.code === 4401) setError('Authentication failed. Please log in again.')
        else if (e.code === 4400) setError('Session not found.')
        else if (e.code === 4500) setError('Session ended or failed to start.')
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
  }, [sessionName, isMobile])

  const createAndOpenSession = async (
    name: string,
    cwd: string,
    ws: Workspace,
    repo: string | null,
  ) => {
    try {
      await api.post('/api/terminal/sessions', { name, cwd, workspace: ws, repoName: repo })
    } catch (e) {
      const msg =
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Failed to create session'
      setError(msg)
      setStep('session')
      return
    }
    const tab: TabSession = { name, workspace: ws, repoName: repo }
    setOpenTabs(tabs => [...tabs, tab])
    setWorkspace(ws)
    setRepoName(repo)
    setSessionName(name)
    setError(null)
    setSessionEnded(false)
    setStep('terminal')
  }

  const handleSessionOpen = (session: Session) => {
    setWorkspace(session.workspace)
    setRepoName(session.repoName)
    if (!openTabs.some(t => t.name === session.name)) {
      setOpenTabs(tabs => [
        ...tabs,
        { name: session.name, workspace: session.workspace, repoName: session.repoName },
      ])
    }
    setError(null)
    setSessionEnded(false)
    setSessionName(session.name)
    setStep('terminal')
  }

  const handleNewSessionName = (name: string) => {
    setPendingName(name)
    setStep('workspace')
  }

  const handleWorkspaceSelect = async (ws: Workspace) => {
    setWorkspace(ws)
    if (ws === 'home') {
      await createAndOpenSession(pendingName!, '/workspace/data', ws, null)
    } else if (ws === 'auto-hub') {
      await createAndOpenSession(pendingName!, '/workspace/auto-hub', ws, null)
    } else {
      setStep('repo')
    }
  }

  const handleRepoSelect = async (repo: Repo) => {
    setRepoName(repo.name)
    await createAndOpenSession(pendingName!, repo.path, 'github', repo.name)
  }

  const handleCloneSuccess = async (repoPath: string, name: string) => {
    setRepoName(name)
    await createAndOpenSession(pendingName!, repoPath, 'github', name)
  }

  const handleSwitchTab = (name: string) => {
    if (name === sessionName) return
    const tab = openTabs.find(t => t.name === name)
    if (!tab) return
    setSessionName(null)
    setWorkspace(tab.workspace)
    setRepoName(tab.repoName)
    setError(null)
    setSessionEnded(false)
    requestAnimationFrame(() => setSessionName(name))
  }

  const handleEndTab = async (name: string) => {
    try {
      await api.delete(`/api/terminal/sessions/${encodeURIComponent(name)}`)
    } catch {
      // session may already be dead
    }
    setOpenTabs(tabs => tabs.filter(t => t.name !== name))
    if (sessionName === name) {
      setSessionName(null)
      setStep('session')
    }
  }

  const handleChangeDir = () => {
    setSessionName(null)
    setWorkspace(null)
    setRepoName(null)
    setError(null)
    setSessionEnded(false)
    setStep('session')
  }

  const reconnect = () => {
    const saved = sessionName
    setSessionEnded(false)
    setError(null)
    setSessionName(null)
    requestAnimationFrame(() => setSessionName(saved))
  }

  if (step === 'session') {
    return <SessionManager onOpen={handleSessionOpen} onNew={handleNewSessionName} />
  }
  if (step === 'workspace') {
    return <WorkspacePicker onSelect={handleWorkspaceSelect} onBack={() => setStep('session')} />
  }
  if (step === 'repo') {
    return (
      <RepoPicker
        onSelect={repo => { void handleRepoSelect(repo) }}
        onClone={() => setStep('clone')}
        onBack={() => setStep('workspace')}
      />
    )
  }
  if (step === 'clone') {
    return (
      <CloneDialog
        onSuccess={(path, name) => { void handleCloneSuccess(path, name) }}
        onBack={() => setStep('repo')}
      />
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-[#ef4444] text-sm text-center">{error}</p>
        <button
          onClick={handleChangeDir}
          className="px-4 py-2 text-xs bg-[#2a2a2a] text-[#e5e7eb] rounded hover:bg-[#3a3a3a] transition-colors"
        >
          Sessions
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
            Sessions
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="-mx-6 -mt-6 -mb-20 md:-mb-6 flex flex-col" style={{ height: '100dvh' }}>
      <SessionTabs
        tabs={openTabs}
        activeTab={sessionName ?? ''}
        onSwitch={handleSwitchTab}
        onEnd={name => { void handleEndTab(name) }}
        onNew={handleChangeDir}
      />
      <TerminalBreadcrumb
        sessionName={sessionName ?? ''}
        workspace={workspace!}
        repoName={repoName}
        onChangeDir={handleChangeDir}
      />
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

- [ ] **Step 8: Run all frontend terminal tests**

```bash
cd /home/dama/repo/auto-hub/frontend
npx vitest run "terminal" 2>&1 | grep -E "✓|×|passed|failed"
```

Expected: all tests passing. If TypeScript errors appear in page.tsx (e.g., `handleRepoSelect` returns a Promise but RepoPicker expects sync), the `void` prefix in the JSX handlers above handles this.

- [ ] **Step 9: TypeScript check**

```bash
cd /home/dama/repo/auto-hub/frontend
npx tsc --noEmit 2>&1 | grep -v "node_modules" | head -20
```

Expected: no errors. Fix any type errors before committing.

- [ ] **Step 10: Commit**

```bash
cd /home/dama/repo/auto-hub
git add frontend/src/app/\(app\)/terminal/components/SessionTabs.tsx \
  frontend/src/app/\(app\)/terminal/components/SessionTabs.test.tsx \
  frontend/src/app/\(app\)/terminal/components/TerminalBreadcrumb.tsx \
  frontend/src/app/\(app\)/terminal/components/TerminalBreadcrumb.test.tsx \
  frontend/src/app/\(app\)/terminal/page.tsx
git commit -m "feat: add session tabs, update breadcrumb, rewrite terminal page for session flow"
```

---

## Self-Review

### Spec Coverage Check

| Spec Requirement | Task |
|---|---|
| App renamed to 'Code Terminal' | Task 1 |
| `claude` user full sudo inside container | Task 1 (Dockerfile) |
| Dev tools: vim, nano, htop, jq, zip, unzip, ripgrep, tmux | Task 1 (Dockerfile) |
| Claude Code CLI (`@anthropic-ai/claude-code`) installed | Task 1 (Dockerfile) |
| Docker socket mount + `docker` CLI in container | Task 1 (Dockerfile + docker-compose) |
| Auto-Hub workspace added to TERMINAL_DIRS | Task 1 (docker-compose) |
| Auto-Hub volume mount | Task 1 (docker-compose) |
| Auto-Hub option in WorkspacePicker | Task 1 |
| Session manifest JSON at `/workspace/data/.terminal-sessions.json` | Task 2 |
| Resurrection script on container start | Task 2 + entrypoint.sh |
| GET /sessions with alive cross-reference | Task 3 |
| POST /sessions (validate name, cwd, create tmux, write manifest) | Task 3 |
| DELETE /sessions/:name (kill tmux, remove manifest) | Task 3 |
| WebSocket uses `?session=` instead of `?cwd=` | Task 3 |
| WebSocket attaches to tmux session | Task 3 |
| Backend proxy for session endpoints | Task 4 |
| SessionManager UI with session list | Task 5 |
| CreateSessionDialog with name validation | Task 5 |
| SessionTabs strip above terminal | Task 6 |
| TerminalBreadcrumb shows session name + workspace | Task 6 |
| page.tsx flow: session → workspace → repo → clone → terminal | Task 6 |
| Tab switching (close/reopen WebSocket) | Task 6 |
| "Change Dir" → back to session manager | Task 6 |
| 409 collision error shown to user | Task 6 (createAndOpenSession error handling) |

### Placeholder Scan

No TBD, TODO, or incomplete sections found.

### Type Consistency

- `Session` interface: exported from `SessionManager.tsx`, consumed by `page.tsx` — matches
- `TabSession` interface: exported from `SessionTabs.tsx`, consumed by `page.tsx` — matches
- `Workspace` type `'home' | 'github' | 'auto-hub'`: consistent across all files
- `sessions.js` exports: `getSessions, getSession, addSession, removeSession, updateLastActive` — all consumed in `server.js` by exact name
- `onBack` prop: added to `WorkspacePicker` in Task 1, consumed in `page.tsx` in Task 6 — matches
- `sessionName` prop: added to `TerminalBreadcrumb` in Task 6 — consistent with page.tsx usage
