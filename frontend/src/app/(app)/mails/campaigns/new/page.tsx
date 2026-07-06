'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Mail } from 'lucide-react'
import { useAccounts, useCreateCampaign, useAddContacts, useLaunchCampaign } from '@/lib/hooks/useMails'
import { Step1NameSender } from '@/components/mails/wizard/Step1NameSender'
import { Step2UploadContacts } from '@/components/mails/wizard/Step2UploadContacts'
import { Step3Compose } from '@/components/mails/wizard/Step3Compose'
import { Step4SendOptions } from '@/components/mails/wizard/Step4SendOptions'
import type { MappedContact } from '@/lib/mails/types'

const STEPS = ['Name & Sender', 'Contacts', 'Compose', 'Send Options']

export default function NewCampaignPage() {
  const router = useRouter()
  const { data: accounts = [] } = useAccounts()

  const createCampaign = useCreateCampaign()
  const addContacts = useAddContacts()
  const launchCampaign = useLaunchCampaign()

  const [step, setStep] = useState(0)
  const [error, setError] = useState<string | null>(null)

  // Step 1 state
  const [name, setName] = useState('')
  const [fromAccountId, setFromAccountId] = useState<number | null>(null)

  // Step 2 state
  const [contacts, setContacts] = useState<MappedContact[]>([])

  // Step 3 state
  const [subject, setSubject] = useState('')
  const [bodyHtml, setBodyHtml] = useState('')

  // Resolved account for signature preview
  const selectedAccount = accounts.find(a => a.id === (fromAccountId ?? accounts[0]?.id))

  // Step 4 state
  const [scheduledAt, setScheduledAt] = useState<string | null>(null)
  const [ratePerHour, setRatePerHour] = useState<number | null>(null)

  function canAdvanceStep1() {
    return name.trim().length > 0 && (fromAccountId !== null || accounts.length > 0)
  }

  function handleStep1Change(n: string, id: number) {
    setName(n)
    setFromAccountId(id)
  }

  function handleStep2Confirm(c: MappedContact[]) {
    setContacts(c)
    setStep(2)
  }

  async function handleLaunch() {
    setError(null)
    try {
      const accountId = fromAccountId ?? accounts[0]?.id
      if (!accountId) throw new Error('No Gmail account selected')
      if (!subject.trim()) throw new Error('Subject is required')
      if (!bodyHtml.trim()) throw new Error('Email body is required')

      const campaign = await createCampaign.mutateAsync({
        name,
        fromAccountId: accountId,
        subject,
        bodyHtml,
        ...(scheduledAt ? { scheduledAt } : {}),
        ...(ratePerHour ? { ratePerHour } : {}),
      })

      if (contacts.length > 0) {
        await addContacts.mutateAsync({ campaignId: campaign.id, contacts })
      }

      await launchCampaign.mutateAsync(campaign.id)
      router.push(`/mails/campaigns/${campaign.id}`)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    }
  }

  const isSubmitting = createCampaign.isPending || addContacts.isPending || launchCampaign.isPending

  return (
    <div className="p-6 max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/mails" className="text-[#6b7280] hover:text-[#e5e7eb]">
          <ArrowLeft size={16} />
        </Link>
        <div className="flex items-center gap-2">
          <Mail size={18} className="text-[#8b5cf6]" />
          <h1 className="text-[#e5e7eb] font-semibold">New Campaign</h1>
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-0">
        {STEPS.map((label, i) => (
          <div key={i} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
                  i < step
                    ? 'bg-[#8b5cf6] text-white'
                    : i === step
                    ? 'bg-[#8b5cf6]/20 border border-[#8b5cf6] text-[#8b5cf6]'
                    : 'bg-[#1a1a1a] border border-[#333] text-[#4b5563]'
                }`}
              >
                {i < step ? '✓' : i + 1}
              </div>
              <span className={`text-xs mt-1 ${i === step ? 'text-[#e5e7eb]' : 'text-[#4b5563]'}`}>
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`h-px w-12 mx-1 mb-4 ${i < step ? 'bg-[#8b5cf6]' : 'bg-[#333]'}`} />
            )}
          </div>
        ))}
      </div>

      {/* Step content */}
      <div className="bg-[#111111] border border-[#222222] rounded-xl p-5">
        {step === 0 && (
          <>
            <Step1NameSender
              name={name}
              fromAccountId={fromAccountId}
              accounts={accounts}
              onChange={handleStep1Change}
            />
            <div className="flex justify-end mt-4">
              <button
                disabled={!canAdvanceStep1()}
                onClick={() => setStep(1)}
                className="bg-[#8b5cf6] hover:bg-[#7c3aed] disabled:opacity-40 text-white px-4 py-2 rounded-lg text-sm"
              >
                Next
              </button>
            </div>
          </>
        )}

        {step === 1 && (
          <Step2UploadContacts
            onConfirm={handleStep2Confirm}
            onBack={() => setStep(0)}
          />
        )}

        {step === 2 && (
          <Step3Compose
            subject={subject}
            bodyHtml={bodyHtml}
            signature={selectedAccount?.signature ?? null}
            onSubjectChange={setSubject}
            onBodyChange={setBodyHtml}
            onBack={() => setStep(1)}
            onNext={() => setStep(3)}
          />
        )}

        {step === 3 && (
          <>
            <Step4SendOptions
              scheduledAt={scheduledAt}
              ratePerHour={ratePerHour}
              totalContacts={contacts.length}
              onChange={(s, r) => { setScheduledAt(s); setRatePerHour(r) }}
              onBack={() => setStep(2)}
              onNext={handleLaunch}
            />
            {error && (
              <p className="mt-3 text-xs text-[#ef4444] bg-[#ef4444]/10 border border-[#ef4444]/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}
            {isSubmitting && (
              <p className="mt-3 text-xs text-[#9ca3af] text-center">
                {createCampaign.isPending ? 'Creating campaign…' : addContacts.isPending ? 'Uploading contacts…' : 'Launching…'}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
