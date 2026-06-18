type BadgeStatus = 'success' | 'failed' | 'running' | 'active' | 'inactive' | 'error'

interface StatusBadgeProps {
  status: BadgeStatus
}

const styles: Record<BadgeStatus, string> = {
  success: 'bg-[#22c55e]/10 text-[#22c55e] border border-[#22c55e]/30',
  active: 'bg-[#22c55e]/10 text-[#22c55e] border border-[#22c55e]/30',
  failed: 'bg-[#ef4444]/10 text-[#ef4444] border border-[#ef4444]/30',
  error: 'bg-[#ef4444]/10 text-[#ef4444] border border-[#ef4444]/30',
  running: 'bg-[#f59e0b]/10 text-[#f59e0b] border border-[#f59e0b]/30',
  inactive: 'bg-[#6b7280]/10 text-[#6b7280] border border-[#6b7280]/30',
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${styles[status]}`}
      data-testid={`status-badge-${status}`}
    >
      {status}
    </span>
  )
}
