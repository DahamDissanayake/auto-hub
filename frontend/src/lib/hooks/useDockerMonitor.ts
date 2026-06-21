'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import api from '../api'
import type { SystemMetrics, ContainerInfo, SpeedTestResult } from '../types'

export function useDockerMonitor() {
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null)
  const [containers, setContainers] = useState<ContainerInfo[]>([])
  const [metricsLoading, setMetricsLoading] = useState(true)
  const [containersLoading, setContainersLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [speedTestLoading, setSpeedTestLoading] = useState(false)
  const [speedTestResult, setSpeedTestResult] = useState<SpeedTestResult | null>(null)
  const [speedTestError, setSpeedTestError] = useState<string | null>(null)

  const metricsTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const containersTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchMetrics = useCallback(async () => {
    try {
      const { data } = await api.get<SystemMetrics>('/api/docker/metrics')
      setMetrics(data)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load metrics')
    } finally {
      setMetricsLoading(false)
    }
  }, [])

  const fetchContainers = useCallback(async () => {
    try {
      const { data } = await api.get<ContainerInfo[]>('/api/docker/containers')
      setContainers(data)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load containers')
    } finally {
      setContainersLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchMetrics()
    void fetchContainers()

    metricsTimerRef.current = setInterval(() => void fetchMetrics(), 8000)
    containersTimerRef.current = setInterval(() => void fetchContainers(), 10000)

    return () => {
      if (metricsTimerRef.current) clearInterval(metricsTimerRef.current)
      if (containersTimerRef.current) clearInterval(containersTimerRef.current)
    }
  }, [fetchMetrics, fetchContainers])

  const containerAction = useCallback(
    async (id: string, action: 'restart' | 'stop' | 'start') => {
      setActionLoading(`${action}:${id}`)
      try {
        await api.post(`/api/docker/containers/${id}/${action}`)
        await new Promise((r) => setTimeout(r, 1500))
        await fetchContainers()
      } finally {
        setActionLoading(null)
      }
    },
    [fetchContainers],
  )

  const systemAction = useCallback(
    async (action: 'restart-all' | 'stop-all') => {
      setActionLoading(action)
      try {
        await api.post(`/api/docker/system/${action}`)
        await new Promise((r) => setTimeout(r, 2000))
        await fetchContainers()
      } finally {
        setActionLoading(null)
      }
    },
    [fetchContainers],
  )

  const runSpeedTest = useCallback(async () => {
    setSpeedTestLoading(true)
    setSpeedTestError(null)
    setSpeedTestResult(null)
    try {
      const { data } = await api.post<SpeedTestResult>('/api/docker/speed-test', undefined, {
        timeout: 95_000,
      })
      setSpeedTestResult(data)
    } catch (e) {
      setSpeedTestError(e instanceof Error ? e.message : 'Speed test failed')
    } finally {
      setSpeedTestLoading(false)
    }
  }, [])

  return {
    metrics,
    containers,
    metricsLoading,
    containersLoading,
    error,
    actionLoading,
    speedTestLoading,
    speedTestResult,
    speedTestError,
    refetchContainers: fetchContainers,
    containerAction,
    systemAction,
    runSpeedTest,
  }
}
