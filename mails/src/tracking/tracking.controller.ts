import { Controller, Get, Param, Res } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Response } from 'express';
import { Public } from '../auth/public.decorator';
import { SendLog } from '../campaigns/entities/send-log.entity';

const TRANSPARENT_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64',
);

@Controller('track')
export class TrackingController {
  constructor(
    @InjectRepository(SendLog) private logRepo: Repository<SendLog>,
  ) {}

  @Public()
  @Get('open/:logId.gif')
  async trackOpen(@Param('logId') rawId: string, @Res() res: Response) {
    const id = parseInt(rawId, 10);
    if (!isNaN(id)) {
      const log = await this.logRepo.findOneBy({ id });
      if (log && !log.openedAt) {
        await this.logRepo.update(id, { openedAt: new Date() });
      }
    }
    res.setHeader('Content-Type', 'image/gif');
    res.setHeader('Cache-Control', 'no-store, no-cache');
    res.send(TRANSPARENT_GIF);
  }
}
