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
  // Extract owner/repo from GitHub URLs (SSH or HTTPS)
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
  // Use gh when GH_TOKEN is available (works for public + private repos)
  // Otherwise fall back to git clone with HTTPS (public repos only)
  let cmd, cmdArgs;
  if (ghRepo && process.env.GH_TOKEN) {
    cmd = 'gh'; cmdArgs = ['repo', 'clone', ghRepo, targetPath];
  } else {
    const httpsUrl = ghRepo
      ? `https://github.com/${ghRepo}.git`
      : url;
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
