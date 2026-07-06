export interface GmailAccount {
  id: number
  email: string
  displayName: string
  smtpUser: string | null
  signature: string | null
  isDefault: boolean
  createdAt: string
}

export interface CampaignStats {
  total: number
  sent: number
  failed: number
  opened: number
  replied: number
}

export interface Campaign {
  id: number
  name: string
  fromAccountId: number
  subject: string
  bodyHtml: string
  status: 'draft' | 'scheduled' | 'sending' | 'paused' | 'completed'
  scheduledAt: string | null
  ratePerHour: number | null
  createdAt: string
  updatedAt: string
  stats?: CampaignStats
}

export interface Contact {
  id: number
  campaignId: number
  firstName: string | null
  lastName: string | null
  email: string
  company: string | null
}

export interface SendLog {
  id: number
  campaignId: number
  contactId: number
  contact: Contact
  status: 'pending' | 'sent' | 'failed'
  messageId: string | null
  sentAt: string | null
  openedAt: string | null
  repliedAt: string | null
  error: string | null
}

export interface CreateCampaignPayload {
  name: string
  fromAccountId: number
  subject: string
  bodyHtml: string
  scheduledAt?: string
  ratePerHour?: number
}

export interface MappedContact {
  firstName?: string
  lastName?: string
  email: string
  company?: string
}
