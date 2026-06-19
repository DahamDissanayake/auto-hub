import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class RealIpThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    const headers = req['headers'] as Record<string, string | string[] | undefined>;
    const realIp = headers['x-real-ip'];
    if (realIp && typeof realIp === 'string') return realIp;
    const forwarded = headers['x-forwarded-for'];
    if (forwarded) {
      const first = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
      if (first) return first.trim();
    }
    return (req['ip'] as string) ?? 'unknown';
  }
}
