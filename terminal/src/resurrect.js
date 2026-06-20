'use strict';
const cp = require('child_process');
const { getSessions } = require('./sessions');

const ALLOWED_DIRS = (process.env.TERMINAL_DIRS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

function isValidCwd(cwd) {
  return ALLOWED_DIRS.some(dir => cwd === dir || cwd.startsWith(dir + '/'));
}

function resurrect() {
  const sessions = getSessions();
  for (const session of sessions) {
    const { name, cwd } = session;
    if (!isValidCwd(cwd)) {
      console.warn(`resurrect: skipping session "${name}" — invalid cwd: ${cwd}`);
      continue;
    }
    try {
      cp.execFileSync('tmux', ['has-session', '-t', name], { stdio: 'ignore' });
      console.log(`Session "${name}" already alive`);
    } catch {
      try {
        cp.execFileSync('tmux', ['new-session', '-d', '-s', name, '-c', cwd]);
        console.log(`Resurrected session "${name}" at ${cwd}`);
      } catch (err) {
        console.error(`Failed to resurrect "${name}": ${err.message}`);
      }
    }
  }
}

if (require.main === module) resurrect();

module.exports = { resurrect };
