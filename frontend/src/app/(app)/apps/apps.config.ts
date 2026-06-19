export interface AppEntry {
  id: string
  name: string
  description: string
  url: string
  iconPath?: string  // relative to /public, e.g. "/img/icons/foo.png"
  color?: string     // hex accent, defaults to #3b82f6
}

export const apps: AppEntry[] = []
