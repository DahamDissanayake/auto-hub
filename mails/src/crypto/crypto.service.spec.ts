import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { CryptoService } from './crypto.service';

describe('CryptoService', () => {
  let service: CryptoService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true })],
      providers: [CryptoService],
    }).compile();
    service = module.get(CryptoService);
  });

  it('round-trips plaintext through encrypt and decrypt', () => {
    const text = 'my-app-password-1234 !@#$';
    const encrypted = service.encrypt(text);
    expect(encrypted).not.toBe(text);
    expect(service.decrypt(encrypted)).toBe(text);
  });

  it('produces different ciphertext each call (random IV)', () => {
    const a = service.encrypt('same');
    const b = service.encrypt('same');
    expect(a).not.toBe(b);
  });

  it('decrypt throws on tampered ciphertext', () => {
    const encrypted = service.encrypt('hello');
    const tampered = encrypted.slice(0, -4) + 'XXXX';
    expect(() => service.decrypt(tampered)).toThrow();
  });
});
