import {
  Controller,
  Get,
  Post,
  Param,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { DockerService } from './docker.service';

@Controller('docker')
export class DockerController {
  constructor(private readonly dockerService: DockerService) {}

  @Get('metrics')
  async getMetrics() {
    try {
      return await this.dockerService.getSystemMetrics();
    } catch (err) {
      throw new HttpException(
        `Failed to get system metrics: ${String(err)}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('containers')
  async getContainers() {
    try {
      return await this.dockerService.getContainers();
    } catch (err) {
      throw new HttpException(
        `Failed to list containers: ${String(err)}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('containers/:id/restart')
  async restartContainer(@Param('id') id: string) {
    try {
      await this.dockerService.restartContainer(id);
      return { ok: true };
    } catch (err) {
      throw new HttpException(
        `Failed to restart container: ${String(err)}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('containers/:id/stop')
  async stopContainer(@Param('id') id: string) {
    try {
      await this.dockerService.stopContainer(id);
      return { ok: true };
    } catch (err) {
      throw new HttpException(
        `Failed to stop container: ${String(err)}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('containers/:id/start')
  async startContainer(@Param('id') id: string) {
    try {
      await this.dockerService.startContainer(id);
      return { ok: true };
    } catch (err) {
      throw new HttpException(
        `Failed to start container: ${String(err)}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('system/reboot')
  rebootSystem() {
    this.dockerService.rebootSystem();
    return { ok: true, message: 'System rebooting…' };
  }

  @Post('system/shutdown')
  shutdownSystem() {
    this.dockerService.shutdownSystem();
    return { ok: true, message: 'System shutting down…' };
  }
}
