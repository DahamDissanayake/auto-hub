# Claude Code Profile Switcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-account Claude Code support: an OAuth login flow to register named profiles and a profile button in the terminal UI to switch the active `~/.claude/.credentials.json`.

**Architecture:** The terminal service (Node.js/Express) spawns `claude /login` as a child process, captures the auth URL from its stdout, and pipes the user-supplied code back via stdin. Resulting credentials are saved to `~/.claude/profiles/<name>.json`. On container start a bootstrap function restores the previously-active profile. A `ProfileButton` React component (shared by `TerminalBreadcrumb` and `SessionManager`) calls five new proxy endpoints in the NestJS backend.

**Tech Stack:** Node.js 20 (terminal service), NestJS (backend), Next.js 14 + React 18 (frontend), Jest + supertest (terminal/backend tests), Vitest + @testing-library/react (frontend tests), Tailwind CSS, lucide-react.

## Global Constraints

- All profile files live under `/home/dama/.claude/` — no new Docker volumes.
- Profile names must match `/^[a-zA-Z0-9_-]{1,20}$/`.
- All terminal service routes require the same `requireAuth` JWT check used by existing routes.
- No new npm packages required — `crypto` (built-in) provides `randomUUID`.
- Frontend: no new dependencies; use existing `axios` (`api`), `lucide-react`, Tailwind.
- Bootstrap must complete before the HTTP server starts accepting connections.
- Follow existing code patterns exactly: terminal service uses CommonJS (`'use strict'`); frontend uses `'use client'` on interactive components.

---

### Task 1: Terminal service — profile storage helpers

**Files:**
- Create: `terminal/src/profiles.js`
- Create: `terminal/src/profiles.test.js`

**Interfaces:**
- Produces:
  - `readMeta() → { active: string|null, profiles: [{name, addedAt}] }`
  - `writeMeta(meta) → void`
  - `bootstrapActiveProfile() → void`
  - `profileExists(name: string) → boolean`
  - `saveProfile(name: string) → void` — reads `.credentials.json`, writes to profiles dir, updates meta, sets active
  - `activateProfile(name: string) → void` — copies profile file to `.credentials.json`, updates meta
  - `deleteProfile(name: string) → void` — removes profile file, removes from meta, clears active if needed
  - `CREDENTIALS_PATH`, `PROFILES_DIR`, `META_PATH` (string constants)

- [ ] **Step 1: Write `profiles.test.js` — failing tests**

```javascript
'use strict';
jest.mock('fs');
const fs = require('fs');

const CLAUDE_DIR = '/home/dama/.claude';
const PROFILES_DIR = CLAUDE_DIR + '/profiles';
const CREDENTIALS_PATH = CLAUDE_DIR + '/.credentials.json';
const META_PATH = PROFILES_DIR + '/meta.json';

const EMPTY_META = JSON.stringify({ active: null, profiles: [] });
const META_WITH_WORK = JSON.stringify({
  active: 'work',
  profiles: [{ name: 'work', addedAt: '2026-01-01T00:00:00.000Z' }],
});

beforeEach(() => jest.resetAllMocks());

describe('readMeta', () => {
  it('returns default when file does not exist', () => {
    fs.readFileSync.mockImplementation(() => { throw Object.assign(new Error(), { code: 'ENOENT' }) });
    const { readMeta } = require('./profiles');
    expect(readMeta()).toEqual({ active: null, profiles: [] });
  });

  it('returns parsed meta when file exists', () => {
    fs.readFileSync.mockReturnValue(META_WITH_WORK);
    jest.resetModules();
    const { readMeta } = require('./profiles');
    expect(readMeta().active).toBe('work');
    expect(readMeta().profiles).toHaveLength(1);
  });
});

describe('bootstrapActiveProfile', () => {
  it('does nothing when active is null', () => {
    fs.readFileSync.mockReturnValue(EMPTY_META);
    jest.resetModules();
    const { bootstrapActiveProfile } = require('./profiles');
    bootstrapActiveProfile();
    expect(fs.copyFileSync).not.toHaveBeenCalled();
  });

  it('does nothing when active profile file does not exist', () => {
    fs.readFileSync.mockReturnValue(META_WITH_WORK);
    fs.existsSync.mockReturnValue(false);
    jest.resetModules();
    const { bootstrapActiveProfile } = require('./profiles');
    bootstrapActiveProfile();
    expect(fs.copyFileSync).not.toHaveBeenCalled();
  });

  it('copies profile to credentials when active profile exists', () => {
    fs.readFileSync.mockReturnValue(META_WITH_WORK);
    fs.existsSync.mockReturnValue(true);
    fs.copyFileSync.mockImplementation(() => {});
    jest.resetModules();
    const { bootstrapActiveProfile } = require('./profiles');
    bootstrapActiveProfile();
    expect(fs.copyFileSync).toHaveBeenCalledWith(
      PROFILES_DIR + '/work.json',
      CREDENTIALS_PATH,
    );
  });
});

describe('profileExists', () => {
  it('returns true when profile file exists', () => {
    fs.existsSync.mockReturnValue(true);
    jest.resetModules();
    const { profileExists } = require('./profiles');
    expect(profileExists('work')).toBe(true);
    expect(fs.existsSync).toHaveBeenCalledWith(PROFILES_DIR + '/work.json');
  });

  it('returns false when profile file does not exist', () => {
    fs.existsSync.mockReturnValue(false);
    jest.resetModules();
    const { profileExists } = require('./profiles');
    expect(profileExists('work')).toBe(false);
  });
});

describe('saveProfile', () => {
  it('reads credentials, writes profile file, updates meta with new profile as active', () => {
    const creds = '{"claudeAiOauth":{"token":"abc"}}';
    fs.readFileSync.mockImplementation((p) => {
      if (p === CREDENTIALS_PATH) return creds;
      throw Object.assign(new Error(), { code: 'ENOENT' }); // meta doesn't exist yet
    });
    fs.existsSync.mockReturnValue(false); // profiles dir doesn't exist
    fs.mkdirSync.mockImplementation(() => {});
    fs.writeFileSync.mockImplementation(() => {});
    fs.renameSync.mockImplementation(() => {});
    jest.resetModules();
    const { saveProfile } = require('./profiles');
    saveProfile('work');
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      PROFILES_DIR + '/work.json', creds, 'utf8',
    );
    const metaCall = fs.writeFileSync.mock.calls.find(c => c[0].includes('meta'));
    expect(metaCall).toBeTruthy();
    const meta = JSON.parse(metaCall[1]);
    expect(meta.active).toBe('work');
    expect(meta.profiles.some(p => p.name === 'work')).toBe(true);
  });
});

describe('activateProfile', () => {
  it('copies profile file to credentials and updates meta', () => {
    fs.readFileSync.mockReturnValue(META_WITH_WORK);
    fs.existsSync.mockReturnValue(true);
    fs.mkdirSync.mockImplementation(() => {});
    fs.copyFileSync.mockImplementation(() => {});
    fs.writeFileSync.mockImplementation(() => {});
    fs.renameSync.mockImplementation(() => {});
    jest.resetModules();
    const { activateProfile } = require('./profiles');
    activateProfile('work');
    expect(fs.copyFileSync).toHaveBeenCalledWith(
      PROFILES_DIR + '/work.json', CREDENTIALS_PATH,
    );
    const metaCall = fs.writeFileSync.mock.calls.find(c => c[0].includes('meta'));
    const meta = JSON.parse(metaCall[1]);
    expect(meta.active).toBe('work');
  });
});

describe('deleteProfile', () => {
  it('removes profile file, removes from meta, clears active if it was active', () => {
    fs.readFileSync.mockReturnValue(META_WITH_WORK);
    fs.existsSync.mockReturnValue(true);
    fs.mkdirSync.mockImplementation(() => {});
    fs.unlinkSync.mockImplementation(() => {});
    fs.writeFileSync.mockImplementation(() => {});
    fs.renameSync.mockImplementation(() => {});
    jest.resetModules();
    const { deleteProfile } = require('./profiles');
    deleteProfile('work');
    expect(fs.unlinkSync).toHaveBeenCalledWith(PROFILES_DIR + '/work.json');
    const metaCall = fs.writeFileSync.mock.calls.find(c => c[0].includes('meta'));
    const meta = JSON.parse(metaCall[1]);
    expect(meta.active).toBeNull();
    expect(meta.profiles).toHaveLength(0);
  });

  it('is a no-op for file removal when profile file does not exist', () => {
    fs.readFileSync.mockReturnValue(EMPTY_META);
    fs.existsSync.mockReturnValue(false);
    fs.mkdirSync.mockImplementation(() => {});
    fs.writeFileSync.mockImplementation(() => {});
    fs.renameSync.mockImplementation(() => {});
    jest.resetModules();
    const { deleteProfile } = require('./profiles');
    deleteProfile('ghost');
    expect(fs.unlinkSync).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /workspace/auto-hub/terminal && npx jest src/profiles.test.js --no-coverage 2>&1 | tail -5
```
Expected: `Cannot find module './profiles'`

