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

const HELPER_IMAGE = 'node:20-alpine';

function pullImage(image) {
  return new Promise((resolve, reject) => {
    const [repo, tag] = image.split(':');
    const req = http.request(
      {
        socketPath: '/var/run/docker.sock',
        method: 'POST',
        path: `/images/create?fromImage=${encodeURIComponent(repo)}&tag=${encodeURIComponent(tag || 'latest')}`,
      },
      (res) => {
        res.on('data', () => {}); // drain the streamed pull progress
        res.on('end', () => resolve(res.statusCode));
      },
    );
    req.on('error', reject);
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

  // The helper image is a throwaway (AutoRemove: true) container, so nothing
  // ever "holds" it in use — a routine `docker image prune -a` silently
  // removes it and this whole feature breaks next time it's needed. Ensure
  // it's present every run instead of assuming it is.
  const inspectRes = await dockerRequest('GET', `/images/${HELPER_IMAGE}/json`);
  if (inspectRes.status !== 200) {
    log(`Helper image ${HELPER_IMAGE} not found locally, pulling...`);
    const pullStatus = await pullImage(HELPER_IMAGE);
    if (pullStatus !== 200) {
      throw new Error(`Failed to pull helper image ${HELPER_IMAGE} (status ${pullStatus})`);
    }
    log(`Helper image ${HELPER_IMAGE} pulled.`);
  }

  const createRes = await dockerRequest('POST', '/containers/create', {
    Image: HELPER_IMAGE,
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
