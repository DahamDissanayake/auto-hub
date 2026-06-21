import { Injectable, Logger } from '@nestjs/common';
import * as http from 'http';
import * as fs from 'fs';
import { statfs } from 'fs/promises';

export interface DiskStats {
  path: string;
  usedGb: number;
  totalGb: number;
  freeGb: number;
  percent: number;
}

export interface SystemMetrics {
  cpuPercent: number;
  memUsedMb: number;
  memTotalMb: number;
  memPercent: number;
  rootDisk: DiskStats;
  dataDisk: DiskStats | null;
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

  private async getDiskStats(path: string): Promise<DiskStats | null> {
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

  async getSystemMetrics(): Promise<SystemMetrics> {
    const [cpuPercent, rootDisk, dataDisk] = await Promise.all([
      this.getCpuPercent(),
      this.getDiskStats('/host'),
      this.getDiskStats('/mnt/data'),
    ]);
    const mem = this.getMemInfo();

    return {
      cpuPercent: parseFloat(cpuPercent.toFixed(1)),
      memUsedMb: mem.usedMb,
      memTotalMb: mem.totalMb,
      memPercent: mem.totalMb > 0 ? Math.round((mem.usedMb / mem.totalMb) * 100) : 0,
      rootDisk: rootDisk ?? { path: '/', usedGb: 0, totalGb: 0, freeGb: 0, percent: 0 },
      dataDisk,
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
      const numCpus = (cpuStats?.['online_cpus'] as number) ?? 1;
      const cpuPercent =
        sysDelta > 0 ? Math.min(100, (cpuDelta / sysDelta) * numCpus * 100) : 0;

      const memUsage = (memStats?.['usage'] as number) ?? 0;
      const memLimit = (memStats?.['limit'] as number) ?? 0;
      const memCache =
        ((memStats?.['stats'] as Record<string, number> | undefined)?.['cache'] ?? 0);
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
}