- [ ] **Step 3: Implement `terminal/src/profiles.js`**

```javascript
'use strict';
const fs = require('fs');
const path = require('path');

const DATA_HOME = '/home/dama';
const CLAUDE_DIR = path.join(DATA_HOME, '.claude');
const CREDENTIALS_PATH = path.join(CLAUDE_DIR, '.credentials.json');
const PROFILES_DIR = path.join(CLAUDE_DIR, 'profiles');
const META_PATH = path.join(PROFILES_DIR, 'meta.json');

function ensureProfilesDir() {
  if (!fs.existsSync(PROFILES_DIR)) fs.mkdirSync(PROFILES_DIR, { recursive: true });
}

function readMeta() {
  try {
    return JSON.parse(fs.readFileSync(META_PATH, 'utf8'));
  } catch {
    return { active: null, profiles: [] };
  }
}

function writeMeta(meta) {
  ensureProfilesDir();
  const tmp = META_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(meta, null, 2), 'utf8');
  fs.renameSync(tmp, META_PATH);
}

function bootstrapActiveProfile() {
  const meta = readMeta();
  if (!meta.active) return;
  const profilePath = path.join(PROFILES_DIR, `${meta.active}.json`);
  if (!fs.existsSync(profilePath)) return;
  try {
    fs.copyFileSync(profilePath, CREDENTIALS_PATH);
    console.log(`[profiles] Restored active profile: ${meta.active}`);
  } catch (err) {
    console.error(`[profiles] Failed to restore active profile: ${err.message}`);
  }
}

function profileExists(name) {
  return fs.existsSync(path.join(PROFILES_DIR, `${name}.json`));
}

function saveProfile(name) {
  const creds = fs.readFileSync(CREDENTIALS_PATH, 'utf8');
  ensureProfilesDir();
  fs.writeFileSync(path.join(PROFILES_DIR, `${name}.json`), creds, 'utf8');
  const meta = readMeta();
  if (!meta.profiles.some(p => p.name === name)) {
    meta.profiles.push({ name, addedAt: new Date().toISOString() });
  }
  meta.active = name;
  writeMeta(meta);
}

function activateProfile(name) {
  fs.copyFileSync(path.join(PROFILES_DIR, `${name}.json`), CREDENTIALS_PATH);
  const meta = readMeta();
  meta.active = name;
  writeMeta(meta);
}

function deleteProfile(name) {
  const profilePath = path.join(PROFILES_DIR, `${name}.json`);
  if (fs.existsSync(profilePath)) fs.unlinkSync(profilePath);
  const meta = readMeta();
  meta.profiles = meta.profiles.filter(p => p.name !== name);
  if (meta.active === name) meta.active = null;
  writeMeta(meta);
}

module.exports = {
  readMeta,
  writeMeta,
  bootstrapActiveProfile,
  profileExists,
  saveProfile,
  activateProfile,
  deleteProfile,
  CREDENTIALS_PATH,
  PROFILES_DIR,
  META_PATH,
};
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd /workspace/auto-hub/terminal && npx jest src/profiles.test.js --no-coverage 2>&1 | tail -5
```
Expected: `Tests: X passed`

- [ ] **Step 5: Commit**

```bash
cd /workspace/auto-hub && git add terminal/src/profiles.js terminal/src/profiles.test.js
git commit -m "feat(terminal): add profile storage helpers for Claude Code accounts"
```

---

### Task 2: Terminal service — profile API routes

**Files:**
- Modify: `terminal/src/server.js`
- Modify: `terminal/src/server.test.js`

**Interfaces:**
- Consumes: `profiles.readMeta`, `profiles.profileExists`, `profiles.saveProfile`, `profiles.activateProfile`, `profiles.deleteProfile`, `profiles.bootstrapActiveProfile` from Task 1
- Produces (HTTP):
  - `GET /claude-profiles` → `{ active, profiles }`
  - `POST /claude-profiles/login/start` body `{ name }` → `{ sessionId, url }`
  - `POST /claude-profiles/login/complete` body `{ sessionId, code }` → `{ ok: true }`
  - `POST /claude-profiles/:name/activate` → `{ ok: true }`
  - `DELETE /claude-profiles/:name` → `{ ok: true }`
- Also exports `pendingLogins` (Map) for test access

- [ ] **Step 1: Add profile route tests to `server.test.js`**

Add at the top of `server.test.js`, after the existing `jest.mock('./sessions')` line:

```javascript
jest.mock('./profiles');
```

Add after the existing imports block (after `const sessions = require('./sessions');`):

```javascript
const profiles = require('./profiles');
const { EventEmitter } = require('events');
```

Add `pendingLogins` to the destructured require of `./server`:

```javascript
// Change the existing line:
const { app, isValidCwd } = require('./server');
// To:
const { app, isValidCwd, pendingLogins } = require('./server');
```

Append these describe blocks at the end of `server.test.js`:

