import api from '@/lib/api'
import type { GmailAccount, Campaign, SendLog, CreateCampaignPayload, MappedContact } from './types'

const B = '/mails-api'

export const mailsApi = {
  // Accounts
  getAccounts: (): Promise<GmailAccount[]> =>
    api.get(`${B}/accounts`).then(r => r.data),
  createAccount: (body: { email: string; displayName: string; appPassword: string; smtpUser?: string; signature?: string; isDefault?: boolean }) =>
    api.post(`${B}/accounts`, body).then(r => r.data),
  updateAccount: (id: number, body: { displayName?: string; email?: string; appPassword?: string; smtpUser?: string; signature?: string; isDefault?: boolean }) =>
    api.patch(`${B}/accounts/${id}`, body).then(r => r.data),
  setDefaultAccount: (id: number) =>
    api.patch(`${B}/accounts/${id}/default`).then(r => r.data),
  deleteAccount: (id: number) =>
    api.delete(`${B}/accounts/${id}`).then(r => r.data),

  // Campaigns
  getCampaigns: (): Promise<Campaign[]> =>
    api.get(`${B}/campaigns`).then(r => r.data),
  getCampaign: (id: number): Promise<Campaign> =>
    api.get(`${B}/campaigns/${id}`).then(r => r.data),
  createCampaign: (body: CreateCampaignPayload): Promise<Campaign> =>
    api.post(`${B}/campaigns`, body).then(r => r.data),
  addContacts: (campaignId: number, contacts: MappedContact[]) =>
    api.post(`${B}/campaigns/${campaignId}/contacts`, contacts).then(r => r.data),
  launchCampaign: (id: number) =>
    api.post(`${B}/campaigns/${id}/launch`).then(r => r.data),
  pauseCampaign: (id: number) =>
    api.post(`${B}/campaigns/${id}/pause`).then(r => r.data),
  resumeCampaign: (id: number) =>
    api.post(`${B}/campaigns/${id}/resume`).then(r => r.data),
  retryFailed: (id: number) =>
    api.post(`${B}/campaigns/${id}/retry-failed`).then(r => r.data),
  deleteCampaign: (id: number) =>
    api.delete(`${B}/campaigns/${id}`).then(r => r.data),
  getLogs: (campaignId: number): Promise<SendLog[]> =>
    api.get(`${B}/campaigns/${campaignId}/logs`).then(r => r.data),

  // Template
  templateUrl: `${B}/template/contacts.xlsx`,
}
