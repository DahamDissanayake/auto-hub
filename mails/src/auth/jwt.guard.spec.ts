import { JwtGuard } from './jwt.guard';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { IS_PUBLIC_KEY } from './public.decorator';

function makeContext(authHeader?: string, isPublic = false): ExecutionContext {
  const reflector = { getAllAndOverride: jest.fn().mockReturnValue(isPublic) } as any;
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers: { authorization: authHeader } }) }),
    getHandler: jest.fn(),
    getClass: jest.fn(),
    _reflector: reflector,
  } as any;
}

describe('JwtGuard', () => {
  let guard: JwtGuard;
  const secret = 'test-secret';

  beforeEach(() => {
    const jwtService = new JwtService({ secret });
    const configService = { get: jest.fn().mockReturnValue(secret) } as any;
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(false) } as any;
    guard = new JwtGuard(jwtService, configService, reflector);
  });

  it('throws UnauthorizedException when no Authorization header', async () => {
    const ctx = makeContext(undefined);
    // Inject reflector returning false
    (guard as any).reflector = { getAllAndOverride: jest.fn().mockReturnValue(false) };
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException with invalid token', async () => {
    const ctx = makeContext('Bearer bad.token.here');
    (guard as any).reflector = { getAllAndOverride: jest.fn().mockReturnValue(false) };
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('returns true with a valid token', async () => {
    const jwtService = new JwtService({ secret });
    const token = jwtService.sign({ sub: 1 });
    const ctx = makeContext(`Bearer ${token}`);
    (guard as any).reflector = { getAllAndOverride: jest.fn().mockReturnValue(false) };
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('returns true for @Public() routes without checking token', async () => {
    const ctx = makeContext(undefined);
    (guard as any).reflector = { getAllAndOverride: jest.fn().mockReturnValue(true) };
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });
});
