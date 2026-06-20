const http = require('http');

function dockerRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = body != null ? JSON.stringify(body) : null;
    const req = http.request(
      {
        socketPath: '/var/run/docker.sock',
        method,
        path,
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

module.exports = async function ({ log, action }) {
  const cmd = action === 'shutdown' ? 'poweroff' : 'reboot';
  log(`Initiating host ${cmd} via nsenter...`);

  const createRes = await dockerRequest('POST', '/containers/create', {
    Image: 'node:20-alpine',
    Cmd: ['nsenter', '-t', '1', '-m', '-u', '-i', '-n', '--', cmd],
    HostConfig: {
      Privileged: true,
      PidMode: 'host',
      AutoRemove: false,
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
  log('Container started, waiting for nsenter to complete...');

  await dockerRequest('POST', `/containers/${containerId}/wait`, null);
  log('nsenter completed');

  await dockerRequest('DELETE', `/containers/${containerId}?force=true`, null);
  log(`Container removed. Host ${cmd} initiated.`);
};
