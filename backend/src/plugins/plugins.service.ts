import {
  Injectable, NotFoundException, OnModuleInit, Logger,
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

    for (const entry of entries) {
      const manifestPath = path.join(this.pluginDir, entry.name, 'manifest.json');
      if (!fs.existsSync(manifestPath)) continue;
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        await this.upsertFromManifest(manifest);
      } catch (err) {
        this.logger.error(`Failed to load ${entry.name}: ${err.message}`);
      }
    }
  }

  private async upsertFromManifest(manifest: Record<string, unknown>) {
    const slug = manifest.slug as string;
    const existing = await this.pluginRepo.findOne({ where: { slug } });
    const fields = {
      name: manifest.name as string,
      description: (manifest.description as string) ?? '',
      icon: (manifest.icon as string) ?? '⚙️',
      category: (manifest.category as string) ?? 'utility',
      version: (manifest.version as string) ?? '1.0.0',
      entryFile: (manifest.entryFile as string) ?? 'index.js',
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
    const pluginPath = path.join(this.pluginDir, plugin.slug, plugin.entryFile);

    const execution = await this.executionRepo.save({
      pluginId: id,
      status: 'running',
      triggeredBy,
    });

    const startTime = Date.now();
    const logs: string[] = [];
    const log = (msg: string) => logs.push(`[${new Date().toISOString()}] ${msg}`);

    try {
      delete require.cache[require.resolve(pluginPath)];
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pluginModule = require(pluginPath);
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
      await this.notifications.send(
        `✅ <b>${plugin.name}</b> ran successfully (${durationMs}ms)`,
      );
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

  async registerFromManifest(slug: string): Promise<Plugin> {
    const manifestPath = path.join(this.pluginDir, slug, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      throw new NotFoundException(`manifest.json not found for plugin: ${slug}`);
    }
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    await this.upsertFromManifest(manifest);
    const plugin = await this.pluginRepo.findOne({ where: { slug: manifest.slug } });
    if (!plugin) throw new NotFoundException(`Plugin not found after registering: ${manifest.slug}`);
    return plugin;
  }
}
