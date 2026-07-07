'use strict';
const fs = require('fs');
const path = require('path');
const https = require('https');

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
    setTimeout(() => {
      _credWriteInProgress = false;
      // Claude may have refreshed its token during the lock window (common when
      // activating a profile with an expired access token). The watcher skips
      // events while _credWriteInProgress is true, so we do one final sync here
      // to capture any refresh that slipped through.
      setTimeout(updateActiveProfileCredentials, 3_000);
    }, 500);
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

  // Polling fallback: fs.watch can miss events on Docker bind mounts.
  // Sync every 30 s to ensure no token refresh is ever permanently lost.
  let _lastCredMtime = 0;
  setInterval(() => {
    if (_credWriteInProgress) return;
    try {
      const mtime = fs.statSync(CREDENTIALS_PATH).mtimeMs;
      if (mtime !== _lastCredMtime) {
        _lastCredMtime = mtime;
        updateActiveProfileCredentials();
      }
    } catch { /* credentials file may not exist yet */ }
  }, 30_000);
}

function bootstrapActiveProfile() {
  const meta = readMeta();
  if (!meta.active) return;
  const profilePath = path.join(PROFILES_DIR, `${meta.active}.json`);
  if (!fs.existsSync(profilePath)) return;
  try {
    const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
    const { _oauthAccount, ...profileCreds } = profile;

    // If the live credentials file has a newer token than what's stored in the
    // profile (e.g. Claude refreshed right before the server restarted and the
    // watcher missed it), preserve the live tokens rather than overwriting them
    // with the stale snapshot from the profile file.
    if (fs.existsSync(CREDENTIALS_PATH)) {
      try {
        const liveCreds = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
        const liveExpiry = liveCreds.claudeAiOauth?.expiresAt ?? 0;
        const profileExpiry = profileCreds.claudeAiOauth?.expiresAt ?? 0;
        if (liveExpiry > profileExpiry) {
          const merged = { ...liveCreds, ...(_oauthAccount ? { _oauthAccount } : {}) };
          const tmp = profilePath + '.tmp';
          fs.writeFileSync(tmp, JSON.stringify(merged), 'utf8');
          fs.renameSync(tmp, profilePath);
          console.log(`[profiles] Bootstrap: live credentials are fresher, synced to "${meta.active}" (skipped overwrite)`);
          if (_oauthAccount) writeClaudeJsonAccount(_oauthAccount);
          return;
        }
      } catch { /* ignore – fall through to normal restore */ }
    }

    _writeCredentials(profileCreds);
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

async function activateProfile(name) {
  const meta = readMeta();

  // Snapshot live credentials back into the currently active profile before
  // switching. This ensures that when we later return to that profile, we
  // restore the freshest tokens rather than a stale snapshot — avoiding 401s
  // caused by expired or already-rotated refresh tokens.
  if (meta.active && meta.active !== name) {
    updateActiveProfileCredentials();
  }

  // Proactively refresh the target profile's tokens before activating.
  // refreshProfileTokens is a no-op when tokens have > 30 min remaining,
  // but it rescues profiles whose tokens expired while inactive (missed
  // proactive-refresh cycle, server restart, etc.).  The profile file is
  // written atomically by the refresh call, so the fs.readFileSync below
  // always picks up the freshest credentials.
  await refreshProfileTokens(name);

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

// ---------------------------------------------------------------------------
// Proactive OAuth token refresh for ALL profiles (active + inactive)
// ---------------------------------------------------------------------------

// Cache the OAuth client metadata (client_id + token_endpoint) so we don't
// hammer the discovery endpoint on every refresh cycle.
let _oauthClientMeta = null;
let _oauthClientMetaAt = 0;

function _httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 10_000 }, (res) => {
      let body = '';
      res.on('data', (d) => { body += d; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`HTTP ${res.statusCode}`));
        } else {
          try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
        }
      });
    }).on('error', reject).on('timeout', function () { this.destroy(new Error('timeout')); });
  });
}

function _httpsPost(url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = Buffer.from(body, 'utf8');
    const req = https.request({
      hostname: u.hostname,
      port: 443,
      path: u.pathname + u.search,
      method: 'POST',
      timeout: 15_000,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': data.length,
        ...headers,
      },
    }, (res) => {
      let buf = '';
      res.on('data', (d) => { buf += d; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`HTTP ${res.statusCode}: ${buf}`));
        } else {
          try { resolve(JSON.parse(buf)); } catch (e) { reject(e); }
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.write(data);
    req.end();
  });
}

