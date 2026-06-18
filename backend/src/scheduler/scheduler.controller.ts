import { Controller, Get, Post, Delete, Patch, Param, Body } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';

@Controller('schedules')
export class SchedulerController {
  constructor(private schedulerService: SchedulerService) {}

  @Get()
  findAll() {
    return this.schedulerService.findAll();
  }

  @Post()
  create(@Body() body: { pluginId: string; name: string; cron: string }) {
    return this.schedulerService.create(body.pluginId, body.name, body.cron);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.schedulerService.remove(id);
  }

  @Patch(':id/toggle')
  toggle(@Param('id') id: string) {
    return this.schedulerService.toggle(id);
  }
}
