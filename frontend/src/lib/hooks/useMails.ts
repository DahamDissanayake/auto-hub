import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { mailsApi } from '@/lib/mails/api'
import type { MappedContact } from '@/lib/mails/types'

export function useAccounts() {
  return useQuery({ queryKey: ['mails', 'accounts'], queryFn: mailsApi.getAccounts })
}

export function useCreateAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: mailsApi.createAccount,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mails', 'accounts'] }),
  })
}

export function useSetDefaultAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: mailsApi.setDefaultAccount,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mails', 'accounts'] }),
  })
}

export function useDeleteAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: mailsApi.deleteAccount,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mails', 'accounts'] }),
  })
}

export function useCreateCampaign() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: mailsApi.createCampaign,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mails', 'campaigns'] }),
  })
}

export function useAddContacts() {
  return useMutation({
    mutationFn: ({ campaignId, contacts }: { campaignId: number; contacts: MappedContact[] }) =>
      mailsApi.addContacts(campaignId, contacts),
  })
}

export function useLaunchCampaign() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: mailsApi.launchCampaign,
    onSuccess: (_, id) => qc.invalidateQueries({ queryKey: ['mails', 'campaigns', id] }),
  })
}

export function useCampaigns() {
  return useQuery({ queryKey: ['mails', 'campaigns'], queryFn: mailsApi.getCampaigns })
}

export function useCampaign(id: number) {
  return useQuery({
    queryKey: ['mails', 'campaigns', id],
    queryFn: () => mailsApi.getCampaign(id),
    enabled: !!id,
  })
}

export function useLogs(campaignId: number) {
  return useQuery({
    queryKey: ['mails', 'logs', campaignId],
    queryFn: () => mailsApi.getLogs(campaignId),
    refetchInterval: 5000,
  })
}

export function usePauseCampaign() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: mailsApi.pauseCampaign,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mails', 'campaigns'] }),
  })
}

export function useResumeCampaign() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: mailsApi.resumeCampaign,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mails', 'campaigns'] }),
  })
}

export function useRetryFailed() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: mailsApi.retryFailed,
    onSuccess: (_, id) => qc.invalidateQueries({ queryKey: ['mails', 'logs', id] }),
  })
}
