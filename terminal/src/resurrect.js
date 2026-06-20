'use strict';
const cp = require('child_process');
const { getSessions } = require('./sessions');

function resurrect() {
  const sessions = getSessions();
  for (const session of sessions) {
    try {
      cp.execFileSync('tmux', ['has-session', '-t', session.name], { stdio: 'ignore' });
      console.log(`Session "${session.name}" already alive`);
    } catch {
      try {
        cp.execFileSync('tmux', ['new-session', '-d', '-s', session.name, '-c', session.cwd]);
        console.log(`Resurrected session "${session.name}" at ${session.cwd}`);
      } catch (err) {
        console.error(`Failed to resurrect "${session.name}": ${err.message}`);
      }
    }
  }
}

if (require.main === module) resurrect();

module.exports = { resurrect };
