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
    const { readMeta } = require('./profiles');
    expect(readMeta().active).toBe('work');
    expect(readMeta().profiles).toHaveLength(1);
  });
});

describe('bootstrapActiveProfile', () => {
  it('does nothing when active is null', () => {
    fs.readFileSync.mockReturnValue(EMPTY_META);
    const { bootstrapActiveProfile } = require('./profiles');
    bootstrapActiveProfile();
    expect(fs.copyFileSync).not.toHaveBeenCalled();
  });

  it('does nothing when active profile file does not exist', () => {
    fs.readFileSync.mockReturnValue(META_WITH_WORK);
    fs.existsSync.mockReturnValue(false);
    const { bootstrapActiveProfile } = require('./profiles');
    bootstrapActiveProfile();
    expect(fs.copyFileSync).not.toHaveBeenCalled();
  });

  it('copies profile to credentials when active profile exists', () => {
    fs.readFileSync.mockReturnValue(META_WITH_WORK);
    fs.existsSync.mockReturnValue(true);
    fs.copyFileSync.mockImplementation(() => {});
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
    const { profileExists } = require('./profiles');
    expect(profileExists('work')).toBe(true);
    expect(fs.existsSync).toHaveBeenCalledWith(PROFILES_DIR + '/work.json');
  });

  it('returns false when profile file does not exist', () => {
    fs.existsSync.mockReturnValue(false);
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
    const { deleteProfile } = require('./profiles');
    deleteProfile('ghost');
    expect(fs.unlinkSync).not.toHaveBeenCalled();
  });
});
