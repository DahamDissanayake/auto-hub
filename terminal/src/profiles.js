'use strict';
const fs = require('fs');
const path = require('path');

const DATA_HOME = '/home/dama';
const CLAUDE_DIR = path.join(DATA_HOME, '.claude');
const CREDENTIALS_PATH = path.join(CLAUDE_DIR, '.credentials.json');
const CLAUDE_JSON_PATH = path.join(DATA_HOME, '.claude.json');
const PROFILES_DIR = path.join(CLAUDE_DIR, 'profiles');
const META_PATH = path.join(PROFILES_DIR, 'meta.json');

// Suppress the fs.watch callback when we're the ones writing credentials,
// so we don't loop back and incorrectly update the profile we just activated.
let _credWriteInProgress = false;

function ensureProfilesDir() {
  if (!fs.existsSync(PROFILES_DIR)) fs.mkdirSync(PROFILES_DIR, { recursive: true });
}

function readMeta() {
  try {
    return JSON.parse(fs.readFileSync(META_PATH, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error(`[profiles] Failed to read meta.json: ${err.message}`);
    }
    return { active: null, profiles: [] };
  }
}

function writeMeta(meta) {
  ensureProfilesDir();
  const tmp = META_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(meta, null, 2), 'utf8');
  fs.renameSync(tmp, META_PATH);
}

function readClaudeJson() {
  try {
    return JSON.parse(fs.readFileSync(CLAUDE_JSON_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function writeClaudeJsonAccount(oauthAccount) {
  try {
    const data = readClaudeJson();
    data.oauthAccount = oauthAccount;
    const tmp = CLAUDE_JSON_PATH + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data), 'utf8');
    fs.renameSync(tmp, CLAUDE_JSON_PATH);
  } catch (err) {
    console.error(`[profiles] Failed to update .claude.json: ${err.message}`);
  }
}

// Write credentials while suppressing the watcher so it doesn't mistake our
// own write for a Claude-initiated token refresh.
function _writeCredentials(creds) {
  _credWriteInProgress = true;
  try {
    fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify(creds), 'utf8');
  } finally {
    // fs.watch fires asynchronously; give it 500 ms to arrive before clearing
    // the flag so the debounce inside the watcher has time to see it.
    setTimeout(() => { _credWriteInProgress = false; }, 500);
  }
}

// Sync live credentials from CREDENTIALS_PATH back into the active profile file.
// Called both by the watcher (external Claude token refresh) and before a profile
// switch, so the currently active profile never grows stale.
function updateActiveProfileCredentials() {
  if (!fs.existsSync(CREDENTIALS_PATH)) return;
  const meta = readMeta();
  if (!meta.active) return;
  const profilePath = path.join(PROFILES_DIR, `${meta.active}.json`);
  if (!fs.existsSync(profilePath)) return;
  try {
    const liveCreds = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
    const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
    // Preserve _oauthAccount metadata; only the token fields change on refresh.
    const updated = { ...liveCreds, ...(profile._oauthAccount ? { _oauthAccount: profile._oauthAccount } : {}) };
    const tmp = profilePath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(updated), 'utf8');
    fs.renameSync(tmp, profilePath);
    console.log(`[profiles] Synced refreshed credentials to profile "${meta.active}"`);
  } catch (err) {
    console.error(`[profiles] Failed to sync credentials to active profile: ${err.message}`);
  }
}

// Watch ~/.claude/ for credential file changes made by Claude itself (token
// refreshes) and keep the active profile file in sync automatically.
function setupCredentialWatcher() {
  if (!fs.existsSync(CLAUDE_DIR)) return;
  const credFilename = path.basename(CREDENTIALS_PATH);
  let debounce = null;
  try {
    fs.watch(CLAUDE_DIR, (event, filename) => {
      if (filename !== credFilename) return;
      if (_credWriteInProgress) return;
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        debounce = null;
        updateActiveProfileCredentials();
      }, 500);
    });
    console.log('[profiles] Watching for credential refreshes');
  } catch (err) {
    console.error(`[profiles] Failed to set up credential watcher: ${err.message}`);
  }
}

function bootstrapActiveProfile() {
  const meta = readMeta();
  if (!meta.active) return;
  const profilePath = path.join(PROFILES_DIR, `${meta.active}.json`);
  if (!fs.existsSync(profilePath)) return;
  try {
    const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
    const { _oauthAccount, ...creds } = profile;
    _writeCredentials(creds);
    if (_oauthAccount) writeClaudeJsonAccount(_oauthAccount);
    console.log(`[profiles] Restored active profile: ${meta.active}`);
  } catch (err) {
    console.error(`[profiles] Failed to restore active profile: ${err.message}`);
  }
}

function profileExists(name) {
  return fs.existsSync(path.join(PROFILES_DIR, `${name}.json`));
}

function saveProfile(name, email = null) {
  const creds = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
  const claudeJson = readClaudeJson();
  if (claudeJson.oauthAccount) creds._oauthAccount = claudeJson.oauthAccount;
  ensureProfilesDir();
  fs.writeFileSync(path.join(PROFILES_DIR, `${name}.json`), JSON.stringify(creds), 'utf8');
  const meta = readMeta();
  const existing = meta.profiles.find(p => p.name === name);
  if (!existing) {
    meta.profiles.push({ name, addedAt: new Date().toISOString(), ...(email ? { email } : {}) });
  } else if (email) {
    existing.email = email;
  }
  meta.active = name;
  writeMeta(meta);
}

function setProfileEmail(name, email) {
  const meta = readMeta();
  const profile = meta.profiles.find(p => p.name === name);
  if (profile && email) {
    profile.email = email;
    writeMeta(meta);
  }
}

function activateProfile(name) {
  const meta = readMeta();

  // Snapshot live credentials back into the currently active profile before
  // switching. This ensures that when we later return to that profile, we
  // restore the freshest tokens rather than a stale snapshot — avoiding 401s
  // caused by expired or already-rotated refresh tokens.
  if (meta.active && meta.active !== name) {
    updateActiveProfileCredentials();
  }

  const profilePath = path.join(PROFILES_DIR, `${name}.json`);
  const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
  const { _oauthAccount, ...creds } = profile;
  _writeCredentials(creds);
  if (_oauthAccount) writeClaudeJsonAccount(_oauthAccount);
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
  setProfileEmail,
  activateProfile,
  deleteProfile,
  updateActiveProfileCredentials,
  setupCredentialWatcher,
  CREDENTIALS_PATH,
  CLAUDE_JSON_PATH,
  PROFILES_DIR,
  META_PATH,
};
