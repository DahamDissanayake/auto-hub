const fs = require('fs');
module.exports = async function({ config, log }) {
  try {
    const loadavg = fs.readFileSync('/proc/loadavg', 'utf-8').trim().split(' ');
    log('CPU Load (1m/5m/15m): ' + loadavg[0] + ' / ' + loadavg[1] + ' / ' + loadavg[2]);
  } catch (e) {
    log('CPU load unavailable: ' + e.message);
  }
  try {
    const meminfo = fs.readFileSync('/proc/meminfo', 'utf-8');
    const total = meminfo.match(/MemTotal:\s+(\d+)/)?.[1];
    const available = meminfo.match(/MemAvailable:\s+(\d+)/)?.[1];
    if (total && available) {
      const usedMb = Math.round((parseInt(total) - parseInt(available)) / 1024);
      const totalMb = Math.round(parseInt(total) / 1024);
      log('Memory: ' + usedMb + 'MB used / ' + totalMb + 'MB total');
    }
  } catch (e) {
    log('Memory info unavailable: ' + e.message);
  }
};