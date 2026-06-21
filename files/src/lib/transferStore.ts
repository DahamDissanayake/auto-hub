import { EventEmitter } from 'events'

export interface TransferEvent {
  transferId: string
  bytesWritten?: number
  total?: number
  status: 'uploading' | 'done' | 'error'
  message?: string
}

class TransferBus extends EventEmitter {}
export const transferStore = new TransferBus()
