import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
} from 'typeorm';

@Entity('scheduled_jobs')
export class ScheduledJob {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  pluginId: string;

  @Column()
  name: string;

  @Column()
  cron: string;

  @Column({ default: true })
  enabled: boolean;

  @Column({ type: 'timestamp', nullable: true })
  nextRunAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  lastRunAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
