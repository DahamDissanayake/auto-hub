import { Injectable, Logger } from '@nestjs/common';
import * as http from 'http';
import * as fs from 'fs';
import { statfs } from 'fs/promises';
import { exec, spawn } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export interface DiskStats {
  path: string;
  usedGb: number;
  totalGb: number;
  freeGb: number;
  percent: number;
  readMbps: number;
  writeMbps: number;
}

export interface NetworkStats {
  rxMbps: number
  txMbps: number
  interfaceName: string
  interfaces: Array<{ name: string; rxMbps: number; txMbps: number; rxTotalBytes: number; txTotalBytes: number }>
}

export interface SystemMetrics {
  cpuPercent: number;
  memUsedMb: number;
  memTotalMb: number;
  memPercent: number;
  rootDisk: DiskStats;
  dataDisk: DiskStats | null;
  network: NetworkStats;
}

export interface SpeedTestResult {
  downloadMbps: number
  uploadMbps: number
  pingMs: number
  server: string
}

export interface ContainerInfo {
  id: string;
  shortId: string;
  name: string;
  image: string;
  state: string;
  status: string;
  health: string | null;
  uptime: string;
  cpuPercent: number;
  memUsageMb: number;
  memLimitMb: number;
  memPercent: number;
}

@Injectable()
export class DockerService {
  private readonly logger = new Logger(DockerService.name);

