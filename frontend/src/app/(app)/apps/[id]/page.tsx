import { notFound } from 'next/navigation'
import { apps } from '../apps.config'
import TerminalPage from '../../terminal/page'
import DockerMonitorPage from '../../docker/page'
import FilesPage from '../../files/page'
import AppVisitRecorder from './AppVisitRecorder'

const INTERNAL_PAGES: Record<string, React.ComponentType> = {
  'claude-terminal': TerminalPage as React.ComponentType,
  'docker-monitor': DockerMonitorPage as React.ComponentType,
  'files': FilesPage as React.ComponentType,
}

export default function AppPage({ params }: { params: { id: string } }) {
  const app = apps.find(a => a.id === params.id)
  if (!app) return notFound()

  const InternalPage = INTERNAL_PAGES[app.id]
  if (InternalPage) {
    return (
      <>
        <AppVisitRecorder id={app.id} />
        <InternalPage />
      </>
    )
  }

  return (
    <>
      <AppVisitRecorder id={app.id} />
      <iframe
        src={app.url}
        className="-m-4 md:-m-6 lg:-m-8 w-[calc(100%+2rem)] md:w-[calc(100%+3rem)] lg:w-[calc(100%+4rem)] h-[calc(100dvh-57px)] md:h-[calc(100dvh-0px)] border-0"
        title={app.name}
        allow="fullscreen"
      />
    </>
  )
}
