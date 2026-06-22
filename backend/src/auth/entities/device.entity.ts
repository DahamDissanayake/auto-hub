import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('devices')
export class Device {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  token: string;

  @Column({ nullable: true })
  name: string;

  @Column({ nullable: true })
  userAgent: string;

  @Column({ nullable: true })
  browser: string;

  @Column({ nullable: true })
  os: string;

  @Column({ nullable: true })
  ip: string;

  @Column({ default: false })
  isPermanent: boolean;

  @CreateDateColumn()
  firstSeen: Date;

  @UpdateDateColumn()
  lastSeen: Date;
}
