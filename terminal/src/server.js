'use strict';
const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const nodePty = require('node-pty');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET env var is required');
  process.exit(1);
}

const TERMINAL_DIRS = new Set(
  (process.env.TERMINAL_DIRS ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

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

  if (!cwd || !TERMINAL_DIRS.has(cwd)) {
    ws.close(4400, 'Bad cwd');
    return;
  }

  let pty;
  let ptyDead = false;
  try {
    pty = nodePty.spawn('bash', [], {
      name: 'xterm-256color',
      cwd,
      env: { ...process.env, TERM: 'xterm-256color' },
      cols: 80,
      rows: 24,
    });
  } catch {
    ws.close(4500, 'Spawn failed');
    return;
  }

  pty.onData(data => {
    if (ws.readyState === ws.OPEN) ws.send(data);
  });

  pty.onExit(() => {
    ptyDead = true;
    ws.close(1000, 'Process exited');
  });

  ws.on('message', raw => {
    if (ptyDead) return;
    const msg = raw.toString();
    try {
      const parsed = JSON.parse(msg);
      if (parsed.type === 'resize' && parsed.cols && parsed.rows) {
        pty.resize(Number(parsed.cols), Number(parsed.rows));
        return;
      }
    } catch {
      // not JSON — raw terminal input
    }
    pty.write(msg);
  });

  ws.on('close', () => {
    if (!ptyDead) pty.kill();
  });
});

const PORT = 7681;
server.listen(PORT, () => console.log(`Terminal service listening on :${PORT}`));
