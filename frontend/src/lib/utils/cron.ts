export function cronToHuman(cron: string): string {
  const parts = cron.trim().split(/\s+/)
  if (parts.length !== 5) return `Custom schedule (${cron})`
  const [minute, hour, dayOfMonth, , dayOfWeek] = parts

  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const pad = (n: string) => n.padStart(2, '0')
  const toTime = (h: string, m: string) => {
    const hNum = parseInt(h)
    const period = hNum >= 12 ? 'PM' : 'AM'
    const h12 = hNum % 12 || 12
    return `${h12}:${pad(m)} ${period}`
  }

  // Every minute
  if (cron === '* * * * *') return 'Every minute'

  // Every hour: 0 * * * *
  if (minute === '0' && hour === '*' && dayOfMonth === '*' && dayOfWeek === '*')
    return 'Every hour'

  // Every N minutes: */N * * * *
  const everyNMin = minute.match(/^\*\/(\d+)$/)
  if (everyNMin && hour === '*' && dayOfMonth === '*' && dayOfWeek === '*')
    return `Every ${everyNMin[1]} minutes`

  // Every N hours: 0 */N * * *
  const everyNHour = hour.match(/^\*\/(\d+)$/)
  if (minute === '0' && everyNHour && dayOfMonth === '*' && dayOfWeek === '*')
    return `Every ${everyNHour[1]} hours`

  // Weekdays: 0 9 * * 1-5
  if (dayOfMonth === '*' && dayOfWeek === '1-5' && !minute.includes('*') && !hour.includes('*'))
    return `Weekdays at ${toTime(hour, minute)}`

  // Specific weekday: 0 9 * * 1
  const weekdayNum = parseInt(dayOfWeek)
  if (
    dayOfMonth === '*' &&
    !isNaN(weekdayNum) &&
    weekdayNum >= 0 &&
    weekdayNum <= 6 &&
    !minute.includes('*') &&
    !hour.includes('*')
  )
    return `Every ${days[weekdayNum]} at ${toTime(hour, minute)}`

  // Day of month: 0 9 1 * *
  const domNum = parseInt(dayOfMonth)
  if (
    !isNaN(domNum) &&
    dayOfWeek === '*' &&
    !minute.includes('*') &&
    !hour.includes('*')
  ) {
    const suffix = domNum === 1 ? 'st' : domNum === 2 ? 'nd' : domNum === 3 ? 'rd' : 'th'
    return `On the ${domNum}${suffix} of every month at ${toTime(hour, minute)}`
  }

  // Every day: 0 9 * * *
  if (dayOfMonth === '*' && dayOfWeek === '*' && !minute.includes('*') && !hour.includes('*'))
    return `Every day at ${toTime(hour, minute)}`

  return `Custom schedule (${cron})`
}

export function cronMatchesDay(cron: string, date: Date): boolean {
  const parts = cron.trim().split(/\s+/)
  if (parts.length !== 5) return true // unknown → assume recurring

  const [, hour, dayOfMonth, , dayOfWeek] = parts
  const d = date.getDate()
  const dow = date.getDay() // 0=Sun

  // Every minute / every hour / every N minutes → show on all days
  if (hour === '*') return true

  // Specific day of month
  const domNum = parseInt(dayOfMonth)
  if (!isNaN(domNum) && dayOfMonth !== '*') return d === domNum

  // Weekday range 1-5
  if (dayOfWeek === '1-5') return dow >= 1 && dow <= 5

  // Specific weekday
  const dowNum = parseInt(dayOfWeek)
  if (!isNaN(dowNum) && dayOfWeek !== '*') return dow === dowNum

  // Every day (* * *)
  return true
}
