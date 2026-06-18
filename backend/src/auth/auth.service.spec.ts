import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: JwtService,
          useValue: { sign: jest.fn().mockReturnValue('test-token') },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('testpassword') },
        },
      ],
    }).compile();
    service = module.get<AuthService>(AuthService);
  });

  it('returns access_token on correct plaintext password', async () => {
    const result = await service.login('testpassword');
    expect(result).toEqual({ access_token: 'test-token' });
  });

  it('throws UnauthorizedException on wrong password', async () => {
    await expect(service.login('wrongpassword')).rejects.toThrow(UnauthorizedException);
  });
});
