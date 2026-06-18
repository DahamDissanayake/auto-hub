import { describe, it, expect } from 'vitest'
import { cronToHuman, cronMatchesDay } from './cron'

describe('cronToHuman', () => {
  it('converts every minute', () => {
    expect(cronToHuman('* * * * *')).toBe('Every minute')
  })

  it('converts every hour', () => {
    expect(cronToHuman('0 * * * *')).toBe('Every hour')
  })

  it('converts every day at 9am', () => {
    expect(cronToHuman('0 9 * * *')).toBe('Every day at 9:00 AM')
  })

  it('converts every Monday at 9am', () => {
    expect(cronToHuman('0 9 * * 1')).toBe('Every Monday at 9:00 AM')
  })

  it('converts 1st of month at 9am', () => {
    expect(cronToHuman('0 9 1 * *')).toBe('On the 1st of every month at 9:00 AM')
  })

  it('converts weekdays at 9am', () => {
    expect(cronToHuman('0 9 * * 1-5')).toBe('Weekdays at 9:00 AM')
  })

  it('converts every 5 minutes', () => {
    expect(cronToHuman('*/5 * * * *')).toBe('Every 5 minutes')
  })

  it('converts every 6 hours', () => {
    expect(cronToHuman('0 */6 * * *')).toBe('Every 6 hours')
  })

  it('returns custom for unknown patterns', () => {
    expect(cronToHuman('*/15 */2 * * *')).toBe('Custom schedule (*/15 */2 * * *)')
  })
})

describe('cronMatchesDay', () => {
  it('matches every day cron on any day', () => {
    const monday = new Date(2026, 0, 5) // Monday Jan 5 2026
    expect(cronMatchesDay('0 9 * * *', monday)).toBe(true)
  })

  it('matches specific weekday cron', () => {
    const monday = new Date(2026, 0, 5) // Monday
    const tuesday = new Date(2026, 0, 6) // Tuesday
    expect(cronMatchesDay('0 9 * * 1', monday)).toBe(true)
    expect(cronMatchesDay('0 9 * * 1', tuesday)).toBe(false)
  })

  it('matches specific day of month', () => {
    const jan5 = new Date(2026, 0, 5)
    const jan6 = new Date(2026, 0, 6)
    expect(cronMatchesDay('0 9 5 * *', jan5)).toBe(true)
    expect(cronMatchesDay('0 9 5 * *', jan6)).toBe(false)
  })

  it('matches weekdays 1-5 on weekdays', () => {
    const monday = new Date(2026, 0, 5)
    const saturday = new Date(2026, 0, 10)
    expect(cronMatchesDay('0 9 * * 1-5', monday)).toBe(true)
    expect(cronMatchesDay('0 9 * * 1-5', saturday)).toBe(false)
  })
})