```javascript
describe('GET /claude-profiles', () => {
  afterEach(() => jest.resetAllMocks());

  it('returns 401 without auth', async () => {
    await request(app).get('/claude-profiles').expect(401);
  });

  it('returns profile list from readMeta', async () => {
    profiles.readMeta.mockReturnValue({
      active: 'work',
      profiles: [{ name: 'work', addedAt: '2026-01-01T00:00:00.000Z' }],
    });
    const res = await request(app)
      .get('/claude-profiles')
      .set('Authorization', auth)
      .expect(200);
    expect(res.body.active).toBe('work');
    expect(res.body.profiles).toHaveLength(1);
  });
});

describe('POST /claude-profiles/login/start', () => {
  let mockChild;

  beforeEach(() => {
    jest.resetAllMocks();
    mockChild = new EventEmitter();
    mockChild.stdout = new EventEmitter();
    mockChild.stderr = new EventEmitter();
    mockChild.stdin = { write: jest.fn() };
    mockChild.kill = jest.fn();
    jest.spyOn(cp, 'spawn').mockReturnValue(mockChild);
  });

  afterEach(() => jest.restoreAllMocks());

  it('returns 401 without auth', async () => {
    await request(app).post('/claude-profiles/login/start').send({ name: 'work' }).expect(401);
  });

  it('returns 400 for invalid name', async () => {
    const res = await request(app)
      .post('/claude-profiles/login/start')
      .set('Authorization', auth)
      .send({ name: 'bad name!' })
      .expect(400);
    expect(res.body.error).toMatch(/name/);
  });

  it('returns 409 when profile already exists', async () => {
    profiles.profileExists.mockReturnValue(true);
    const res = await request(app)
      .post('/claude-profiles/login/start')
      .set('Authorization', auth)
      .send({ name: 'work' })
      .expect(409);
    expect(res.body.error).toMatch(/already exists/);
  });

  it('returns sessionId and url when claude emits auth URL on stdout', async () => {
    profiles.profileExists.mockReturnValue(false);

    const reqPromise = request(app)
      .post('/claude-profiles/login/start')
      .set('Authorization', auth)
      .send({ name: 'work' });

    await new Promise(resolve => setImmediate(resolve));
    mockChild.stdout.emit('data', 'Open this URL:\nhttps://claude.ai/oauth/authorize?code=xyz\n');

    const res = await reqPromise.expect(200);
    expect(res.body.sessionId).toBeTruthy();
    expect(res.body.url).toBe('https://claude.ai/oauth/authorize?code=xyz');
  });

  it('returns sessionId and url when claude emits auth URL on stderr', async () => {
    profiles.profileExists.mockReturnValue(false);

    const reqPromise = request(app)
      .post('/claude-profiles/login/start')
      .set('Authorization', auth)
      .send({ name: 'work' });

    await new Promise(resolve => setImmediate(resolve));
    mockChild.stderr.emit('data', 'https://claude.ai/oauth/authorize?code=abc\n');

    const res = await reqPromise.expect(200);
    expect(res.body.url).toBe('https://claude.ai/oauth/authorize?code=abc');
  });

  it('returns 500 when claude exits before emitting URL', async () => {
    profiles.profileExists.mockReturnValue(false);

    const reqPromise = request(app)
      .post('/claude-profiles/login/start')
      .set('Authorization', auth)
      .send({ name: 'work' });

    await new Promise(resolve => setImmediate(resolve));
    mockChild.emit('exit', 1);

    const res = await reqPromise.expect(500);
    expect(res.body.error).toMatch(/exited/);
  });
});

describe('POST /claude-profiles/login/complete', () => {
  afterEach(() => { jest.resetAllMocks(); pendingLogins.clear(); });

  it('returns 401 without auth', async () => {
    await request(app)
      .post('/claude-profiles/login/complete')
      .send({ sessionId: 'abc', code: '123' })
      .expect(401);
  });

  it('returns 400 when sessionId or code is missing', async () => {
    await request(app)
      .post('/claude-profiles/login/complete')
      .set('Authorization', auth)
      .send({ sessionId: 'abc' })
      .expect(400);
  });

  it('returns 404 when sessionId not found', async () => {
    const res = await request(app)
      .post('/claude-profiles/login/complete')
      .set('Authorization', auth)
      .send({ sessionId: 'unknown', code: '123' })
      .expect(404);
    expect(res.body.error).toMatch(/not found/);
  });

  it('writes code to stdin, saves profile, and returns ok on exit 0', async () => {
    const mockChild = new EventEmitter();
    mockChild.stdin = { write: jest.fn() };
    mockChild.kill = jest.fn();
    pendingLogins.set('test-id', {
      child: mockChild,
      name: 'work',
      expireTimer: setTimeout(() => {}, 99999),
    });
    profiles.saveProfile.mockImplementation(() => {});

    const reqPromise = request(app)
      .post('/claude-profiles/login/complete')
      .set('Authorization', auth)
      .send({ sessionId: 'test-id', code: 'mycode' });

    await new Promise(resolve => setImmediate(resolve));
    expect(mockChild.stdin.write).toHaveBeenCalledWith('mycode\n');
    mockChild.emit('exit', 0);

    const res = await reqPromise.expect(200);
    expect(res.body).toEqual({ ok: true });
    expect(profiles.saveProfile).toHaveBeenCalledWith('work');
  });
});

describe('POST /claude-profiles/:name/activate', () => {
  afterEach(() => jest.resetAllMocks());

  it('returns 401 without auth', async () => {
    await request(app).post('/claude-profiles/work/activate').expect(401);
  });

  it('returns 400 for invalid name', async () => {
    await request(app)
      .post('/claude-profiles/bad..name/activate')
      .set('Authorization', auth)
      .expect(400);
  });

  it('returns 404 when profile does not exist', async () => {
    profiles.profileExists.mockReturnValue(false);
    const res = await request(app)
      .post('/claude-profiles/work/activate')
      .set('Authorization', auth)
      .expect(404);
    expect(res.body.error).toMatch(/not found/);
  });

  it('activates profile and returns ok', async () => {
    profiles.profileExists.mockReturnValue(true);
    profiles.activateProfile.mockImplementation(() => {});
    const res = await request(app)
      .post('/claude-profiles/work/activate')
      .set('Authorization', auth)
      .expect(200);
    expect(res.body).toEqual({ ok: true });
    expect(profiles.activateProfile).toHaveBeenCalledWith('work');
  });
});

describe('DELETE /claude-profiles/:name', () => {
  afterEach(() => jest.resetAllMocks());

  it('returns 401 without auth', async () => {
    await request(app).delete('/claude-profiles/work').expect(401);
  });

  it('returns 400 for invalid name', async () => {
    await request(app)
      .delete('/claude-profiles/bad..name')
      .set('Authorization', auth)
      .expect(400);
  });

  it('deletes profile and returns ok', async () => {
    profiles.deleteProfile.mockImplementation(() => {});
    const res = await request(app)
      .delete('/claude-profiles/work')
      .set('Authorization', auth)
      .expect(200);
    expect(res.body).toEqual({ ok: true });
    expect(profiles.deleteProfile).toHaveBeenCalledWith('work');
  });
});
```

- [ ] **Step 2: Run new tests to confirm they fail**

```bash
cd /workspace/auto-hub/terminal && npx jest src/server.test.js --no-coverage -t "claude-profiles" 2>&1 | tail -8
```
Expected: `Cannot find module` or 404/route not found errors.

- [ ] **Step 3: Add profile routes to `terminal/src/server.js`**

Add at the top of `server.js`, after the existing `require` lines:

```javascript
const { randomUUID } = require('crypto');
const profiles = require('./profiles');
```

Add after the line `const DATA_HOME = '/home/dama';`:

```javascript
const pendingLogins = new Map();
```

Add the five routes after the existing `app.delete('/sessions/:name', ...)` block and before the `wss.on('connection', ...)` block:

