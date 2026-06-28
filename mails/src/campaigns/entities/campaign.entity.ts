import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export type CampaignStatus = 'draft' | 'scheduled' | 'sending' | 'paused' | 'completed';

@Entity()
export class Campaign {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column()
  fromAccountId: number;

  @Column()
  subject: string;

  @Column('text')
  bodyHtml: string;

  @Column({ default: 'draft' })
  status: CampaignStatus;

  @Column({ type: 'datetime', nullable: true })
  scheduledAt: Date | null;

  @Column({ nullable: true })
  ratePerHour: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
