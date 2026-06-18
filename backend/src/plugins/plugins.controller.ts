import { Controller, Get, Post, Patch, Param, Body } from '@nestjs/common';
import { PluginsService } from './plugins.service';

@Controller('plugins')
export class PluginsController {
  constructor(private pluginsService: PluginsService) {}

  @Get()
  findAll() {
    return this.pluginsService.findAll();
  }

  // register MUST be declared before :id routes to prevent NestJS
  // from matching "register" as an id parameter
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