```javascript
app.get('/claude-profiles', (req, res) => {
  if (!requireAuth(req, res)) return;
  res.json(profiles.readMeta());
});

app.post('/claude-profiles/login/start', (req, res) => {
  if (!requireAuth(req, res)) return;
  const { name } = req.body ?? {};

  if (!name || !/^[a-zA-Z0-9_-]{1,20}$/.test(name)) {
    return res.status(400).json({ error: 'name must be 1–20 alphanumeric/dash/underscore characters' });
  }
  if (profiles.profileExists(name)) {
    return res.status(409).json({ error: `Profile "${name}" already exists` });
  }

  const sessionId = randomUUID();
  let urlSent = false;
  let buf = '';

  const child = cp.spawn('claude', ['/login'], {
    env: { ...process.env, HOME: DATA_HOME, USER: 'dama', LOGNAME: 'dama', LANG: 'C.utf8', LC_ALL: 'C.utf8' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const urlTimer = setTimeout(() => {
    if (!urlSent) {
      child.kill();
      pendingLogins.delete(sessionId);
      if (!res.headersSent) res.status(500).json({ error: 'Timed out waiting for auth URL from claude' });
    }
  }, 30_000);

  const onData = (chunk) => {
    buf += chunk.toString();
    const match = buf.match(/https:\/\/\S+/);
    if (match && !urlSent) {
      urlSent = true;
      clearTimeout(urlTimer);
      const url = match[0].replace(/['")\].,]+$/, '');
      const expireTimer = setTimeout(() => {
        child.kill();
        pendingLogins.delete(sessionId);
      }, 5 * 60_000);
      pendingLogins.set(sessionId, { child, name, expireTimer });
      if (!res.headersSent) res.json({ sessionId, url });
    }
  };

  child.stdout.on('data', onData);
  child.stderr.on('data', onData);

  child.on('error', (err) => {
    clearTimeout(urlTimer);
    pendingLogins.delete(sessionId);
    if (!res.headersSent) res.status(500).json({ error: `Failed to start claude: ${err.message}` });
  });

  child.on('exit', () => {
    if (!urlSent) {
      clearTimeout(urlTimer);
      pendingLogins.delete(sessionId);
      if (!res.headersSent) res.status(500).json({ error: 'claude exited before providing auth URL' });
    }
  });
});

app.post('/claude-profiles/login/complete', (req, res) => {
  if (!requireAuth(req, res)) return;
  const { sessionId, code } = req.body ?? {};

  if (!sessionId || !code) {
    return res.status(400).json({ error: 'sessionId and code are required' });
  }

  const pending = pendingLogins.get(sessionId);
  if (!pending) {
    return res.status(404).json({ error: 'Login session not found or expired' });
  }

  const { child, name, expireTimer } = pending;
  clearTimeout(expireTimer);
  pendingLogins.delete(sessionId);
  child.stdin.write(code + '\n');

  const completeTimer = setTimeout(() => {
    child.kill();
    if (!res.headersSent) res.status(500).json({ error: 'Timed out waiting for login to complete' });
  }, 2 * 60_000);

  child.on('exit', (exitCode) => {
    clearTimeout(completeTimer);
    if (!res.headersSent) {
      if (exitCode !== 0) {
        return res.status(500).json({ error: `claude login exited with code ${exitCode}` });
      }
      try {
        profiles.saveProfile(name);
        res.json({ ok: true });
      } catch (err) {
        res.status(500).json({ error: `Failed to save profile: ${err.message}` });
      }
    }
  });
});

app.post('/claude-profiles/:name/activate', (req, res) => {
  if (!requireAuth(req, res)) return;
  const { name } = req.params;

  if (!/^[a-zA-Z0-9_-]{1,20}$/.test(name)) {
    return res.status(400).json({ error: 'Invalid profile name' });
  }
  if (!profiles.profileExists(name)) {
    return res.status(404).json({ error: `Profile "${name}" not found` });
  }
  try {
    profiles.activateProfile(name);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/claude-profiles/:name', (req, res) => {
  if (!requireAuth(req, res)) return;
  const { name } = req.params;

  if (!/^[a-zA-Z0-9_-]{1,20}$/.test(name)) {
    return res.status(400).json({ error: 'Invalid profile name' });
  }
  try {
    profiles.deleteProfile(name);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

Change the `module.exports` line at the bottom of `server.js` from:
```javascript
module.exports = { app, server, isValidCwd };
```
To:
```javascript
module.exports = { app, server, isValidCwd, pendingLogins };
```

Add bootstrap call just before the `const PORT = 7681;` line at the bottom:
```javascript
if (require.main === module) {
  profiles.bootstrapActiveProfile();
}
```

Note: wrapping in `require.main === module` prevents bootstrap from running during tests.

- [ ] **Step 4: Run all terminal service tests**

```bash
cd /workspace/auto-hub/terminal && npx jest --no-coverage 2>&1 | tail -10
```
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
cd /workspace/auto-hub && git add terminal/src/server.js terminal/src/server.test.js
git commit -m "feat(terminal): add Claude Code profile OAuth routes"
```

---

### Task 3: NestJS backend proxy

**Files:**
- Modify: `backend/src/terminal/terminal.controller.ts`
- Modify: `backend/src/terminal/terminal.controller.spec.ts`

**Interfaces:**
- Consumes: terminal service routes from Task 2 at `http://terminal:7681`
- Produces NestJS endpoints under `/api/terminal/claude-profiles/…`

- [ ] **Step 1: Add proxy tests to `terminal.controller.spec.ts`**

Append at the end of the `describe('TerminalController', ...)` block:

```typescript
  describe('getClaudeProfiles', () => {
    afterEach(() => jest.resetAllMocks());

    it('proxies to terminal service forwarding auth header', async () => {
      const mockData = { active: 'work', profiles: [{ name: 'work', addedAt: '2026-01-01' }] };
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => mockData,
      } as unknown as Response);

      const result = await controller.getClaudeProfiles('Bearer test-token');

      expect(global.fetch).toHaveBeenCalledWith('http://terminal:7681/claude-profiles', {
        headers: { authorization: 'Bearer test-token' },
      });
      expect(result).toEqual(mockData);
    });

    it('throws 503 when terminal service is unreachable', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
      await expect(controller.getClaudeProfiles('Bearer t')).rejects.toThrow(HttpException);
    });
  });

  describe('startClaudeLogin', () => {
    afterEach(() => jest.resetAllMocks());

    it('proxies POST with body and auth', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ sessionId: 'abc', url: 'https://claude.ai/oauth' }),
      } as unknown as Response);

      const result = await controller.startClaudeLogin({ name: 'work' }, 'Bearer t');

      expect(global.fetch).toHaveBeenCalledWith('http://terminal:7681/claude-profiles/login/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer t' },
        body: JSON.stringify({ name: 'work' }),
      });
      expect(result).toEqual({ sessionId: 'abc', url: 'https://claude.ai/oauth' });
    });

    it('throws 503 when terminal service is unreachable', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
      await expect(controller.startClaudeLogin({ name: 'x' }, 'Bearer t')).rejects.toThrow(HttpException);
    });
  });

  describe('completeClaudeLogin', () => {
    afterEach(() => jest.resetAllMocks());

    it('proxies POST with body and auth', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true }),
      } as unknown as Response);

      const result = await controller.completeClaudeLogin({ sessionId: 'abc', code: '123' }, 'Bearer t');

      expect(global.fetch).toHaveBeenCalledWith('http://terminal:7681/claude-profiles/login/complete', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer t' },
        body: JSON.stringify({ sessionId: 'abc', code: '123' }),
      });
      expect(result).toEqual({ ok: true });
    });

    it('throws 503 when terminal service is unreachable', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
      await expect(
        controller.completeClaudeLogin({ sessionId: 'x', code: 'y' }, 'Bearer t'),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('activateClaudeProfile', () => {
    afterEach(() => jest.resetAllMocks());

    it('proxies POST to activate endpoint with auth', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true }),
      } as unknown as Response);

      const result = await controller.activateClaudeProfile('work', 'Bearer t');

      expect(global.fetch).toHaveBeenCalledWith('http://terminal:7681/claude-profiles/work/activate', {
        method: 'POST',
        headers: { authorization: 'Bearer t' },
      });
      expect(result).toEqual({ ok: true });
    });

    it('throws 503 when terminal service is unreachable', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
      await expect(controller.activateClaudeProfile('work', 'Bearer t')).rejects.toThrow(HttpException);
    });
  });

  describe('deleteClaudeProfile', () => {
    afterEach(() => jest.resetAllMocks());

    it('proxies DELETE with auth header', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true }),
      } as unknown as Response);

      const result = await controller.deleteClaudeProfile('work', 'Bearer t');

      expect(global.fetch).toHaveBeenCalledWith('http://terminal:7681/claude-profiles/work', {
        method: 'DELETE',
        headers: { authorization: 'Bearer t' },
      });
      expect(result).toEqual({ ok: true });
    });

    it('throws 503 when terminal service is unreachable', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
      await expect(controller.deleteClaudeProfile('work', 'Bearer t')).rejects.toThrow(HttpException);
    });
  });
```

