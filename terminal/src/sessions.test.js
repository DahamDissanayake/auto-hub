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
