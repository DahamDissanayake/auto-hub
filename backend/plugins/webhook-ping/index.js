const https = require('https');
const http = require('http');
module.exports = async function({ config, log }) {
  const url = config.url;
  const label = config.label || url;
  if (!url) { log('No URL configured'); return; }
  log('Pinging: ' + label + ' (' + url + ')');
  await new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, (res) => {
      log('Response: HTTP ' + res.statusCode);
      resolve(res.statusCode);
    });
    req.on('error', (e) => reject(e));
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('Request timeout')); });
  });
};