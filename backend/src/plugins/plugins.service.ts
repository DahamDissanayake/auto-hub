import {
  Injectable, NotFoundException, BadRequestException, OnModuleInit, Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { Plugin } from './entities/plugin.entity';
import { PluginExecution } from './entities/plugin-execution.entity';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class PluginsService implements OnModuleInit {
  private readonly logger = new Logger(PluginsService.name);
  readonly pluginDir: string;

  constructor(
    @InjectRepository(Plugin)
    private pluginRepo: Repository<Plugin>,
    @InjectRepository(PluginExecution)
    private executionRepo: Repository<PluginExecution>,
    private config: ConfigService,
    private notifications: NotificationsService,
  ) {
    this.pluginDir = config.get<string>('PLUGIN_DIR') ?? '/app/plugins';
  }

  private assertPathWithinPluginDir(resolvedPath: string): void {
    const resolvedBase = path.resolve(this.pluginDir) + path.sep;
    if (!resolvedPath.startsWith(resolvedBase)) {
      throw new BadRequestException('Plugin path escapes the plugin directory');
    }
  }

  async onModuleInit() {
    try {
      await this.scanPlugins();
    } catch (err) {
      this.logger.error(`Plugin scan failed: ${(err as Error).message}`);
    }
  }

  async scanPlugins() {
    if (!fs.existsSync(this.pluginDir)) return;
    const entries = fs.readdirSync(this.pluginDir, { withFileTypes: true })
      .filter(d => d.isDirectory());

    const activeSlugs = new Set<string>();
    for (const entry of entries) {
      const manifestPath = path.join(this.pluginDir, entry.name, 'manifest.json');
      if (!fs.existsSync(manifestPath)) continue;
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        await this.upsertFromManifest(manifest);
        activeSlugs.add(manifest.slug as string);
      } catch (err) {
        this.logger.error(`Failed to load ${entry.name}: ${err.message}`);
      }
    }

    // Remove DB records for plugins no longer present on disk
    const allPlugins = await this.pluginRepo.find();
    for (const plugin of allPlugins) {
      if (!activeSlugs.has(plugin.slug)) {
        await this.pluginRepo.delete(plugin.id);
        this.logger.log(`Removed stale plugin from DB: ${plugin.slug}`);
      }
    }
  }

  private async upsertFromManifest(manifest: Record<string, unknown>) {
    const slug = manifest.slug as string;
    const entryFile = (manifest.entryFile as string) ?? 'index.js';
    if (entryFile.includes('..') || path.isAbsolute(entryFile)) {
      throw new BadRequestException(`Invalid entryFile "${entryFile}": must be a relative path within the plugin directory`);
    }
    const existing = await this.pluginRepo.findOne({ where: { slug } });
    const fields = {
      name: manifest.name as string,
      description: (manifest.description as string) ?? '',
      icon: (manifest.icon as string) ?? '⚙️',
      category: (manifest.category as string) ?? 'utility',
      version: (manifest.version as string) ?? '1.0.0',
      entryFile,
      configSchema: (manifest.configSchema as any[]) ?? [],
    };
    if (existing) {
      await this.pluginRepo.update(existing.id, fields);
    } else {
      await this.pluginRepo.save({ slug, ...fields, status: 'inactive', config: {} });
    }
  }

  async findAll(): Promise<Plugin[]> {
    return this.pluginRepo.find({ order: { createdAt: 'ASC' } });
  }

  async findOne(id: string): Promise<Plugin> {
    const plugin = await this.pluginRepo.findOne({ where: { id } });
    if (!plugin) throw new NotFoundException(`Plugin ${id} not found`);
    return plugin;
  }

  async updateConfig(id: string, config: Record<string, unknown>): Promise<Plugin> {
    const plugin = await this.findOne(id);
    await this.pluginRepo.update(id, { config });
    return { ...plugin, config };
  }

  async toggle(id: string): Promise<Plugin> {
    const plugin = await this.findOne(id);
    const newStatus = plugin.status === 'active' ? 'inactive' : 'active';
    await this.pluginRepo.update(id, { status: newStatus });
    return { ...plugin, status: newStatus };
  }

  async run(
    id: string,
    triggeredBy: 'manual' | 'scheduled' = 'manual',
  ): Promise<PluginExecution> {
    const plugin = await this.findOne(id);
    const resolvedPath = path.resolve(this.pluginDir, plugin.slug, plugin.entryFile);
    this.assertPathWithinPluginDir(resolvedPath);
    let realPath: string;
    try {
      realPath = fs.realpathSync(resolvedPath);
    } catch {
      throw new BadRequestException('Plugin entry file does not exist or cannot be resolved');
    }
    this.assertPathWithinPluginDir(realPath);

    const execution = await this.executionRepo.save({
      pluginId: id,
      status: 'running',
      triggeredBy,
    });

    const startTime = Date.now();
    const logs: string[] = [];
    const log = (msg: string) => logs.push(`[${new Date().toISOString()}] ${msg}`);

    try {
      delete require.cache[require.resolve(realPath)];
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pluginModule = require(realPath);
      const fn = pluginModule.default ?? pluginModule;

      let timeoutHandle: ReturnType<typeof setTimeout>;
      await Promise.race([
        fn({ config: plugin.config, log }),
        new Promise<void>((_, reject) => {
          timeoutHandle = setTimeout(() => reject(new Error('Plugin timeout (60s)')), 60_000);
        }),
      ]).finally(() => clearTimeout(timeoutHandle!));

      const durationMs = Date.now() - startTime;
      const output = logs.join('\n');
      await this.executionRepo.update(execution.id, {
        status: 'success', output, durationMs, finishedAt: new Date(),
      });
      await this.pluginRepo.update(id, { lastRunAt: new Date(), lastRunStatus: 'success' });
      const MAX = 3500;
      const truncated = output.length > MAX ? output.slice(0, MAX) + '\n…(truncated)' : output;
      const telegramMsg = output.trim()
        ? `✅ <b>${plugin.name}</b> ran successfully (${durationMs}ms)\n\n<pre>${truncated}</pre>`
        : `✅ <b>${plugin.name}</b> ran successfully (${durationMs}ms)`;
      await this.notifications.send(telegramMsg);
      return { ...execution, status: 'success', output, durationMs } as PluginExecution;
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const output = logs.join('\n');
      await this.executionRepo.update(execution.id, {
        status: 'failed', output, error: err.message, durationMs, finishedAt: new Date(),
      });
      await this.pluginRepo.update(id, {
        lastRunAt: new Date(), lastRunStatus: 'failed', status: 'error',
      });
      await this.notifications.send(
        `❌ <b>${plugin.name}</b> failed: ${err.message}`,
      );
      return { ...execution, status: 'failed', error: err.message, durationMs } as PluginExecution;
    }
  }

  async getExecutions(id: string): Promise<PluginExecution[]> {
    return this.executionRepo.find({
      where: { pluginId: id },
      order: { startedAt: 'DESC' },
      take: 50,
    });
  }

  async getAllExecutions(filters: {
    pluginId?: string;
    from?: string;
    to?: string;
  }): Promise<PluginExecution[]> {
    const qb = this.executionRepo.createQueryBuilder('e')
      .leftJoinAndSelect('e.plugin', 'plugin')
      .orderBy('e.startedAt', 'DESC')
      .take(100);

    if (filters.pluginId) {
      qb.andWhere('e.pluginId = :pluginId', { pluginId: filters.pluginId });
    }
    if (filters.from) {
      qb.andWhere('e.startedAt >= :from', { from: new Date(filters.from) });
    }
    if (filters.to) {
      qb.andWhere('e.startedAt <= :to', { to: new Date(filters.to) });
    }

    return qb.getMany();
  }

  async registerFromManifest(slug: string): Promise<Plugin> {
    if (!/^[a-zA-Z0-9_-]+$/.test(slug)) {
      throw new BadRequestException(`Invalid plugin slug "${slug}": only alphanumeric, hyphens and underscores allowed`);
    }
    const manifestPath = path.join(this.pluginDir, slug, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      throw new NotFoundException(`manifest.json not found for plugin: ${slug}`);
    }
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    if (!/^[a-zA-Z0-9_-]+$/.test(manifest.slug)) {
      throw new BadRequestException(`Invalid manifest slug "${manifest.slug}": only alphanumeric, hyphens and underscores allowed`);
    }
    await this.upsertFromManifest(manifest);
    const plugin = await this.pluginRepo.findOne({ where: { slug: manifest.slug } });
    if (!plugin) throw new NotFoundException(`Plugin not found after registering: ${manifest.slug}`);
    return plugin;
  }
}
