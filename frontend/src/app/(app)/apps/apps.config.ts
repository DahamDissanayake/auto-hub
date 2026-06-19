export interface AppEntry {
  id: string
  name: string
  description: string
  url: string
  iconPath?: string  // relative to /public, e.g. "/img/icons/foo.png"
  color?: string     // hex accent, defaults to #3b82f6
}

export const apps: AppEntry[] = [
  {
    id: 'claude-terminal',
    name: 'Claude Code Terminal',
    description: 'Browser terminal on the Raspberry Pi — run Claude Code and shell commands from any device.',
    url: '/terminal',
    color: '#10b981',
  },
]
