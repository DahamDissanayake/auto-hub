import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn,
} from 'typeorm';

export type PluginStatus = 'active' | 'inactive' | 'error';

export interface ConfigSchemaItem {
  key: string;
  label: string;
  type: string;
  secret?: boolean;
  required?: boolean;
}

@Entity('plugins')
export class Plugin {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  slug: string;

  @Column()
  name: string;

  @Column({ default: '' })
  description: string;

  @Column({ default: '⚙️' })
  icon: string;

  @Column({ default: 'utility' })
  category: string;

  @Column({ default: '1.0.0' })
  version: string;

  @Column({ default: 'index.js' })
  entryFile: string;

  @Column({ type: 'varchar', default: 'inactive' })
  status: PluginStatus;

  @Column({ type: 'jsonb', default: {} })
  config: Record<string, unknown>;

  @Column({ type: 'jsonb', default: [] })
  configSchema: ConfigSchemaItem[];

  @Column({ type: 'timestamp', nullable: true })
  lastRunAt: Date;

  @Column({ nullable: true })
  lastRunStatus: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
