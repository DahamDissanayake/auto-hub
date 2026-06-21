const http = require('http');
const fs = require('fs');
const path = require('path');

function dockerRequest(method, reqPath, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = body != null ? JSON.stringify(body) : null;
    const req = http.request(
      {
        socketPath: '/var/run/docker.sock',
        method,
        path: reqPath,
        headers: {
          'Content-Type': 'application/json',
          ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode, body: data });
          }
        });
      },
    );
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

module.exports = async function ({ log, action, notify }) {
  const cmd = action === 'shutdown' ? 'poweroff' : 'reboot';

  if (action === 'reboot') {
    await notify('🔄 <b>AutoHub host is rebooting…</b> Will notify when back online.');
    // Flag file persists on the host via the plugins volume mount
    const flagPath = path.join(__dirname, '..', '.reboot-pending');
    fs.writeFileSync(flagPath, new Date().toISOString());
  } else {
    await notify('⚠️ <b>AutoHub host is shutting down.</b>');
  }

  log(`Initiating host ${cmd} via nsenter...`);

  const createRes = await dockerRequest('POST', '/containers/create', {
    Image: 'node:20-alpine',
    Cmd: ['nsenter', '-t', '1', '-m', '-u', '-i', '-n', '--', cmd],
    HostConfig: {
      Privileged: true,
      PidMode: 'host',
      AutoRemove: true,
    },
  });

  if (createRes.status !== 201) {
    throw new Error(`Failed to create container: ${JSON.stringify(createRes.body)}`);
  }

  const containerId = createRes.body.Id;
  log(`Container ${containerId.slice(0, 12)} created`);

  const startRes = await dockerRequest('POST', `/containers/${containerId}/start`, null);
  if (startRes.status !== 204) {
    throw new Error(`Failed to start container: ${JSON.stringify(startRes.body)}`);
  }
  log(`Host ${cmd} initiated.`);
};
