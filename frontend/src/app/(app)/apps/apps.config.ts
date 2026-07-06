export interface AppEntry {
  id: string
  name: string
  description: string
  url: string
  iconPath?: string   // relative to /public, e.g. "/img/icons/foo.png"
  lucideIcon?: string // lucide-react icon name, e.g. 'Terminal'
  color?: string      // hex accent, defaults to #3b82f6
}

export const apps: AppEntry[] = [
  {
    id: 'claude-terminal',
    name: 'Code Terminal',
    description: 'Browser terminal on the Raspberry Pi — run Claude Code and shell commands from any device.',
    url: '/terminal',
    lucideIcon: 'Terminal',
    color: '#10b981',
  },
  {
    id: 'docker-monitor',
    name: 'System/Containers',
    description: 'Real-time system stats (CPU, RAM, disk, network) and container health for the Raspberry Pi.',
    url: '/docker',
    lucideIcon: 'Container',
    color: '#3b82f6',
  },
  {
    id: 'files',
    name: 'Files',
    description: 'Browse, upload, and download files across internal storage and the data drive.',
    url: '/files',
    lucideIcon: 'FolderOpen',
    color: '#f59e0b',
  },
  {
    id: 'mails',
    name: 'Mail Campaigns',
    description: 'Outreach email campaigns — import contacts from Excel, personalise with merge tags, send via Gmail SMTP, track opens and replies.',
    url: '/mails',
    lucideIcon: 'Mail',
    color: '#8b5cf6',
  },
]
