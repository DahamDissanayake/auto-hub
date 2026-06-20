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
