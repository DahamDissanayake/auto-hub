'use strict';
const fs = require('fs');

const MANIFEST_PATH = '/workspace/data/.terminal-sessions.json';

function readManifest() {
  try {
    return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  } catch {
    return { sessions: [] };
  }
}

function writeManifest(manifest) {
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf8');
}

function getSessions() {
  return readManifest().sessions;
}

function getSession(name) {
  return readManifest().sessions.find(s => s.name === name) ?? null;
}

function addSession(session) {
  const manifest = readManifest();
  manifest.sessions.push(session);
  writeManifest(manifest);
}

function removeSession(name) {
  const manifest = readManifest();
  manifest.sessions = manifest.sessions.filter(s => s.name !== name);
  writeManifest(manifest);
}

function updateLastActive(name) {
  const manifest = readManifest();
  const session = manifest.sessions.find(s => s.name === name);
  if (session) {
    session.lastActive = new Date().toISOString();
    writeManifest(manifest);
  }
}

module.exports = { readManifest, writeManifest, getSessions, getSession, addSession, removeSession, updateLastActive };