- [ ] **Step 2: Run backend tests to confirm they fail**

```bash
cd /workspace/auto-hub/backend && npx jest src/terminal/terminal.controller.spec.ts --no-coverage 2>&1 | tail -8
```
Expected: `controller.getClaudeProfiles is not a function` or similar.

- [ ] **Step 3: Add proxy methods to `terminal.controller.ts`**

Add these interfaces before the `@Controller('terminal')` decorator:

```typescript
interface ClaudeProfilesMeta {
  active: string | null;
  profiles: { name: string; addedAt: string }[];
}

interface StartLoginBody {
  name: string;
}

interface CompleteLoginBody {
  sessionId: string;
  code: string;
}
```

Add these five methods inside `TerminalController`, **before** the `@Get('sessions')` method (so literal routes are registered before parameterized ones):

```typescript
  @Get('claude-profiles')
  async getClaudeProfiles(@Headers('authorization') auth: string): Promise<ClaudeProfilesMeta> {
    let res: Response;
    try {
      res = await fetch(`${TERMINAL_SERVICE}/claude-profiles`, {
        headers: { authorization: auth ?? '' },
      });
    } catch {
      throw new HttpException('Terminal service unavailable', HttpStatus.SERVICE_UNAVAILABLE);
    }
    if (!res.ok) throw new HttpException(await res.text(), res.status);
    return res.json() as Promise<ClaudeProfilesMeta>;
  }

  @Post('claude-profiles/login/start')
  async startClaudeLogin(
    @Body() body: StartLoginBody,
    @Headers('authorization') auth: string,
  ): Promise<{ sessionId: string; url: string }> {
    let res: Response;
    try {
      res = await fetch(`${TERMINAL_SERVICE}/claude-profiles/login/start`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: auth ?? '' },
        body: JSON.stringify(body),
      });
    } catch {
      throw new HttpException('Terminal service unavailable', HttpStatus.SERVICE_UNAVAILABLE);
    }
    if (!res.ok) throw new HttpException(await res.json() as object, res.status);
    return res.json() as Promise<{ sessionId: string; url: string }>;
  }

  @Post('claude-profiles/login/complete')
  async completeClaudeLogin(
    @Body() body: CompleteLoginBody,
    @Headers('authorization') auth: string,
  ): Promise<{ ok: boolean }> {
    let res: Response;
    try {
      res = await fetch(`${TERMINAL_SERVICE}/claude-profiles/login/complete`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: auth ?? '' },
        body: JSON.stringify(body),
      });
    } catch {
      throw new HttpException('Terminal service unavailable', HttpStatus.SERVICE_UNAVAILABLE);
    }
    if (!res.ok) throw new HttpException(await res.json() as object, res.status);
    return res.json() as Promise<{ ok: boolean }>;
  }

  @Post('claude-profiles/:name/activate')
  async activateClaudeProfile(
    @Param('name') name: string,
    @Headers('authorization') auth: string,
  ): Promise<{ ok: boolean }> {
    let res: Response;
    try {
      res = await fetch(`${TERMINAL_SERVICE}/claude-profiles/${encodeURIComponent(name)}/activate`, {
        method: 'POST',
        headers: { authorization: auth ?? '' },
      });
    } catch {
      throw new HttpException('Terminal service unavailable', HttpStatus.SERVICE_UNAVAILABLE);
    }
    if (!res.ok) throw new HttpException(await res.json() as object, res.status);
    return res.json() as Promise<{ ok: boolean }>;
  }

  @Delete('claude-profiles/:name')
  async deleteClaudeProfile(
    @Param('name') name: string,
    @Headers('authorization') auth: string,
  ): Promise<{ ok: boolean }> {
    let res: Response;
    try {
      res = await fetch(`${TERMINAL_SERVICE}/claude-profiles/${encodeURIComponent(name)}`, {
        method: 'DELETE',
        headers: { authorization: auth ?? '' },
      });
    } catch {
      throw new HttpException('Terminal service unavailable', HttpStatus.SERVICE_UNAVAILABLE);
    }
    if (!res.ok) throw new HttpException(await res.text(), res.status);
    return res.json() as Promise<{ ok: boolean }>;
  }
```

- [ ] **Step 4: Run all backend controller tests**

```bash
cd /workspace/auto-hub/backend && npx jest src/terminal/terminal.controller.spec.ts --no-coverage 2>&1 | tail -8
```
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
cd /workspace/auto-hub && git add backend/src/terminal/terminal.controller.ts backend/src/terminal/terminal.controller.spec.ts
git commit -m "feat(backend): proxy Claude Code profile endpoints to terminal service"
```

---

### Task 4: Frontend — `useClaudeProfiles` hook

**Files:**
- Create: `frontend/src/lib/hooks/useClaudeProfiles.ts`
- Create: `frontend/src/lib/hooks/useClaudeProfiles.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  interface ClaudeProfile { name: string; addedAt: string }
  interface ClaudeProfilesState { active: string | null; profiles: ClaudeProfile[] }
  function useClaudeProfiles(): {
    state: ClaudeProfilesState
    loading: boolean
    error: string | null
    activate: (name: string) => Promise<void>
    startLogin: (name: string) => Promise<{ sessionId: string; url: string }>
    completeLogin: (sessionId: string, code: string) => Promise<void>
    removeProfile: (name: string) => Promise<void>
    refresh: () => Promise<void>
  }
  ```

- [ ] **Step 1: Write failing test**

Create `frontend/src/lib/hooks/useClaudeProfiles.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useClaudeProfiles } from './useClaudeProfiles'
import api from '@/lib/api'

vi.mock('@/lib/api')

const mockApi = api as unknown as {
  get: ReturnType<typeof vi.fn>
  post: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
}

const PROFILES_DATA = {
  active: 'work',
  profiles: [
    { name: 'work', addedAt: '2026-01-01T00:00:00.000Z' },
    { name: 'personal', addedAt: '2026-01-02T00:00:00.000Z' },
  ],
}

