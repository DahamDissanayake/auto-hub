import AppShell from '@/components/layout/AppShell'
import { TimezoneProvider } from '@/lib/context/TimezoneContext'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <TimezoneProvider>
      <AppShell>{children}</AppShell>
    </TimezoneProvider>
  )
}
