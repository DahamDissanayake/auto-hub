import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, ManyToOne, JoinColumn,
} from 'typeorm';
import { Plugin } from './plugin.entity';

export type ExecutionStatus = 'running' | 'success' | 'failed';
export type TriggerType = 'manual' | 'scheduled';

@Entity('plugin_executions')
export class PluginExecution {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  pluginId: string;

  @ManyToOne(() => Plugin, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'pluginId' })
  plugin: Plugin;

  @Column({ type: 'varchar', default: 'running' })
  status: ExecutionStatus;

  @Column({ type: 'text', nullable: true })
  output: string;

  @Column({ type: 'text', nullable: true })
  error: string;

  @Column({ type: 'varchar', default: 'manual' })
  triggeredBy: TriggerType;

  @Column({ nullable: true })
  durationMs: number;

  @CreateDateColumn()
  startedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  finishedAt: Date;
}
