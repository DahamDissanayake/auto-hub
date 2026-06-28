import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Contact } from './contact.entity';

export type SendLogStatus = 'pending' | 'sent' | 'failed';

@Entity()
export class SendLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  campaignId: number;

  @Column()
  contactId: number;

  @ManyToOne(() => Contact, { eager: false, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'contactId' })
  contact: Contact;

  @Column({ default: 'pending' })
  status: SendLogStatus;

  @Column({ nullable: true })
  messageId: string;

  @Column({ type: 'datetime', nullable: true })
  sentAt: Date | null;

  @Column({ type: 'datetime', nullable: true })
  openedAt: Date | null;

  @Column({ type: 'datetime', nullable: true })
  repliedAt: Date | null;

  @Column({ nullable: true })
  error: string;
}