async function _fetchOAuthClientMeta() {
  const now = Date.now();
  if (_oauthClientMeta && now - _oauthClientMetaAt < 3_600_000) return _oauthClientMeta;
  try {
    const meta = await _httpsGet('https://claude.ai/oauth/claude-code-client-metadata');
    if (meta && meta.client_id) {
      _oauthClientMeta = meta;
      _oauthClientMetaAt = now;
    }
    return _oauthClientMeta;
  } catch (err) {
    console.error(`[profiles] Could not fetch OAuth client metadata: ${err.message}`);
    return null;
  }
}

// Refresh tokens for one profile using the OAuth refresh_token grant.
// Returns true if tokens were refreshed and saved, false otherwise.
async function refreshProfileTokens(profileName) {
  const profilePath = path.join(PROFILES_DIR, `${profileName}.json`);
  if (!fs.existsSync(profilePath)) return false;

  let profile;
  try { profile = JSON.parse(fs.readFileSync(profilePath, 'utf8')); } catch { return false; }

  const oauth = profile.claudeAiOauth;
  if (!oauth?.refreshToken) return false;

  // Only refresh if token is missing an expiry or expires within 30 minutes.
  if (oauth.expiresAt && oauth.expiresAt - Date.now() > 30 * 60_000) return false;

  try {
    const clientMeta = await _fetchOAuthClientMeta();
    if (!clientMeta?.client_id) {
      console.error(`[profiles] Cannot refresh "${profileName}": OAuth client_id unavailable`);
      return false;
    }

    const tokenEndpoint = clientMeta.token_endpoint ?? 'https://platform.claude.com/v1/oauth/token';
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: oauth.refreshToken,
      client_id: clientMeta.client_id,
    }).toString();

    const tokens = await _httpsPost(tokenEndpoint, body);

    const updatedOauth = {
      ...oauth,
      accessToken: tokens.access_token,
      expiresAt: Date.now() + (tokens.expires_in ?? 3600) * 1000,
      // Capture rotated refresh token if the server issued a new one.
      ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
    };

    const updated = { ...profile, claudeAiOauth: updatedOauth };
    const tmp = profilePath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(updated), 'utf8');
    fs.renameSync(tmp, profilePath);
    console.log(`[profiles] Proactively refreshed tokens for "${profileName}" (expires in ${Math.round((updatedOauth.expiresAt - Date.now()) / 60_000)} min)`);

    // If this is the currently active profile, also update .credentials.json
    // so the running Claude process picks up the new tokens immediately.
    const m = readMeta();
    if (m.active === profileName && !_credWriteInProgress) {
      const { _oauthAccount, ...creds } = updated;
      _writeCredentials(creds);
    }

    return true;
  } catch (err) {
    console.error(`[profiles] Token refresh failed for "${profileName}": ${err.message}`);
    return false;
  }
}

// Periodically refresh tokens for inactive profiles so they never grow so
// stale that their refresh tokens rotate away.  Active profile is skipped —
// Claude manages that itself.  Runs every 15 minutes; only touches profiles
// whose token expires within 30 min.
function setupProactiveRefresh() {
  async function runRefreshCycle() {
    const meta = readMeta();
    for (const { name } of meta.profiles) {
      // Claude manages the active profile's tokens — our refresh would race
      // against Claude's own refresh grant and risk invalidating the refresh
      // token it's about to use (rotating-token providers revoke the old RT
      // the moment a new one is issued).
      if (name === meta.active) continue;
      await refreshProfileTokens(name);
    }
  }

  // Run once shortly after startup (handles the stale-on-boot case).
  setTimeout(() => { void runRefreshCycle(); }, 10_000);

  setInterval(() => { void runRefreshCycle(); }, 15 * 60_000);
  console.log('[profiles] Proactive token refresh scheduled (every 15 min)');
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
  setupProactiveRefresh,
  refreshProfileTokens,
  CREDENTIALS_PATH,
  CLAUDE_JSON_PATH,
  PROFILES_DIR,
  META_PATH,
};
