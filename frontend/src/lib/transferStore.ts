import { create } from 'zustand'

export type TransferStatus = 'uploading' | 'downloading' | 'done' | 'error'

export interface Transfer {
  id: string
  filename: string
  direction: 'up' | 'down'
  status: TransferStatus
  bytesWritten: number
  total: number
  speed: number
  message?: string
  completedAt?: number
  abort?: () => void
}

interface TransferState {
  transfers: Transfer[]
  addTransfer: (t: Omit<Transfer, 'speed'>) => void
  updateTransfer: (id: string, patch: Partial<Transfer>) => void
  removeTransfer: (id: string) => void
}

export const useTransferStore = create<TransferState>((set) => ({
  transfers: [],
  addTransfer: (t) =>
    set((s) => ({ transfers: [...s.transfers, { ...t, speed: 0 }] })),
  updateTransfer: (id, patch) =>
    set((s) => ({
      transfers: s.transfers.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    })),
  removeTransfer: (id) =>
    set((s) => ({ transfers: s.transfers.filter((t) => t.id !== id) })),
}))
