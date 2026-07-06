import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity()
export class GmailAccount {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  email: string;

  @Column()
  displayName: string;

  @Column()
  appPassword: string;

  @Column({ nullable: true })
  smtpUser: string | null;

  @Column({ type: 'text', nullable: true })
  signature: string | null;

  @Column({ default: false })
  isDefault: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
