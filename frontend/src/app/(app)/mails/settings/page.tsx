'use client'
import { useState } from 'react'
import { useAccounts, useCreateAccount, useUpdateAccount, useSetDefaultAccount, useDeleteAccount } from '@/lib/hooks/useMails'
import { RichTextEditor } from '@/components/mails/RichTextEditor'
import { Mail, Plus, Trash2, Star, ArrowLeft, Pencil, X, Check } from 'lucide-react'
import Link from 'next/link'
import type { GmailAccount } from '@/lib/mails/types'

const BLANK_FORM = { email: '', displayName: '', appPassword: '', smtpUser: '', signature: '', isDefault: false }

function AccountForm({
  initial,
  onSave,
  onCancel,
  isPending,
  isEdit,
}: {
  initial: typeof BLANK_FORM
  onSave: (f: typeof BLANK_FORM) => void
  onCancel: () => void
  isPending: boolean
  isEdit: boolean
}) {
  const [form, setForm] = useState(initial)
  const [showPassword, setShowPassword] = useState(false)
  const f = (k: keyof typeof BLANK_FORM) => (v: string | boolean) =>
    setForm(prev => ({ ...prev, [k]: v }))

  return (
    <form
      onSubmit={e => { e.preventDefault(); onSave(form) }}
      className="px-5 py-4 border-b border-[#1e1e1e] space-y-3"
    >
      <div className="grid grid-cols-2 gap-3">
        <input
          required
          placeholder="Display name"
          value={form.displayName}
          onChange={e => f('displayName')(e.target.value)}
          className="bg-[#0a0a0a] border border-[#222] rounded-lg px-3 py-2 text-sm text-[#e5e7eb] placeholder-[#4b5563] focus:outline-none focus:border-[#8b5cf6]"
        />
        <input
          required
          type="email"
          placeholder="From address (e.g. sales@company.com)"
          value={form.email}
          onChange={e => f('email')(e.target.value)}
          className="bg-[#0a0a0a] border border-[#222] rounded-lg px-3 py-2 text-sm text-[#e5e7eb] placeholder-[#4b5563] focus:outline-none focus:border-[#8b5cf6]"
        />
      </div>

      <div className="flex gap-2">
        <input
          required={!isEdit}
          type={showPassword ? 'text' : 'password'}
          placeholder={isEdit ? 'App Password (leave blank to keep current)' : 'App Password (16 chars, from Google Account → Security)'}
          value={form.appPassword}
          onChange={e => f('appPassword')(e.target.value)}
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

      <div>
        <input
          type="email"
          placeholder="Gmail login (only for &lsquo;Send mail as&rsquo; aliases — e.g. you@gmail.com)"
          value={form.smtpUser}
          onChange={e => f('smtpUser')(e.target.value)}
          className="w-full bg-[#0a0a0a] border border-[#222] rounded-lg px-3 py-2 text-sm text-[#e5e7eb] placeholder-[#4b5563] focus:outline-none focus:border-[#8b5cf6]"
        />
        <p className="text-xs text-[#4b5563] mt-1">
          Leave blank if this is your actual Gmail. For a &ldquo;Send mail as&rdquo; alias, enter the Gmail you authenticate with and use its App Password above.
        </p>
      </div>

      {/* Signature */}
      <div>
        <label className="block text-xs text-[#9ca3af] mb-1.5">Signature (optional)</label>
        <RichTextEditor
          content={form.signature}
          onChange={v => f('signature')(v)}
          minHeight="120px"
          placeholder="Your email signature…"
        />
        <p className="text-xs text-[#4b5563] mt-1">Appended automatically to every email sent from this account. Supports images, links, and rich text.</p>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id={`isDefault-${isEdit ? 'edit' : 'new'}`}
          checked={form.isDefault}
          onChange={e => f('isDefault')(e.target.checked)}
          className="accent-[#8b5cf6]"
        />
        <label htmlFor={`isDefault-${isEdit ? 'edit' : 'new'}`} className="text-xs text-[#9ca3af]">Set as default</label>
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="px-4 py-1.5 bg-[#8b5cf6] text-white text-xs rounded-lg hover:bg-[#7c3aed] disabled:opacity-50"
        >
          {isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Save'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-1.5 text-xs text-[#6b7280] border border-[#222] rounded-lg hover:border-[#444]"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

function AccountRow({
  acc,
  onEdit,
  onSetDefault,
  onDelete,
}: {
  acc: GmailAccount
  onEdit: () => void
  onSetDefault: () => void
  onDelete: () => void
}) {
  return (
    <li className="border-b border-[#1a1a1a] last:border-0">
      <div className="flex items-center justify-between px-5 py-3">
        <div>
          <div className="text-sm text-[#e5e7eb] flex items-center gap-2">
            {acc.displayName}
            {acc.isDefault && <Star size={11} className="text-[#f59e0b] fill-[#f59e0b]" />}
          </div>
          <div className="text-xs text-[#6b7280]">{acc.email}</div>
          {acc.smtpUser && <div className="text-xs text-[#4b5563]">via {acc.smtpUser}</div>}
          {acc.signature && (
            <div className="text-xs text-[#4b5563] italic mt-0.5">Has signature</div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!acc.isDefault && (
            <button onClick={onSetDefault} className="text-xs text-[#6b7280] hover:text-[#f59e0b]">
              Set default
            </button>
          )}
          <button onClick={onEdit} className="text-[#6b7280] hover:text-[#8b5cf6]" title="Edit">
            <Pencil size={14} />
          </button>
          <button onClick={onDelete} className="text-[#6b7280] hover:text-[#ef4444]" title="Delete">
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </li>
  )
}

export default function MailsSettings() {
  const { data: accounts = [], isLoading } = useAccounts()
  const createAccount = useCreateAccount()
  const updateAccount = useUpdateAccount()
  const setDefault = useSetDefaultAccount()
  const deleteAccount = useDeleteAccount()

  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)

  async function handleCreate(form: typeof BLANK_FORM) {
    await createAccount.mutateAsync(form)
    setShowAddForm(false)
  }

  async function handleUpdate(id: number, form: typeof BLANK_FORM) {
    const patch: Parameters<typeof updateAccount.mutateAsync>[0] = { id, ...form }
    if (!form.appPassword) delete patch.appPassword
    await updateAccount.mutateAsync(patch)
    setEditingId(null)
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
          {!showAddForm && (
            <button
              onClick={() => { setShowAddForm(true); setEditingId(null) }}
              className="flex items-center gap-1 text-xs text-[#8b5cf6] hover:text-[#7c3aed]"
            >
              <Plus size={13} /> Add alias
            </button>
          )}
        </div>

        {showAddForm && (
          <AccountForm
            initial={BLANK_FORM}
            onSave={handleCreate}
            onCancel={() => setShowAddForm(false)}
            isPending={createAccount.isPending}
            isEdit={false}
          />
        )}

        {isLoading ? (
          <div className="p-6 text-sm text-[#6b7280]">Loading…</div>
        ) : accounts.length === 0 ? (
          <div className="p-6 text-sm text-[#6b7280]">No accounts yet. Add your first Gmail alias above.</div>
        ) : (
          <ul>
            {accounts.map(acc => (
              <li key={acc.id} className="border-b border-[#1a1a1a] last:border-0">
                {editingId === acc.id ? (
                  <AccountForm
                    initial={{
                      email: acc.email,
                      displayName: acc.displayName,
                      appPassword: '',
                      smtpUser: acc.smtpUser ?? '',
                      signature: acc.signature ?? '',
                      isDefault: acc.isDefault,
                    }}
                    onSave={form => handleUpdate(acc.id, form)}
                    onCancel={() => setEditingId(null)}
                    isPending={updateAccount.isPending}
                    isEdit
                  />
                ) : (
                  <AccountRow
                    acc={acc}
                    onEdit={() => { setEditingId(acc.id); setShowAddForm(false) }}
                    onSetDefault={() => setDefault.mutate(acc.id)}
                    onDelete={() => deleteAccount.mutate(acc.id)}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-xs text-[#4b5563]">
        App Passwords are stored AES-256 encrypted. Generate one at{' '}
        <span className="text-[#8b5cf6]">myaccount.google.com → Security → App Passwords</span>.
      </p>
    </div>
  )
}
