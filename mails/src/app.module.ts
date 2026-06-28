import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_GUARD } from '@nestjs/core';
import { JwtGuard } from './auth/jwt.guard';
import { CryptoModule } from './crypto/crypto.module';
import { AccountsModule } from './accounts/accounts.module';
import { GmailAccount } from './accounts/entities/gmail-account.entity';
import { Campaign } from './campaigns/entities/campaign.entity';
import { Contact } from './campaigns/entities/contact.entity';
import { SendLog } from './campaigns/entities/send-log.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
      }),
      inject: [ConfigService],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        type: 'better-sqlite3',
        database: config.get<string>('DB_PATH') ?? '/data/mails.db',
        entities: [GmailAccount, Campaign, Contact, SendLog],
        synchronize: true,
      }),
      inject: [ConfigService],
    }),
    CryptoModule,
    AccountsModule,
  ],
  providers: [
    JwtGuard,
    { provide: APP_GUARD, useClass: JwtGuard },
  ],
})
export class AppModule {}
