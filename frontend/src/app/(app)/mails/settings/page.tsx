'use client'
import { useState } from 'react'
import { useAccounts, useCreateAccount, useSetDefaultAccount, useDeleteAccount } from '@/lib/hooks/useMails'
import { Mail, Plus, Trash2, Star, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

export default function MailsSettings() {
  const { data: accounts = [], isLoading } = useAccounts()
  const createAccount = useCreateAccount()
  const setDefault = useSetDefaultAccount()
  const deleteAccount = useDeleteAccount()

  const [form, setForm] = useState({ email: '', displayName: '', appPassword: '', isDefault: false })
  const [showForm, setShowForm] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    await createAccount.mutateAsync(form)
    setForm({ email: '', displayName: '', appPassword: '', isDefault: false })
    setShowForm(false)
  }

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link href="/mails" className="text-[#6b7280] hover:text-[#e5e7eb]">
          <ArrowLeft size={16} />
        </Link>
        <div className="flex items-center gap-2">
          <Mail size={18} className="text-[#8b5cf6]" />
          <h1 className="text-[#e5e7eb] font-semibold">Gmail Accounts</h1>
        </div>
      </div>

      <div className="bg-[#111111] border border-[#222222] rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#1e1e1e]">
          <h2 className="text-[#e5e7eb] font-medium text-sm">Send-as Aliases</h2>
          <button
            onClick={() => setShowForm(v => !v)}
            className="flex items-center gap-1 text-xs text-[#8b5cf6] hover:text-[#7c3aed]"
          >
            <Plus size={13} /> Add alias
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleSubmit} className="px-5 py-4 border-b border-[#1e1e1e] space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <input
                required
                placeholder="Display name"
                value={form.displayName}
                onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))}
                className="bg-[#0a0a0a] border border-[#222] rounded-lg px-3 py-2 text-sm text-[#e5e7eb] placeholder-[#4b5563] focus:outline-none focus:border-[#8b5cf6]"
              />
              <input
                required
                type="email"
                placeholder="email@example.com"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                className="bg-[#0a0a0a] border border-[#222] rounded-lg px-3 py-2 text-sm text-[#e5e7eb] placeholder-[#4b5563] focus:outline-none focus:border-[#8b5cf6]"
              />
            </div>
            <div className="flex gap-2">
              <input
                required
                type={showPassword ? 'text' : 'password'}
                placeholder="Gmail App Password (16 chars)"
                value={form.appPassword}
                onChange={e => setForm(f => ({ ...f, appPassword: e.target.value }))}
                className="flex-1 bg-[#0a0a0a] border border-[#222] rounded-lg px-3 py-2 text-sm text-[#e5e7eb] placeholder-[#4b5563] focus:outline-none focus:border-[#8b5cf6]"
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                className="px-3 text-xs text-[#6b7280] border border-[#222] rounded-lg hover:border-[#8b5cf6]"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isDefault"
                checked={form.isDefault}
                onChange={e => setForm(f => ({ ...f, isDefault: e.target.checked }))}
                className="accent-[#8b5cf6]"
              />
              <label htmlFor="isDefault" className="text-xs text-[#9ca3af]">Set as default</label>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={createAccount.isPending}
                className="px-4 py-1.5 bg-[#8b5cf6] text-white text-xs rounded-lg hover:bg-[#7c3aed] disabled:opacity-50"
              >
                {createAccount.isPending ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-1.5 text-xs text-[#6b7280] border border-[#222] rounded-lg hover:border-[#444]"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {isLoading ? (
          <div className="p-6 text-sm text-[#6b7280]">Loading…</div>
        ) : accounts.length === 0 ? (
          <div className="p-6 text-sm text-[#6b7280]">No accounts yet. Add your first Gmail alias above.</div>
        ) : (
          <ul>
            {accounts.map(acc => (
              <li key={acc.id} className="flex items-center justify-between px-5 py-3 border-b border-[#1a1a1a] last:border-0">
                <div>
                  <div className="text-sm text-[#e5e7eb] flex items-center gap-2">
                    {acc.displayName}
                    {acc.isDefault && <Star size={11} className="text-[#f59e0b] fill-[#f59e0b]" />}
                  </div>
                  <div className="text-xs text-[#6b7280]">{acc.email}</div>
                </div>
                <div className="flex items-center gap-2">
                  {!acc.isDefault && (
                    <button
                      onClick={() => setDefault.mutate(acc.id)}
                      className="text-xs text-[#6b7280] hover:text-[#f59e0b]"
                    >
                      Set default
                    </button>
                  )}
                  <button
                    onClick={() => deleteAccount.mutate(acc.id)}
                    className="text-[#6b7280] hover:text-[#ef4444]"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-xs text-[#4b5563]">
        App Passwords are stored AES-256 encrypted. Generate one at{' '}
        <span className="text-[#8b5cf6]">myaccount.google.com &rarr; Security &rarr; App Passwords</span>.
      </p>
    </div>
  )
}
