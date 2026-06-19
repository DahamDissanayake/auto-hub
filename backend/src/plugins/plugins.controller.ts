import { Controller, Get, Post, Patch, Param, Body, Query } from '@nestjs/common';
import { PluginsService } from './plugins.service';

@Controller('plugins')
export class PluginsController {
  constructor(private pluginsService: PluginsService) {}

  @Get()
  findAll() {
    return this.pluginsService.findAll();
  }

  // Static routes MUST come before :id routes to avoid NestJS matching them as id params
  @Get('executions')
  getAllExecutions(
    @Query('pluginId') pluginId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.pluginsService.getAllExecutions({ pluginId, from, to });
  }

  @Post('register')
  register(@Body() body: { slug: string }) {
    return this.pluginsService.registerFromManifest(body.slug);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.pluginsService.findOne(id);
  }

  @Post(':id/run')
  run(@Param('id') id: string) {
    return this.pluginsService.run(id, 'manual');
  }

  @Patch(':id/config')
  updateConfig(
    @Param('id') id: string,
    @Body() body: { config: Record<string, unknown> },
  ) {
    return this.pluginsService.updateConfig(id, body.config);
  }

  @Post(':id/toggle')
  toggle(@Param('id') id: string) {
    return this.pluginsService.toggle(id);
  }

  @Get(':id/executions')
  getExecutions(@Param('id') id: string) {
    return this.pluginsService.getExecutions(id);
  }
}
