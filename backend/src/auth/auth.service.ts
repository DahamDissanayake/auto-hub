import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { timingSafeEqual } from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private config: ConfigService,
  ) {}

  async login(password: string): Promise<{ access_token: string }> {
    const adminPassword = this.config.get<string>('ADMIN_PASSWORD') ?? '';
    let isValid = false;
    if (adminPassword.startsWith('$2')) {
      isValid = await bcrypt.compare(password, adminPassword);
    } else {
      // timingSafeEqual prevents timing oracle attacks on plaintext passwords
      const a = Buffer.from(password);
      const b = Buffer.from(adminPassword);
      isValid = a.length === b.length && timingSafeEqual(a, b);
    }
    if (!isValid) {
      throw new UnauthorizedException('Invalid password');
    }
    return { access_token: this.jwtService.sign({ sub: 'admin' }) };
  }
}
