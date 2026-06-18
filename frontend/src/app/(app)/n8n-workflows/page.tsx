'use client'
import { GitBranch, ExternalLink, Info } from 'lucide-react'
import StatusBadge from '@/components/ui/StatusBadge'
import {
  useN8nWorkflows,
  useActivateWorkflow,
  useDeactivateWorkflow,
} from '@/lib/hooks/useN8nWorkflows'
import { useToast } from '@/components/ui/Toast'

export default function N8nWorkflowsPage() {
  const { data: workflows, isLoading, error } = useN8nWorkflows()
  const activate = useActivateWorkflow()
  const deactivate = useDeactivateWorkflow()
  const toast = useToast()

  const isN8nKeyError =
    error &&
    (error as any)?.response?.status === 503

  const handleToggle = async (id: string, active: boolean) => {
    try {
      if (active) {
        await deactivate.mutateAsync(id)
        toast.success('Workflow deactivated')
      } else {
        await activate.mutateAsync(id)
        toast.success('Workflow activated')
      }
    } catch {
      toast.error('Failed to update workflow')
    }
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <h1 className="text-white text-xl font-semibold flex items-center gap-2">
        <GitBranch size={20} className="text-[#3b82f6]" />
        n8n Workflows
      </h1>

      {/* Info banner */}
      <div className="flex items-start gap-3 p-4 bg-[#3b82f6]/5 border border-[#3b82f6]/20 rounded-lg">
        <Info size={16} className="text-[#3b82f6] mt-0.5 shrink-0" />
        <p className="text-[#9ca3af] text-sm">
          n8n is fully accessible at{' '}
          <a href="/n8n" target="_blank" rel="noreferrer" className="text-[#3b82f6] hover:underline">
            /n8n
          </a>
          . Use this page to manage which workflows are active and monitor them from your dashboard.
        </p>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center h-40">
          <div className="text-[#6b7280] text-sm">Loading workflows…</div>
        </div>
      )}

      {isN8nKeyError && (
        <div className="p-6 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg space-y-3">
          <p className="text-[#f59e0b] font-medium text-sm">n8n API key not configured</p>
          <ol className="text-[#9ca3af] text-sm space-y-1 list-decimal list-inside">
            <li>
              Open n8n at{' '}
              <a href="/n8n" target="_blank" rel="noreferrer" className="text-[#3b82f6] hover:underline">
                /n8n
              </a>
            </li>
            <li>Go to Settings → API → Create API Key</li>
            <li>
              Add it to your <code className="text-[#f1f1f1]">.env</code> file as{' '}
              <code className="text-[#f1f1f1]">N8N_API_KEY=your-key</code>
            </li>
            <li>
              Restart the backend: <code className="text-[#f1f1f1]">docker compose restart backend</code>
            </li>
          </ol>
        </div>
      )}

      {!isLoading && !error && (!workflows || workflows.length === 0) && (
        <div className="text-[#6b7280] text-sm p-8 text-center border border-[#2a2a2a] rounded-lg">
          No workflows found. Create one in the{' '}
          <a href="/n8n" className="text-[#3b82f6] hover:underline">
            n8n editor
          </a>
          .
        </div>
      )}

      {workflows && workflows.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {workflows.map(wf => (
            <div
              key={wf.id}
              className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-4 space-y-3 hover:border-[#3b82f6]/40 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-white font-medium text-sm leading-tight">{wf.name}</h3>
                <StatusBadge status={wf.active ? 'active' : 'inactive'} />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => handleToggle(wf.id, wf.active)}
                  disabled={activate.isPending || deactivate.isPending}
                  className="flex-1 text-xs py-1.5 rounded-md border border-[#2a2a2a] text-[#9ca3af] hover:border-[#3b82f6] hover:text-[#f1f1f1] disabled:opacity-50 transition-colors"
                >
                  {wf.active ? 'Deactivate' : 'Activate'}
                </button>
                <a
                  href="/n8n"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-md border border-[#2a2a2a] text-[#9ca3af] hover:border-[#3b82f6] hover:text-[#f1f1f1] transition-colors"
                >
                  <ExternalLink size={11} />
                  Open
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
