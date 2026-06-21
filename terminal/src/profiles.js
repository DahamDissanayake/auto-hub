'use strict';
const fs = require('fs');
const path = require('path');

const DATA_HOME = '/home/dama';
const CLAUDE_DIR = path.join(DATA_HOME, '.claude');
const CREDENTIALS_PATH = path.join(CLAUDE_DIR, '.credentials.json');
const CLAUDE_JSON_PATH = path.join(DATA_HOME, '.claude.json');
const PROFILES_DIR = path.join(CLAUDE_DIR, 'profiles');
const META_PATH = path.join(PROFILES_DIR, 'meta.json');

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

function bootstrapActiveProfile() {
  const meta = readMeta();
  if (!meta.active) return;
  const profilePath = path.join(PROFILES_DIR, `${meta.active}.json`);
  if (!fs.existsSync(profilePath)) return;
  try {
    const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
    const { _oauthAccount, ...creds } = profile;
    fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify(creds), 'utf8');
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
  const profilePath = path.join(PROFILES_DIR, `${name}.json`);
  const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
  const { _oauthAccount, ...creds } = profile;
  fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify(creds), 'utf8');
  if (_oauthAccount) writeClaudeJsonAccount(_oauthAccount);
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
  setProfileEmail,
  activateProfile,
  deleteProfile,
  CREDENTIALS_PATH,
  CLAUDE_JSON_PATH,
  PROFILES_DIR,
  META_PATH,
};
