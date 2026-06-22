'use client'
import Image from 'next/image'
import { useState, FormEvent, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import axios from 'axios'
import { setAccessJwt } from '@/lib/api'

const base = process.env.NEXT_PUBLIC_API_URL ?? ''

type Step = 'password' | 'otp'

interface OtpError {
  reason: 'otp_invalid' | 'otp_locked' | 'otp_expired'
  attemptsRemaining?: number
  lockedUntil?: string
}

const OTP_RESEND_SEC = 30

export default function LoginPage() {
  const [step, setStep] = useState<Step>('password')
  const [password, setPassword] = useState('')
  const [otp, setOtp] = useState('')
  const [deviceToken, setDeviceToken] = useState<string | undefined>(undefined)
  const [error, setError] = useState('')
  const [otpError, setOtpError] = useState<OtpError | null>(null)
  const [loading, setLoading] = useState(false)
  const [resendCountdown, setResendCountdown] = useState(0)
  const otpRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  // Countdown timer for OTP resend
  useEffect(() => {
    if (resendCountdown <= 0) return
    const t = setTimeout(() => setResendCountdown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [resendCountdown])

  // Auto-focus OTP input when step changes
  useEffect(() => {
    if (step === 'otp') otpRef.current?.focus()
  }, [step])

  const handlePasswordSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const storedDevice = localStorage.getItem('autohub_device') ?? undefined
      const { data } = await axios.post(`${base}/api/auth/login`, { password, deviceToken: storedDevice })

      if (data.step === 'otp_required') {
        setDeviceToken(data.deviceToken)
        localStorage.setItem('autohub_device', data.deviceToken)
        setStep('otp')
        setResendCountdown(OTP_RESEND_SEC)
      } else {
        // Permanent device — session issued directly
        storeSession(data)
        router.replace('/')
      }
    } catch (err: any) {
      if (err.response?.status === 429) {
        const { lockedUntil } = err.response.data
        const until = new Date(lockedUntil)
        setError(`Too many attempts. Try again at ${until.toLocaleTimeString()}.`)
      } else {
        setError('Invalid password')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleOtpSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setOtpError(null)
    setLoading(true)
    try {
      const { data } = await axios.post(`${base}/api/auth/otp/verify`, { otp, deviceToken })
      storeSession(data)
      router.replace('/')
    } catch (err: any) {
      const body = err.response?.data ?? {}
      if (err.response?.status === 429) {
        setOtpError({ reason: 'otp_locked', lockedUntil: body.lockedUntil })
      } else if (body.reason === 'otp_invalid') {
        setOtpError({ reason: 'otp_invalid', attemptsRemaining: body.attemptsRemaining })
      } else {
        setOtpError({ reason: 'otp_expired' })
      }
    } finally {
      setLoading(false)
    }
  }

  const handleResend = () => {
    setOtp('')
    setOtpError(null)
    setStep('password')
  }

  function storeSession(data: { sessionToken: string; accessJwt: string; isPermanent: boolean }) {
    setAccessJwt(data.accessJwt)
    if (data.isPermanent) {
      localStorage.setItem('autohub_session', data.sessionToken)
    } else {
      sessionStorage.setItem('autohub_session', data.sessionToken)
      window.addEventListener('beforeunload', () => {
        navigator.sendBeacon(
          '/api/auth/logout',
          new Blob([JSON.stringify({ sessionToken: data.sessionToken })], { type: 'application/json' })
        )
      }, { once: true })
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg p-8">
          <div className="text-center mb-8">
            <Image
              src="/img/Base Logo - Light.png"
              alt="AutoHub logo"
              width={110}
              height={61}
              className="object-contain mx-auto"
              priority
            />
            <h1 className="text-white font-semibold text-xl mt-4">AutoHub</h1>
            <p className="text-[#6b7280] text-sm mt-1">Personal Automation OS</p>
          </div>

          {step === 'password' && (
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div>
                <label htmlFor="password" className="block text-sm text-[#9ca3af] mb-1">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  required
                  className="w-full bg-[#111111] border border-[#2a2a2a] rounded-md px-3 py-2 text-[#f1f1f1] text-sm focus:outline-none focus:border-[#3b82f6] transition-colors"
                />
              </div>
              {error && <p className="text-[#ef4444] text-sm" role="alert">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#3b82f6] text-white py-2 rounded-md text-sm font-medium hover:bg-[#2563eb] disabled:opacity-50 transition-colors"
              >
                {loading ? 'Checking…' : 'Continue'}
              </button>
            </form>
          )}

          {step === 'otp' && (
            <form onSubmit={handleOtpSubmit} className="space-y-4">
              <div className="text-center mb-2">
                <p className="text-[#9ca3af] text-sm">Check Telegram for your code</p>
                <p className="text-[#6b7280] text-xs mt-1">Expires in 5 minutes</p>
              </div>
              <div>
                <label htmlFor="otp" className="block text-sm text-[#9ca3af] mb-1">
                  6-digit code
                </label>
                <input
                  id="otp"
                  ref={otpRef}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, '').slice(0, 6)
                    setOtp(v)
                  }}
                  placeholder="123456"
                  required
                  className="w-full bg-[#111111] border border-[#2a2a2a] rounded-md px-3 py-2 text-[#f1f1f1] text-sm tracking-widest text-center focus:outline-none focus:border-[#3b82f6] transition-colors"
                />
              </div>
              {otpError?.reason === 'otp_invalid' && (
                <p className="text-[#ef4444] text-sm" role="alert">
                  Incorrect code. {otpError.attemptsRemaining} attempt{otpError.attemptsRemaining !== 1 ? 's' : ''} remaining.
                </p>
              )}
              {otpError?.reason === 'otp_locked' && (
                <p className="text-[#ef4444] text-sm" role="alert">
                  Too many attempts. Try again at{' '}
                  {otpError.lockedUntil ? new Date(otpError.lockedUntil).toLocaleTimeString() : 'later'}.
                </p>
              )}
              {otpError?.reason === 'otp_expired' && (
                <p className="text-[#ef4444] text-sm" role="alert">
                  Code expired.{' '}
                  <button type="button" onClick={handleResend} className="underline text-[#3b82f6]">
                    Log in again
                  </button>
                </p>
              )}
              <button
                type="submit"
                disabled={loading || otp.length !== 6}
                className="w-full bg-[#3b82f6] text-white py-2 rounded-md text-sm font-medium hover:bg-[#2563eb] disabled:opacity-50 transition-colors"
              >
                {loading ? 'Verifying…' : 'Verify Code'}
              </button>
              <div className="text-center">
                {resendCountdown > 0 ? (
                  <p className="text-[#6b7280] text-xs">Resend in {resendCountdown}s</p>
                ) : (
                  <button
                    type="button"
                    onClick={handleResend}
                    className="text-[#3b82f6] text-xs hover:underline"
                  >
                    Resend code
                  </button>
                )}
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