describe('useClaudeProfiles', () => {
  beforeEach(() => {
    mockApi.get = vi.fn()
    mockApi.post = vi.fn()
    mockApi.delete = vi.fn()
  })

  it('fetches profiles on mount and sets state', async () => {
    mockApi.get.mockResolvedValue({ data: PROFILES_DATA })
    const { result } = renderHook(() => useClaudeProfiles())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.state.active).toBe('work')
    expect(result.current.state.profiles).toHaveLength(2)
    expect(mockApi.get).toHaveBeenCalledWith('/api/terminal/claude-profiles')
  })

  it('sets error when fetch fails', async () => {
    mockApi.get.mockRejectedValue(new Error('Network error'))
    const { result } = renderHook(() => useClaudeProfiles())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBeTruthy()
  })

  it('activate calls POST and optimistically updates active', async () => {
    mockApi.get.mockResolvedValue({ data: PROFILES_DATA })
    mockApi.post.mockResolvedValue({ data: { ok: true } })
    const { result } = renderHook(() => useClaudeProfiles())
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => { await result.current.activate('personal') })
    expect(mockApi.post).toHaveBeenCalledWith('/api/terminal/claude-profiles/personal/activate')
    expect(result.current.state.active).toBe('personal')
  })

  it('startLogin returns sessionId and url', async () => {
    mockApi.get.mockResolvedValue({ data: { active: null, profiles: [] } })
    mockApi.post.mockResolvedValue({ data: { sessionId: 'abc', url: 'https://claude.ai/oauth' } })
    const { result } = renderHook(() => useClaudeProfiles())
    await waitFor(() => expect(result.current.loading).toBe(false))
    let loginData: { sessionId: string; url: string } | undefined
    await act(async () => { loginData = await result.current.startLogin('work') })
    expect(mockApi.post).toHaveBeenCalledWith('/api/terminal/claude-profiles/login/start', { name: 'work' })
    expect(loginData?.sessionId).toBe('abc')
    expect(loginData?.url).toBe('https://claude.ai/oauth')
  })

  it('completeLogin calls POST and refreshes state', async () => {
    mockApi.get.mockResolvedValue({ data: PROFILES_DATA })
    mockApi.post.mockResolvedValue({ data: { ok: true } })
    const { result } = renderHook(() => useClaudeProfiles())
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => { await result.current.completeLogin('abc', 'mycode') })
    expect(mockApi.post).toHaveBeenCalledWith('/api/terminal/claude-profiles/login/complete', {
      sessionId: 'abc',
      code: 'mycode',
    })
    expect(mockApi.get).toHaveBeenCalledTimes(2) // initial + refresh
  })

  it('removeProfile calls DELETE and removes from state', async () => {
    mockApi.get.mockResolvedValue({ data: PROFILES_DATA })
    mockApi.delete = vi.fn().mockResolvedValue({ data: { ok: true } })
    const { result } = renderHook(() => useClaudeProfiles())
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => { await result.current.removeProfile('personal') })
    expect(mockApi.delete).toHaveBeenCalledWith('/api/terminal/claude-profiles/personal')
    expect(result.current.state.profiles).toHaveLength(1)
    expect(result.current.state.profiles[0].name).toBe('work')
  })

  it('removeProfile clears active when the active profile is removed', async () => {
    mockApi.get.mockResolvedValue({ data: PROFILES_DATA })
    mockApi.delete = vi.fn().mockResolvedValue({ data: { ok: true } })
    const { result } = renderHook(() => useClaudeProfiles())
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => { await result.current.removeProfile('work') })
    expect(result.current.state.active).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd /workspace/auto-hub/frontend && npx vitest run src/lib/hooks/useClaudeProfiles.test.ts 2>&1 | tail -5
```
Expected: `Cannot find module './useClaudeProfiles'`

- [ ] **Step 3: Implement `useClaudeProfiles.ts`**

Create `frontend/src/lib/hooks/useClaudeProfiles.ts`:

```typescript
'use client'
import { useState, useEffect, useCallback } from 'react'
import api from '@/lib/api'

export interface ClaudeProfile {
  name: string
  addedAt: string
}

export interface ClaudeProfilesState {
  active: string | null
  profiles: ClaudeProfile[]
}

export function useClaudeProfiles() {
  const [state, setState] = useState<ClaudeProfilesState>({ active: null, profiles: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const res = await api.get<ClaudeProfilesState>('/api/terminal/claude-profiles')
      setState(res.data)
      setError(null)
    } catch {
      setError('Failed to load profiles')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const activate = useCallback(async (name: string) => {
    await api.post(`/api/terminal/claude-profiles/${encodeURIComponent(name)}/activate`)
    setState(s => ({ ...s, active: name }))
  }, [])

  const startLogin = useCallback(async (name: string) => {
    const res = await api.post<{ sessionId: string; url: string }>(
      '/api/terminal/claude-profiles/login/start',
      { name },
    )
    return res.data
  }, [])

  const completeLogin = useCallback(async (sessionId: string, code: string) => {
    await api.post('/api/terminal/claude-profiles/login/complete', { sessionId, code })
    await refresh()
  }, [refresh])

  const removeProfile = useCallback(async (name: string) => {
    await api.delete(`/api/terminal/claude-profiles/${encodeURIComponent(name)}`)
    setState(s => ({
      active: s.active === name ? null : s.active,
      profiles: s.profiles.filter(p => p.name !== name),
    }))
  }, [])

  return { state, loading, error, activate, startLogin, completeLogin, removeProfile, refresh }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd /workspace/auto-hub/frontend && npx vitest run src/lib/hooks/useClaudeProfiles.test.ts 2>&1 | tail -5
```
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
cd /workspace/auto-hub && git add frontend/src/lib/hooks/useClaudeProfiles.ts frontend/src/lib/hooks/useClaudeProfiles.test.ts
git commit -m "feat(frontend): add useClaudeProfiles hook"
```

---

### Task 5: Frontend — `AddAccountModal` component

**Files:**
- Create: `frontend/src/app/(app)/terminal/components/AddAccountModal.tsx`
- Create: `frontend/src/app/(app)/terminal/components/AddAccountModal.test.tsx`

**Interfaces:**
- Consumes: `startLogin` and `completeLogin` function signatures from Task 4
- Produces: `<AddAccountModal onClose onSuccess startLogin completeLogin />`

- [ ] **Step 1: Write failing tests**

Create `frontend/src/app/(app)/terminal/components/AddAccountModal.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AddAccountModal } from './AddAccountModal'

describe('AddAccountModal', () => {
  const startLogin = vi.fn()
  const completeLogin = vi.fn()
  const onClose = vi.fn()
  const onSuccess = vi.fn()

  beforeEach(() => vi.clearAllMocks())

  it('shows name input and disabled Get link button on first step', () => {
    render(<AddAccountModal onClose={onClose} onSuccess={onSuccess} startLogin={startLogin} completeLogin={completeLogin} />)
    expect(screen.getByPlaceholderText('work')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /get link/i })).toBeDisabled()
  })

  it('enables Get link button when name is valid', () => {
    render(<AddAccountModal onClose={onClose} onSuccess={onSuccess} startLogin={startLogin} completeLogin={completeLogin} />)
    fireEvent.change(screen.getByPlaceholderText('work'), { target: { value: 'mywork' } })
    expect(screen.getByRole('button', { name: /get link/i })).not.toBeDisabled()
  })

  it('keeps Get link disabled for names with spaces or special chars', () => {
    render(<AddAccountModal onClose={onClose} onSuccess={onSuccess} startLogin={startLogin} completeLogin={completeLogin} />)
    fireEvent.change(screen.getByPlaceholderText('work'), { target: { value: 'bad name!' } })
    expect(screen.getByRole('button', { name: /get link/i })).toBeDisabled()
  })

  it('calls startLogin and shows URL in step 2', async () => {
    startLogin.mockResolvedValue({ sessionId: 'abc', url: 'https://claude.ai/oauth?test=1' })
    render(<AddAccountModal onClose={onClose} onSuccess={onSuccess} startLogin={startLogin} completeLogin={completeLogin} />)
    fireEvent.change(screen.getByPlaceholderText('work'), { target: { value: 'mywork' } })
    fireEvent.click(screen.getByRole('button', { name: /get link/i }))
    await waitFor(() => expect(screen.getByDisplayValue('https://claude.ai/oauth?test=1')).toBeInTheDocument())
    expect(startLogin).toHaveBeenCalledWith('mywork')
  })

  it('shows code input after clicking authorized button', async () => {
    startLogin.mockResolvedValue({ sessionId: 'abc', url: 'https://claude.ai/oauth' })
    render(<AddAccountModal onClose={onClose} onSuccess={onSuccess} startLogin={startLogin} completeLogin={completeLogin} />)
    fireEvent.change(screen.getByPlaceholderText('work'), { target: { value: 'mywork' } })
    fireEvent.click(screen.getByRole('button', { name: /get link/i }))
    await waitFor(() => screen.getByDisplayValue('https://claude.ai/oauth'))
    fireEvent.click(screen.getByRole('button', { name: /paste code/i }))
    expect(screen.getByPlaceholderText(/paste code here/i)).toBeInTheDocument()
  })

  it('calls completeLogin and onSuccess after pasting code and clicking Verify', async () => {
    startLogin.mockResolvedValue({ sessionId: 'abc', url: 'https://claude.ai/oauth' })
    completeLogin.mockResolvedValue(undefined)
    render(<AddAccountModal onClose={onClose} onSuccess={onSuccess} startLogin={startLogin} completeLogin={completeLogin} />)
    fireEvent.change(screen.getByPlaceholderText('work'), { target: { value: 'mywork' } })
    fireEvent.click(screen.getByRole('button', { name: /get link/i }))
    await waitFor(() => screen.getByDisplayValue('https://claude.ai/oauth'))
    fireEvent.click(screen.getByRole('button', { name: /paste code/i }))
    fireEvent.change(screen.getByPlaceholderText(/paste code here/i), { target: { value: 'auth-code-123' } })
    fireEvent.click(screen.getByRole('button', { name: /^verify$/i }))
    await waitFor(() => expect(completeLogin).toHaveBeenCalledWith('abc', 'auth-code-123'))
    await waitFor(() => expect(onSuccess).toHaveBeenCalled())
  })

  it('shows error message when startLogin fails', async () => {
    startLogin.mockRejectedValue({ response: { data: { message: 'Profile already exists' } } })
    render(<AddAccountModal onClose={onClose} onSuccess={onSuccess} startLogin={startLogin} completeLogin={completeLogin} />)
    fireEvent.change(screen.getByPlaceholderText('work'), { target: { value: 'mywork' } })
    fireEvent.click(screen.getByRole('button', { name: /get link/i }))
    await waitFor(() => expect(screen.getByText('Profile already exists')).toBeInTheDocument())
  })

  it('calls onClose when X button is clicked', () => {
    render(<AddAccountModal onClose={onClose} onSuccess={onSuccess} startLogin={startLogin} completeLogin={completeLogin} />)
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /workspace/auto-hub/frontend && npx vitest run src/app/\(app\)/terminal/components/AddAccountModal.test.tsx 2>&1 | tail -5
```
Expected: `Cannot find module './AddAccountModal'`

- [ ] **Step 3: Implement `AddAccountModal.tsx`**

Create `frontend/src/app/(app)/terminal/components/AddAccountModal.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { X, Copy, Check, Loader2 } from 'lucide-react'

interface AddAccountModalProps {
  onClose: () => void
  onSuccess: () => void
  startLogin: (name: string) => Promise<{ sessionId: string; url: string }>
  completeLogin: (sessionId: string, code: string) => Promise<void>
}

type ModalStep = 'name' | 'url' | 'code'

export function AddAccountModal({ onClose, onSuccess, startLogin, completeLogin }: AddAccountModalProps) {
  const [step, setStep] = useState<ModalStep>('name')
  const [name, setName] = useState('')
  const [sessionId, setSessionId] = useState('')
  const [url, setUrl] = useState('')
  const [code, setCode] = useState('')
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const nameValid = /^[a-zA-Z0-9_-]{1,20}$/.test(name)

  const handleGetLink = async () => {
    if (!nameValid) return
    setBusy(true)
    setError(null)
    try {
      const result = await startLogin(name)
      setSessionId(result.sessionId)
      setUrl(result.url)
      setStep('url')
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Failed to start login'
      setError(msg)
    } finally {
      setBusy(false)
    }
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const handleVerify = async () => {
    if (!code.trim()) return
    setBusy(true)
    setError(null)
    try {
      await completeLogin(sessionId, code.trim())
      onSuccess()
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Verification failed'
      setError(msg)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg w-full max-w-sm">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#2a2a2a]">
          <h3 className="text-white text-sm font-semibold">Add Claude Account</h3>
          <button
            aria-label="close"
            onClick={onClose}
            className="text-[#6b7280] hover:text-white transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-4 flex flex-col gap-4">
          {step === 'name' && (
            <>
              <div>
                <label className="block text-[#9ca3af] text-xs mb-1.5">Profile name</label>
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="work"
                  className="w-full bg-[#0d0d0d] border border-[#2a2a2a] rounded px-3 py-2 text-white text-sm font-mono placeholder-[#4b5563] focus:outline-none focus:border-[#10b981]"
                />
                <p className="text-[#4b5563] text-[10px] mt-1">Letters, numbers, dash, underscore. Max 20 chars.</p>
              </div>
              {error && <p className="text-[#ef4444] text-xs">{error}</p>}
              <button
                disabled={!nameValid || busy}
                onClick={() => { void handleGetLink() }}
                className="flex items-center justify-center gap-2 px-4 py-2 rounded bg-[#10b981] text-white text-sm font-medium hover:bg-[#059669] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {busy ? <><Loader2 size={14} className="animate-spin" /> Getting link…</> : 'Get link'}
              </button>
            </>
          )}

          {step === 'url' && (
            <>
              <p className="text-[#9ca3af] text-xs leading-relaxed">
                Open this link in a browser where you&apos;re logged into Claude, then paste the code below.
              </p>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={url}
                  className="flex-1 min-w-0 bg-[#0d0d0d] border border-[#2a2a2a] rounded px-3 py-2 text-[#9ca3af] text-xs font-mono focus:outline-none"
                />
                <button
                  onClick={() => { void handleCopy() }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded bg-[#2a2a2a] text-[#9ca3af] hover:text-white text-xs transition-colors shrink-0"
                >
                  {copied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
                </button>
              </div>
              <button
                onClick={() => setStep('code')}
                className="px-4 py-2 rounded bg-[#3b82f6] text-white text-sm font-medium hover:bg-[#2563eb] transition-colors"
              >
                I&apos;ve authorized — paste code
              </button>
            </>
          )}

          {step === 'code' && (
            <>
              <div>
                <label className="block text-[#9ca3af] text-xs mb-1.5">Code from browser</label>
                <input
                  value={code}
                  onChange={e => setCode(e.target.value)}
                  placeholder="Paste code here"
                  className="w-full bg-[#0d0d0d] border border-[#2a2a2a] rounded px-3 py-2 text-white text-sm font-mono placeholder-[#4b5563] focus:outline-none focus:border-[#10b981]"
                />
              </div>
              {error && <p className="text-[#ef4444] text-xs">{error}</p>}
              <button
                disabled={!code.trim() || busy}
                onClick={() => { void handleVerify() }}
                className="flex items-center justify-center gap-2 px-4 py-2 rounded bg-[#10b981] text-white text-sm font-medium hover:bg-[#059669] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {busy ? <><Loader2 size={14} className="animate-spin" /> Verifying…</> : 'Verify'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd /workspace/auto-hub/frontend && npx vitest run src/app/\(app\)/terminal/components/AddAccountModal.test.tsx 2>&1 | tail -5
```
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
cd /workspace/auto-hub && git add "frontend/src/app/(app)/terminal/components/AddAccountModal.tsx" "frontend/src/app/(app)/terminal/components/AddAccountModal.test.tsx"
git commit -m "feat(frontend): add AddAccountModal for Claude Code OAuth login"
```

---

### Task 6: Frontend — `ProfileButton` component

**Files:**
- Create: `frontend/src/app/(app)/terminal/components/ProfileButton.tsx`

**Interfaces:**
- Consumes: `useClaudeProfiles` (Task 4), `AddAccountModal` (Task 5)
- Produces: `<ProfileButton />` — self-contained, no props; manages own dropdown + modal state

No dedicated test file for this component — behaviour is covered end-to-end by the SessionManager and TerminalBreadcrumb tests in Task 7. The component itself is a thin orchestration layer.

- [ ] **Step 1: Create `ProfileButton.tsx`**

```tsx
'use client'
import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Check, Plus, UserCircle2 } from 'lucide-react'
import { useClaudeProfiles } from '@/lib/hooks/useClaudeProfiles'
import { AddAccountModal } from './AddAccountModal'

export function ProfileButton() {
  const { state, activate, startLogin, completeLogin, refresh } = useClaudeProfiles()
  const [open, setOpen] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <>
      <div ref={ref} className="relative">
        <button
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-1 px-2 py-1.5 rounded text-xs text-[#6b7280] hover:text-[#e5e7eb] hover:bg-[#2a2a2a] transition-colors font-mono"
        >
          <UserCircle2 size={12} className="shrink-0" />
          <span className="max-w-[80px] truncate">{state.active ?? 'no account'}</span>
          <ChevronDown size={10} className="shrink-0" />
        </button>

        {open && (
          <div className="absolute right-0 top-full mt-1 w-44 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg shadow-xl z-50 py-1">
            {state.profiles.map(p => (
              <button
                key={p.name}
                onClick={() => { void activate(p.name); setOpen(false) }}
                className="flex items-center gap-2 w-full px-3 py-2 text-xs text-left hover:bg-[#2a2a2a] transition-colors"
              >
                <span className="w-3 shrink-0">
                  {state.active === p.name && <Check size={11} className="text-[#10b981]" />}
                </span>
                <span className="text-[#e5e7eb] font-mono truncate">{p.name}</span>
              </button>
            ))}
            {state.profiles.length > 0 && (
              <div className="mx-2 my-1 border-t border-[#2a2a2a]" />
            )}
            <button
              onClick={() => { setOpen(false); setShowModal(true) }}
              className="flex items-center gap-2 w-full px-3 py-2 text-xs text-left text-[#10b981] hover:bg-[#10b981]/10 transition-colors"
            >
              <Plus size={11} className="shrink-0 ml-0.5" />
              Add account
            </button>
          </div>
        )}
      </div>

      {showModal && (
        <AddAccountModal
          onClose={() => setShowModal(false)}
          onSuccess={() => { setShowModal(false); void refresh() }}
          startLogin={startLogin}
          completeLogin={completeLogin}
        />
      )}
    </>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /workspace/auto-hub/frontend && npx tsc --noEmit 2>&1 | grep ProfileButton
```
Expected: no output (no errors).

- [ ] **Step 3: Commit**

```bash
cd /workspace/auto-hub && git add "frontend/src/app/(app)/terminal/components/ProfileButton.tsx"
git commit -m "feat(frontend): add ProfileButton dropdown with account switcher"
```

---

### Task 7: Wire up `TerminalBreadcrumb` and `SessionManager`

**Files:**
- Modify: `frontend/src/app/(app)/terminal/components/TerminalBreadcrumb.tsx`
- Modify: `frontend/src/app/(app)/terminal/components/SessionManager.tsx`
- Modify: `frontend/src/app/(app)/terminal/components/SessionManager.test.tsx`

**Interfaces:**
- Consumes: `<ProfileButton />` from Task 6
- No interface changes to existing props

- [ ] **Step 1: Update `SessionManager.test.tsx` to mock `useClaudeProfiles`**

Add this mock at the top of `SessionManager.test.tsx`, after the existing `vi.mock('@/lib/api')` line:

```typescript
vi.mock('@/lib/hooks/useClaudeProfiles', () => ({
  useClaudeProfiles: () => ({
    state: { active: null, profiles: [] },
    loading: false,
    error: null,
    activate: vi.fn(),
    startLogin: vi.fn(),
    completeLogin: vi.fn(),
    removeProfile: vi.fn(),
    refresh: vi.fn(),
  }),
}))
```

- [ ] **Step 2: Run existing SessionManager tests to confirm they still pass before any changes**

```bash
cd /workspace/auto-hub/frontend && npx vitest run src/app/\(app\)/terminal/components/SessionManager.test.tsx 2>&1 | tail -5
```
Expected: all tests pass (the mock is in place but nothing renders `ProfileButton` yet — this is the green baseline).

- [ ] **Step 3: Add `ProfileButton` to `TerminalBreadcrumb`**

In `frontend/src/app/(app)/terminal/components/TerminalBreadcrumb.tsx`, add the import:

```typescript
import { ProfileButton } from './ProfileButton'
```

Change the right side of the breadcrumb `div` — replace:

```tsx
      <button
        onClick={onChangeDir}
        className="text-xs text-[#6b7280] hover:text-[#10b981] active:text-[#10b981] transition-colors shrink-0 ml-3 px-2 py-1.5"
      >
        Change
      </button>
```

With:

```tsx
      <div className="flex items-center gap-1 shrink-0 ml-2">
        <ProfileButton />
        <button
          onClick={onChangeDir}
          className="text-xs text-[#6b7280] hover:text-[#10b981] active:text-[#10b981] transition-colors px-2 py-1.5"
        >
          Change
        </button>
      </div>
```

- [ ] **Step 4: Add `ProfileButton` to `SessionManager`**

In `frontend/src/app/(app)/terminal/components/SessionManager.tsx`, add the import after the existing imports:

```typescript
import { ProfileButton } from './ProfileButton'
```

In the `SessionManager` return, change the header `div` — replace:

```tsx
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
```

With:

```tsx
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#2a2a2a]">
          <h2 className="text-white text-sm font-semibold">Code Terminal</h2>
          <div className="flex items-center gap-2">
            <ProfileButton />
            <button
              onClick={() => setCreating(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-[#10b981]/10 text-[#10b981] text-xs font-medium hover:bg-[#10b981]/20 transition-colors"
            >
              <Plus size={13} />
              New Session
            </button>
          </div>
        </div>
```

- [ ] **Step 5: Run all frontend tests**

```bash
cd /workspace/auto-hub/frontend && npx vitest run 2>&1 | tail -10
```
Expected: all tests pass.

- [ ] **Step 6: TypeScript check**

```bash
cd /workspace/auto-hub/frontend && npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
cd /workspace/auto-hub && git add "frontend/src/app/(app)/terminal/components/TerminalBreadcrumb.tsx" "frontend/src/app/(app)/terminal/components/SessionManager.tsx" "frontend/src/app/(app)/terminal/components/SessionManager.test.tsx"
git commit -m "feat(frontend): wire up ProfileButton to breadcrumb and session manager"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| Store profiles in `~/.claude/profiles/` with `meta.json` | Task 1 |
| `bootstrapActiveProfile` on container start | Task 1 + Task 2 (startup call) |
| `POST /claude-profiles/login/start` — spawn `claude /login`, return URL | Task 2 |
| 30s URL timeout, 5min session expiry | Task 2 |
| `POST /claude-profiles/login/complete` — pipe code, save profile | Task 2 |
| `GET /claude-profiles`, activate, delete routes | Task 2 |
| NestJS proxy for all 5 routes | Task 3 |
| `useClaudeProfiles` hook | Task 4 |
| `AddAccountModal` — 3-step OAuth flow UI | Task 5 |
| `ProfileButton` dropdown | Task 6 |
| Button in `TerminalBreadcrumb` right side | Task 7 |
| Button in `SessionManager` | Task 7 |
| Reboot survivable (host filesystem + bootstrap) | Task 1 + Task 2 |

No gaps found.

**Type consistency check:** `ClaudeProfilesState`, `ClaudeProfile`, `startLogin`, `completeLogin` are defined once in `useClaudeProfiles.ts` and consumed by `ProfileButton` and `AddAccountModal` via props. No drift.

**Placeholder scan:** No TBD/TODO items found.
