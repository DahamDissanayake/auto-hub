jest.mock('./sessions');
jest.mock('./profiles');
process.env.JWT_SECRET = 'test-secret';
process.env.TERMINAL_DIRS = '/workspace/data,/workspace/github';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const cp = require('child_process');

const { app, isValidCwd, pendingLogins } = require('./server');
const sessions = require('./sessions');
const profiles = require('./profiles');
const { EventEmitter } = require('events');

const token = jwt.sign({ sub: 1 }, 'test-secret');
const auth = `Bearer ${token}`;

describe('isValidCwd', () => {
  it('accepts exact dir match', () =>
    expect(isValidCwd('/workspace/data')).toBe(true));

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

describe('GET /sessions', () => {
  afterEach(() => { jest.restoreAllMocks(); jest.resetAllMocks(); });

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
  afterEach(() => { jest.restoreAllMocks(); jest.resetAllMocks(); });

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
  afterEach(() => { jest.restoreAllMocks(); jest.resetAllMocks(); });

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

  it('returns 400 for invalid session name', async () => {
    const res = await request(app)
      .delete('/sessions/bad..name')
      .set('Authorization', auth)
      .expect(400);
    expect(res.body.error).toBe('Invalid session name');
  });

  it('returns 401 without auth', async () => {
    await request(app).delete('/sessions/test').expect(401);
  });
});

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

  afterEach(() => {
    jest.restoreAllMocks();
    for (const session of pendingLogins.values()) {
      clearTimeout(session.expireTimer);
    }
    pendingLogins.clear();
  });

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
  afterEach(() => {
    jest.resetAllMocks();
    for (const session of pendingLogins.values()) {
      clearTimeout(session.expireTimer);
    }
    pendingLogins.clear();
  });

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
