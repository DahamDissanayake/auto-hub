import {
  Controller, Post, Get, Patch, Delete,
  Body, Param, HttpCode, Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { Public } from './decorators/public.decorator';
import { LoginDto } from './dto/login.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { RefreshDto } from './dto/refresh.dto';
import { DeviceUpdateDto } from './dto/device-update.dto';

function clientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return (Array.isArray(fwd) ? fwd[0] : fwd.split(',')[0]).trim();
  return req.ip ?? 'unknown';
}

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  @Public()
  @HttpCode(200)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.authService.login(dto, clientIp(req), req.headers['user-agent'] ?? '');
  }

  @Post('otp/verify')
  @Public()
  @HttpCode(200)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  async verifyOtp(@Body() dto: VerifyOtpDto, @Req() req: Request) {
    return this.authService.verifyOtp(dto, clientIp(req), req.headers['user-agent'] ?? '');
  }

  @Post('refresh')
  @Public()
  @HttpCode(200)
  async refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto.sessionToken);
  }

  @Post('logout')
  @Public()
  @HttpCode(200)
  async logout(@Body() body: { sessionToken: string }, @Req() req: Request) {
    await this.authService.logout(body.sessionToken, clientIp(req), req.headers['user-agent'] ?? '');
  }

  @Post('logout-all')
  @HttpCode(200)
  async logoutAll(@Req() req: Request) {
    await this.authService.logoutAll(clientIp(req), req.headers['user-agent'] ?? '');
  }

  @Get('sessions')
  async getSessions(@Req() req: Request) {
    const page = parseInt((req.query['page'] as string) ?? '1', 10);
    const limit = parseInt((req.query['limit'] as string) ?? '20', 10);
    return this.authService.getSessions(page, Math.min(limit, 100));
  }

  @Patch('devices/:id')
  async updateDevice(@Param('id') id: string, @Body() dto: DeviceUpdateDto) {
    return this.authService.updateDevice(id, dto.isPermanent);
  }

  @Delete('sessions/:deviceId')
  @HttpCode(200)
  async revokeSession(@Param('deviceId') deviceId: string, @Req() req: Request) {
    await this.authService.revokeSession(deviceId, clientIp(req), req.headers['user-agent'] ?? '');
  }
}
