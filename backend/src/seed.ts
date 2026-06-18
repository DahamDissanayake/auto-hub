import * as fs from 'fs';
import * as path from 'path';

const PLUGIN_DIR = process.env.PLUGIN_DIR ?? '/app/plugins';

interface SeedPlugin {
  slug: string;
  manifest: Record<string, unknown>;
  index: string;
}

const seedPlugins: SeedPlugin[] = [
  {
    slug: 'daily-summary',
    manifest: {
      slug: 'daily-summary',
      name: 'Daily Summary',
      description: 'Logs a daily summary message',
      version: '1.0.0',
      category: 'productivity',
      icon: '📋',
      entryFile: 'index.js',
      configSchema: [
        { key: 'title', label: 'Summary Title', type: 'string', required: false },
      ],
    },
    index: `module.exports = async function({ config, log }) {
  const title = config.title || 'Daily Summary';
  log('=== ' + title + ' ===');
  log('Date: ' + new Date().toLocaleDateString());
  log('Time: ' + new Date().toLocaleTimeString());
  log('All systems operational. Have a productive day!');
};`,
  },
  {
    slug: 'system-health',
    manifest: {
      slug: 'system-health',
      name: 'System Health',
      description: 'Reports CPU load and memory usage from /proc (Linux/Pi only)',
      version: '1.0.0',
      category: 'ops',
      icon: '🖥️',
      entryFile: 'index.js',
      configSchema: [],
    },
    index: `const fs = require('fs');
module.exports = async function({ config, log }) {
  try {
    const loadavg = fs.readFileSync('/proc/loadavg', 'utf-8').trim().split(' ');
    log('CPU Load (1m/5m/15m): ' + loadavg[0] + ' / ' + loadavg[1] + ' / ' + loadavg[2]);
  } catch (e) {
    log('CPU load unavailable: ' + e.message);
  }
  try {
    const meminfo = fs.readFileSync('/proc/meminfo', 'utf-8');
    const total = meminfo.match(/MemTotal:\\s+(\\d+)/)?.[1];
    const available = meminfo.match(/MemAvailable:\\s+(\\d+)/)?.[1];
    if (total && available) {
      const usedMb = Math.round((parseInt(total) - parseInt(available)) / 1024);
      const totalMb = Math.round(parseInt(total) / 1024);
      log('Memory: ' + usedMb + 'MB used / ' + totalMb + 'MB total');
    }
  } catch (e) {
    log('Memory info unavailable: ' + e.message);
  }
};`,
  },
  {
    slug: 'webhook-ping',
    manifest: {
      slug: 'webhook-ping',
      name: 'Webhook Ping',
      description: 'Sends a GET request to a configurable URL',
      version: '1.0.0',
      category: 'utility',
      icon: '🔔',
      entryFile: 'index.js',
      configSchema: [
        { key: 'url', label: 'Target URL', type: 'string', required: true },
        { key: 'label', label: 'Label', type: 'string', required: false },
      ],
    },
    index: `const https = require('https');
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
};`,
  },
];

function writeSeedPlugins() {
  if (!fs.existsSync(PLUGIN_DIR)) {
    fs.mkdirSync(PLUGIN_DIR, { recursive: true });
    console.log(`[seed] Created plugin directory: ${PLUGIN_DIR}`);
  }

  for (const plugin of seedPlugins) {
    const dir = path.join(PLUGIN_DIR, plugin.slug);
    if (fs.existsSync(dir)) {
      console.log(`[seed] Plugin '${plugin.slug}' already exists — skipping`);
      continue;
    }
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'manifest.json'),
      JSON.stringify(plugin.manifest, null, 2),
    );
    fs.writeFileSync(path.join(dir, 'index.js'), plugin.index);
    console.log(`[seed] Created plugin: ${plugin.slug}`);
  }
}

writeSeedPlugins();
