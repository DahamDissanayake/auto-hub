export type PluginStatus = 'active' | 'inactive' | 'error'
export type ExecutionStatus = 'running' | 'success' | 'failed'
export type TriggerType = 'manual' | 'scheduled'

export interface ConfigSchemaItem {
  key: string
  label: string
  type: string
  secret?: boolean
  required?: boolean
}

export interface PluginAction {
  key: string
  label: string
  danger?: boolean
}

export interface Plugin {
  id: string
  slug: string
  name: string
  description: string
  icon: string
  category: string
  version: string
  entryFile: string
  status: PluginStatus
  config: Record<string, unknown>
  configSchema: ConfigSchemaItem[]
  actions: PluginAction[]
  requiresPassword: boolean
  lastRunAt: string | null
  lastRunStatus: string | null
  createdAt: string
  updatedAt: string
}

export interface PluginExecution {
  id: string
  pluginId: string
  plugin?: Plugin
  status: ExecutionStatus
  output: string | null
  error: string | null
  triggeredBy: TriggerType
  durationMs: number | null
  startedAt: string
  finishedAt: string | null
}

export interface ScheduledJob {
  id: string
  pluginId: string
  name: string
  cron: string
  enabled: boolean
  nextRunAt: string | null
  lastRunAt: string | null
  createdAt: string
}

export interface N8nWorkflow {
  id: string
  name: string
  active: boolean
  createdAt?: string
  updatedAt?: string
}

export interface DashboardStats {
  totalPlugins: number
  activePlugins: number
  errorPlugins: number
  activeSchedules: number
  totalSchedules: number
  n8nWorkflows: number
  recentSuccessRuns: number
  recentFailedRuns: number
}

export interface DashboardData {
  stats: DashboardStats
  recentActivity: PluginExecution[]
  upcomingSchedules: ScheduledJob[]
  n8nWorkflows: N8nWorkflow[]
  plugins: Plugin[]
}

export interface CalendarData {
  schedules: ScheduledJob[]
  n8nWorkflows: N8nWorkflow[]
}

export interface HealthData {
  status: string
  version: string
  nodeVersion: string
  timezone: string
  pluginDir: string
  telegramConfigured: boolean
  n8nConfigured: boolean
}
