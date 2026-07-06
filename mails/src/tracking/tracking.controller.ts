import { Controller, Get, Param, Req, Res } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Request, Response } from 'express';
import { Public } from '../auth/public.decorator';
import { SendLog } from '../campaigns/entities/send-log.entity';

const TRANSPARENT_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64',
);

// Gmail's web cache pre-fetches images at delivery using a specific ancient UA.
// The GoogleImageProxy UA (mobile) fires when the user actually opens on mobile —
// so we only filter the web-cache delivery bot, not GoogleImageProxy itself.
function isDeliveryBot(ua: string): boolean {
  const u = ua.toLowerCase();
  // Chrome/42 + Edge/12 is Gmail's web delivery cache — fires in seconds, not a human open
  return u.includes('chrome/42.') && u.includes('edge/12.');
}

@Controller('track')
export class TrackingController {
  constructor(
    @InjectRepository(SendLog) private logRepo: Repository<SendLog>,
  ) {}

  @Public()
  @Get('open/:logId.gif')
  async trackOpen(
    @Param('logId') rawId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const ua = req.get('user-agent') ?? '';
    const id = parseInt(rawId, 10);

    if (!isNaN(id) && !isDeliveryBot(ua)) {
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
