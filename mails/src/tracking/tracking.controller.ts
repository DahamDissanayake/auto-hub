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

// Google proxies images at delivery time, not open time, producing false opens.
// Known signatures:
//   - UA contains "GoogleImageProxy" or "ggpht.com" (Gmail mobile proxy)
//   - UA contains "Chrome/42." + "Edge/12." (Gmail web cache bot)
function isGoogleProxy(ua: string): boolean {
  const u = ua.toLowerCase();
  return (
    u.includes('googleimageproxy') ||
    u.includes('ggpht.com') ||
    (u.includes('chrome/42.') && u.includes('edge/12.'))
  );
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

    if (!isNaN(id) && !isGoogleProxy(ua)) {
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
