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
const { randomUUID } = require('crypto');
const profiles = require('./profiles');

function getClaudeEmail() {
  try {
    const out = cp.execFileSync('claude', ['auth', 'status'], {
      env: { ...process.env, HOME: DATA_HOME, USER: 'dama', LOGNAME: 'dama', LANG: 'C.utf8', LC_ALL: 'C.utf8' },
      encoding: 'utf8',
      timeout: 10_000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return JSON.parse(out).email ?? null;
  } catch {
    return null;
  }
}

function migrateProfileEmails() {
  const meta = profiles.readMeta();
  const missing = meta.profiles.filter(p => !p.email);
  if (missing.length === 0) return;

  const currentCreds = fs.existsSync(profiles.CREDENTIALS_PATH)
    ? fs.readFileSync(profiles.CREDENTIALS_PATH, 'utf8')
    : null;

  for (const profile of missing) {
    const profilePath = require('path').join(profiles.PROFILES_DIR, `${profile.name}.json`);
    if (!fs.existsSync(profilePath)) continue;
    try {
      // Write only the OAuth tokens (strip _oauthAccount) to avoid confusing claude auth status
      const profileData = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
      const { _oauthAccount: _, ...creds } = profileData;
      fs.writeFileSync(profiles.CREDENTIALS_PATH, JSON.stringify(creds), 'utf8');
      const email = getClaudeEmail();
      if (email) profiles.setProfileEmail(profile.name, email);
    } catch { /* ignore */ }
  }

  if (currentCreds !== null) {
    fs.writeFileSync(profiles.CREDENTIALS_PATH, currentCreds, 'utf8');
  }
}

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
const DATA_HOME = '/home/dama';
const pendingLogins = new Map();

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
  const cloneEnv = { ...process.env, HOME: DATA_HOME, USER: 'dama', LOGNAME: 'dama', LANG: 'C.utf8', LC_ALL: 'C.utf8' };
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
      env: { ...process.env, HOME: DATA_HOME, USER: 'dama', LOGNAME: 'dama', LANG: 'C.utf8', LC_ALL: 'C.utf8' },
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

  if (!/^[a-zA-Z0-9_-]{1,40}$/.test(name)) {
    return res.status(400).json({ error: 'Invalid session name' });
  }

  try {
    cp.execFileSync('tmux', ['kill-session', '-t', name], { stdio: 'ignore' });
  } catch {
    // session may already be dead — not an error
  }

  removeSession(name);
  res.json({ ok: true });
});

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

  const child = cp.spawn('claude', ['auth', 'login'], {
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
        const email = getClaudeEmail();
        let warning = null;
        if (email) {
          const existingMeta = profiles.readMeta();
          const duplicate = existingMeta.profiles.find(p => p.email === email);
          if (duplicate) {
            warning = `This Claude account (${email}) is already saved as "${duplicate.name}". Both profiles will use the same account.`;
          }
        }
        profiles.saveProfile(name, email);
        res.json({ ok: true, ...(warning ? { warning } : {}) });
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
    // Kill running claude processes so they restart with the new credentials on next invocation
    try {
      cp.execFileSync('pkill', ['-x', 'claude'], { stdio: 'ignore' });
    } catch { /* no claude processes running — not an error */ }
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

  if (!sessionName) { ws.close(4400, 'Session name required'); return; }
  if (!/^[a-zA-Z0-9_-]{1,40}$/.test(sessionName)) { ws.close(4400, 'Invalid session name'); return; }

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
        USER: 'dama',
        LOGNAME: 'dama',
        SHELL: '/bin/bash',
        LANG: 'C.utf8',
        LC_ALL: 'C.utf8',
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

if (require.main === module) {
  profiles.bootstrapActiveProfile();
  migrateProfileEmails();
}

const PORT = 7681;
if (require.main === module) {
  server.listen(PORT, () => console.log(`Terminal service listening on :${PORT}`));
}

module.exports = { app, server, isValidCwd, pendingLogins };
