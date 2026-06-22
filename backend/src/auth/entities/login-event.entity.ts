import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Device } from './device.entity';

export enum LoginEventType {
  PASSWORD_OK    = 'password_ok',
  PASSWORD_FAIL  = 'password_fail',
  OTP_SENT       = 'otp_sent',
  OTP_OK         = 'otp_ok',
  OTP_FAIL       = 'otp_fail',
  OTP_LOCKED     = 'otp_locked',
  SESSION_ISSUED = 'session_issued',
  LOGOUT         = 'logout',
  REVOKED        = 'revoked',
}

@Entity('login_events')
export class LoginEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  deviceId: string;

  @ManyToOne(() => Device, { nullable: true, onDelete: 'SET NULL', eager: false })
  @JoinColumn({ name: 'deviceId' })
  device: Device | null;

  @Column()
  ip: string;

  @Column({ nullable: true })
  browser: string;

  @Column({ nullable: true })
  os: string;

  @Column({ type: 'text' })
  eventType: LoginEventType;

  @CreateDateColumn()
  createdAt: Date;
}