  private dockerRequest<T>(
    method: string,
    path: string,
    body?: string,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const options: http.RequestOptions = {
        socketPath: '/var/run/docker.sock',
        method,
        path,
        headers: {
          'Content-Type': 'application/json',
          Host: 'localhost',
          ...(body ? { 'Content-Length': String(Buffer.byteLength(body)) } : {}),
        },
      };
      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => (data += chunk.toString()));
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) {
            return reject(new Error(`Docker API ${res.statusCode}: ${data}`));
          }
          try {
            resolve(data ? (JSON.parse(data) as T) : ({} as T));
          } catch {
            resolve(data as unknown as T);
          }
        });
      });
      req.on('error', reject);
      if (body) req.write(body);
      req.end();
    });
  }

  private readProcStat(): { idle: number; total: number } {
    try {
      const raw = fs.readFileSync('/proc/stat', 'utf-8');
      const line = raw.split('\n')[0];
      const fields = line.trim().split(/\s+/).slice(1).map(Number);
      const idle = (fields[3] ?? 0) + (fields[4] ?? 0);
      const total = fields.reduce((a, b) => a + b, 0);
      return { idle, total };
    } catch {
      return { idle: 0, total: 1 };
    }
  }

  private async getCpuPercent(): Promise<number> {
    const s1 = this.readProcStat();
    await new Promise((r) => setTimeout(r, 250));
    const s2 = this.readProcStat();
    const totalDiff = s2.total - s1.total;
    const idleDiff = s2.idle - s1.idle;
    if (totalDiff === 0) return 0;
    return Math.min(100, Math.max(0, (1 - idleDiff / totalDiff) * 100));
  }

  private getMemInfo(): { usedMb: number; totalMb: number } {
    try {
      const raw = fs.readFileSync('/proc/meminfo', 'utf-8');
      const totalKb = parseInt(raw.match(/MemTotal:\s+(\d+)/)?.[1] ?? '0');
      const availKb = parseInt(raw.match(/MemAvailable:\s+(\d+)/)?.[1] ?? '0');
      return {
        totalMb: Math.round(totalKb / 1024),
        usedMb: Math.round((totalKb - availKb) / 1024),
      };
    } catch {
      return { usedMb: 0, totalMb: 0 };
    }
  }

  private async getDiskStats(path: string): Promise<Omit<DiskStats, 'readMbps' | 'writeMbps'> | null> {
    try {
      const s = await statfs(path);
      const totalBytes = s.bsize * s.blocks;
      const freeBytes = s.bsize * s.bfree;
      const usedBytes = totalBytes - freeBytes;
      return {
        path,
        usedGb: parseFloat((usedBytes / 1e9).toFixed(1)),
        totalGb: parseFloat((totalBytes / 1e9).toFixed(1)),
        freeGb: parseFloat((freeBytes / 1e9).toFixed(1)),
        percent: totalBytes ? Math.round((usedBytes / totalBytes) * 100) : 0,
      };
    } catch {
      return null;
    }
  }

  private parseDiskstats(raw: string): Record<string, { sectorsRead: number; sectorsWritten: number }> {
    const result: Record<string, { sectorsRead: number; sectorsWritten: number }> = {}
    for (const line of raw.split('\n')) {
      const parts = line.trim().split(/\s+/)
      if (parts.length < 10) continue
      const name = parts[2]
      result[name] = {
        sectorsRead: parseInt(parts[5] ?? '0', 10) || 0,
        sectorsWritten: parseInt(parts[9] ?? '0', 10) || 0,
      }
    }
    return result
  }

  private findDeviceForPath(mountPath: string): string | null {
    try {
      const mounts = fs.readFileSync('/proc/mounts', 'utf-8')
      let bestMatch = ''
      let bestDevice = ''
      for (const line of mounts.split('\n')) {
        const parts = line.split(' ')
        if (parts.length < 2) continue
        const device = parts[0]
        const mountPoint = parts[1]
        if (
          mountPath === mountPoint || mountPath.startsWith(mountPoint + '/') || mountPoint === '/'
        ) {
          if (mountPoint.length > bestMatch.length) {
            bestMatch = mountPoint
            bestDevice = device
          }
        }
      }
      if (!bestDevice || !bestDevice.startsWith('/dev/')) return null
      const devName = bestDevice.replace('/dev/', '')
      // mmc/nvme partition: mmcblk0p2 → mmcblk0, nvme0n1p1 → nvme0n1
      if (/p\d+$/.test(devName)) return devName.replace(/p\d+$/, '')
      // sd/vd partition: sda1 → sda
      return devName.replace(/\d+$/, '') || devName
    } catch {
      return null
    }
  }

  private async getDiskIOStats(mountPath: string): Promise<{ readMbps: number; writeMbps: number }> {
    const device = this.findDeviceForPath(mountPath)
    if (!device) return { readMbps: 0, writeMbps: 0 }

    const readStats = (): Record<string, { sectorsRead: number; sectorsWritten: number }> => {
      try { return this.parseDiskstats(fs.readFileSync('/proc/diskstats', 'utf-8')) }
      catch { return {} }
    }

    const s1 = readStats()
    await new Promise<void>((r) => setTimeout(r, 500))
    const s2 = readStats()

    const d1 = s1[device]
    const d2 = s2[device]
    if (!d1 || !d2) return { readMbps: 0, writeMbps: 0 }

    const readSectors = d2.sectorsRead - d1.sectorsRead
    const writeSectors = d2.sectorsWritten - d1.sectorsWritten
    const SECTOR = 512

    return {
      readMbps: parseFloat(Math.max(0, (readSectors * SECTOR) / (1024 * 1024) / 0.5).toFixed(2)),
      writeMbps: parseFloat(Math.max(0, (writeSectors * SECTOR) / (1024 * 1024) / 0.5).toFixed(2)),
    }
  }

  private parseNetDev(raw: string): Record<string, { rxBytes: number; txBytes: number }> {
    const result: Record<string, { rxBytes: number; txBytes: number }> = {}
    for (const line of raw.split('\n').slice(2)) {
      const trimmed = line.trim()
      if (!trimmed) continue
      const colonIdx = trimmed.indexOf(':')
      if (colonIdx === -1) continue
      const iface = trimmed.slice(0, colonIdx).trim()
      const fields = trimmed.slice(colonIdx + 1).trim().split(/\s+/)
      result[iface] = {
        rxBytes: parseInt(fields[0] ?? '0', 10),
        txBytes: parseInt(fields[8] ?? '0', 10),
      }
    }
    return result
  }

  private async getNetworkStats(): Promise<NetworkStats> {
    // Try host PID 1's network namespace first (shows Pi's physical eth0/wlan0),
    // then the host proc symlink, then the container's own interfaces as fallback.
    const readDev = (): string => {
      for (const path of [
        '/host/proc/1/net/dev',
        '/host/proc/net/dev',
        '/proc/net/dev',
      ]) {
        try {
          const content = fs.readFileSync(path, 'utf-8')
          if (content.trim().split('\n').length > 2) return content
        } catch { /* try next */ }
      }
      return ''
    }

    const s1 = this.parseNetDev(readDev())
    await new Promise<void>((r) => setTimeout(r, 500))
    const s2 = this.parseNetDev(readDev())

    // Physical interfaces only (no Docker virtuals)
    const physicalIfaces = Object.keys(s2).filter(
      (k) =>
        k !== 'lo' &&
        s1[k] !== undefined &&
        s2[k] !== undefined &&
        !k.startsWith('veth') &&
        !k.startsWith('docker') &&
        !k.startsWith('br-'),
    )

    if (physicalIfaces.length === 0) {
      return { rxMbps: 0, txMbps: 0, interfaceName: 'unknown', interfaces: [] }
    }

    const makeIfaceStats = (iface: string) => {
      const rxDelta = (s2[iface]?.rxBytes ?? 0) - (s1[iface]?.rxBytes ?? 0)
      const txDelta = (s2[iface]?.txBytes ?? 0) - (s1[iface]?.txBytes ?? 0)
      return {
        name: iface,
        rxMbps: parseFloat(Math.max(0, (rxDelta * 8) / 1_000_000 / 0.5).toFixed(2)),
        txMbps: parseFloat(Math.max(0, (txDelta * 8) / 1_000_000 / 0.5).toFixed(2)),
        // Cumulative totals — 0 means interface has never carried traffic (down/unused)
        rxTotalBytes: s2[iface]?.rxBytes ?? 0,
        txTotalBytes: s2[iface]?.txBytes ?? 0,
      }
    }

    const interfaces = physicalIfaces.map(makeIfaceStats)

    // Primary = interface with the most cumulative traffic (active one wins over idle eth0)
    const primaryIface = physicalIfaces.reduce((best, cur) =>
      (s2[cur]?.rxBytes ?? 0) + (s2[cur]?.txBytes ?? 0) >
      (s2[best]?.rxBytes ?? 0) + (s2[best]?.txBytes ?? 0)
        ? cur
        : best,
    )

    const primary = makeIfaceStats(primaryIface)

    return {
      rxMbps: primary.rxMbps,
      txMbps: primary.txMbps,
      interfaceName: primaryIface,
      interfaces,
    }
  }

  async getSystemMetrics(): Promise<SystemMetrics> {
    const [cpuPercent, rootDisk, dataDisk, network, rootIO, dataIO] = await Promise.all([
      this.getCpuPercent(),
      this.getDiskStats('/host'),
      this.getDiskStats('/mnt/data'),
      this.getNetworkStats(),
      this.getDiskIOStats('/host'),
      this.getDiskIOStats('/mnt/data'),
    ])
    const mem = this.getMemInfo();

    return {
      cpuPercent: parseFloat(cpuPercent.toFixed(1)),
      memUsedMb: mem.usedMb,
      memTotalMb: mem.totalMb,
      memPercent: mem.totalMb > 0 ? Math.round((mem.usedMb / mem.totalMb) * 100) : 0,
      rootDisk: rootDisk
        ? { ...rootDisk, readMbps: rootIO.readMbps, writeMbps: rootIO.writeMbps }
        : { path: '/', usedGb: 0, totalGb: 0, freeGb: 0, percent: 0, readMbps: 0, writeMbps: 0 },
      dataDisk: dataDisk
        ? { ...dataDisk, readMbps: dataIO.readMbps, writeMbps: dataIO.writeMbps }
        : null,
      network,
    };
  }

  private formatUptime(createdUnix: number): string {
    const diff = Date.now() - createdUnix * 1000;
    const s = Math.floor(diff / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ${m % 60}m`;
    const d = Math.floor(h / 24);
    return `${d}d ${h % 24}h`;
  }

  private parseContainerStats(
    stats: Record<string, unknown>,
  ): { cpuPercent: number; memUsageMb: number; memLimitMb: number; memPercent: number } {
    try {
      const cpuStats = stats['cpu_stats'] as Record<string, unknown>;
      const preCpuStats = stats['precpu_stats'] as Record<string, unknown>;
      const memStats = stats['memory_stats'] as Record<string, unknown>;

      const cpuUsage = (cpuStats?.['cpu_usage'] as Record<string, number>) ?? {};
      const preCpuUsage = (preCpuStats?.['cpu_usage'] as Record<string, number>) ?? {};

      const cpuDelta = (cpuUsage['total_usage'] ?? 0) - (preCpuUsage['total_usage'] ?? 0);
      const sysDelta =
        ((cpuStats?.['system_cpu_usage'] as number) ?? 0) -
        ((preCpuStats?.['system_cpu_usage'] as number) ?? 0);
      // online_cpus may be absent; fall back to percpu_usage array length
      const numCpus =
        (cpuStats?.['online_cpus'] as number) ||
        ((cpuUsage['percpu_usage'] as unknown as number[] | undefined)?.length ?? 1);
      const cpuPercent =
        sysDelta > 0 ? Math.min(100, (cpuDelta / sysDelta) * numCpus * 100) : 0;

      const memUsage = (memStats?.['usage'] as number) ?? 0;
      const memLimit = (memStats?.['limit'] as number) ?? 0;
      const memStatsMap = memStats?.['stats'] as Record<string, number> | undefined;
      // cgroups v2 uses inactive_file; cgroups v1 uses cache
      const memCache = memStatsMap?.['inactive_file'] ?? memStatsMap?.['cache'] ?? 0;
      const realMem = Math.max(0, memUsage - memCache);

      return {
        cpuPercent: parseFloat(cpuPercent.toFixed(1)),
        memUsageMb: Math.round(realMem / (1024 * 1024)),
        memLimitMb: Math.round(memLimit / (1024 * 1024)),
        memPercent: memLimit > 0 ? Math.round((realMem / memLimit) * 100) : 0,
      };
    } catch {
      return { cpuPercent: 0, memUsageMb: 0, memLimitMb: 0, memPercent: 0 };
    }
  }

  async getContainers(): Promise<ContainerInfo[]> {
    interface DockerContainer {
      Id: string;
      Names: string[];
      Image: string;
      State: string;
      Status: string;
      Created: number;
    }

    const containers = await this.dockerRequest<DockerContainer[]>(
      'GET',
      '/containers/json?all=true',
    );

    const results = await Promise.all(
      containers.map(async (c) => {
        let cpuPercent = 0;
        let memUsageMb = 0;
        let memLimitMb = 0;
        let memPercent = 0;
        let health: string | null = null;

        if (c.State === 'running') {
          try {
            const [statsData, inspectData] = await Promise.all([
              this.dockerRequest<Record<string, unknown>>(
                'GET',
                `/containers/${c.Id}/stats?stream=false`,
              ),
              this.dockerRequest<Record<string, unknown>>(
                'GET',
                `/containers/${c.Id}/json`,
              ),
            ]);

            const parsed = this.parseContainerStats(statsData);
            cpuPercent = parsed.cpuPercent;
            memUsageMb = parsed.memUsageMb;
            memLimitMb = parsed.memLimitMb;
            memPercent = parsed.memPercent;

            const state = inspectData['State'] as Record<string, unknown> | undefined;
            const healthStatus = (
              state?.['Health'] as Record<string, unknown> | undefined
            )?.['Status'];
            health = typeof healthStatus === 'string' ? healthStatus : null;
          } catch {
            // stats unavailable
          }
        }

        return {
          id: c.Id,
          shortId: c.Id.substring(0, 12),
          name: (c.Names[0] ?? c.Id).replace(/^\//, ''),
          image: c.Image.split('@')[0],
          state: c.State,
          status: c.Status,
          health,
          uptime: c.State === 'running' ? this.formatUptime(c.Created) : '—',
          cpuPercent,
          memUsageMb,
          memLimitMb,
          memPercent,
        } as ContainerInfo;
      }),
    );

    return results.sort((a, b) => a.name.localeCompare(b.name));
  }

  async restartContainer(id: string): Promise<void> {
    await this.dockerRequest('POST', `/containers/${id}/restart`);
  }

  async stopContainer(id: string): Promise<void> {
    await this.dockerRequest('POST', `/containers/${id}/stop`);
  }

  async startContainer(id: string): Promise<void> {
    await this.dockerRequest('POST', `/containers/${id}/start`);
  }

  async restartAllContainers(): Promise<void> {
    const containers = await this.dockerRequest<{ Id: string; State: string }[]>(
      'GET',
      '/containers/json?all=true',
    );
    await Promise.allSettled(
      containers
        .filter((c) => c.State === 'running')
        .map((c) => this.dockerRequest('POST', `/containers/${c.Id}/restart`)),
    );
  }

  async stopAllContainers(): Promise<void> {
    const containers = await this.dockerRequest<{ Id: string; State: string }[]>(
      'GET',
      '/containers/json?all=true',
    );
    await Promise.allSettled(
      containers
        .filter((c) => c.State === 'running')
        .map((c) => this.dockerRequest('POST', `/containers/${c.Id}/stop`)),
    );
  }

  async runSpeedTest(): Promise<SpeedTestResult> {
    const SCRIPT = `
import json, time, urllib.request, ssl
ctx = ssl.create_default_context()

def fetch(url, data=None):
    req = urllib.request.Request(url, data=data,
        headers={'User-Agent': 'Mozilla/5.0',
                 **(({'Content-Type': 'application/octet-stream'}) if data else {})})
    with urllib.request.urlopen(req, timeout=60, context=ctx) as r:
        return r.read()

def measure_ping():
    t = []
    for _ in range(3):
        s = time.perf_counter()
        fetch('https://speed.cloudflare.com/__down?bytes=1000')
        t.append((time.perf_counter() - s) * 1000)
    return round(min(t))

def measure_download():
    s = time.perf_counter()
    body = fetch('https://speed.cloudflare.com/__down?bytes=25000000')
    return (len(body) * 8) / (time.perf_counter() - s)

def measure_upload():
    data = b'x' * 10_000_000
    s = time.perf_counter()
    fetch('https://speed.cloudflare.com/__up', data=data)
    return (len(data) * 8) / (time.perf_counter() - s)

try:
    ping = measure_ping()
    dl = measure_download()
    ul = measure_upload()
    print(json.dumps({'download': dl, 'upload': ul, 'ping': ping,
                      'server': {'sponsor': 'Cloudflare', 'country': 'Global'}}))
except Exception as e:
    import sys; print(str(e), file=sys.stderr); sys.exit(1)
`
    const stdout = await new Promise<string>((resolve, reject) => {
      const child = spawn('python3', ['-'], { timeout: 120_000 })
      let out = ''
      let err = ''
      child.stdout.on('data', (d: Buffer) => { out += d.toString() })
      child.stderr.on('data', (d: Buffer) => { err += d.toString() })
      child.on('close', (code: number | null) => {
        if (code === 0) resolve(out)
        else reject(new Error(err.trim() || 'Speed test failed'))
      })
      child.on('error', (e: Error) => reject(new Error(`Speed test failed: ${e.message}`)))
      child.stdin.write(SCRIPT)
      child.stdin.end()
    })

    const data = JSON.parse(stdout) as {
      download: number
      upload: number
      ping: number
      server: { sponsor: string; country: string }
    }

    return {
      downloadMbps: parseFloat((data.download / 1_000_000).toFixed(2)),
      uploadMbps: parseFloat((data.upload / 1_000_000).toFixed(2)),
      pingMs: Math.round(data.ping),
      server: `${data.server.sponsor}, ${data.server.country}`,
    }
  }
}
