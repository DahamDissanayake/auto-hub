'use client'
import { RichTextEditor } from '@/components/mails/RichTextEditor'

const MERGE_TAGS = ['{{firstName}}', '{{lastName}}', '{{email}}', '{{company}}']

interface Props {
  subject: string
  bodyHtml: string
  onSubjectChange: (v: string) => void
  onBodyChange: (v: string) => void
  onBack: () => void
  onNext: () => void
}

export function Step3Compose({ subject, bodyHtml, onSubjectChange, onBodyChange, onBack, onNext }: Props) {
  return (
    <div className="space-y-4">
      {/* Subject */}
      <div>
        <label className="block text-xs text-[#9ca3af] mb-1.5">Subject line</label>
        <input
          value={subject}
          onChange={e => onSubjectChange(e.target.value)}
          placeholder="e.g. Quick question for {{firstName}} at {{company}}"
          className="w-full bg-[#0a0a0a] border border-[#222] rounded-lg px-3 py-2 text-sm text-[#e5e7eb] placeholder-[#4b5563] focus:outline-none focus:border-[#8b5cf6]"
        />
      </div>

      {/* Merge tag helpers */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-[#6b7280]">Merge tags:</span>
        {MERGE_TAGS.map(tag => (
          <button
            key={tag}
            type="button"
            onClick={() => {
              const active = document.querySelector('.ProseMirror') as HTMLElement | null
              if (active) {
                active.focus()
                document.execCommand('insertText', false, tag)
              }
            }}
            className="px-2 py-0.5 text-xs bg-[#8b5cf6]/10 text-[#8b5cf6] border border-[#8b5cf6]/30 rounded hover:bg-[#8b5cf6]/20"
          >
            {tag}
          </button>
        ))}
      </div>

      {/* Body editor */}
      <div>
        <label className="block text-xs text-[#9ca3af] mb-1.5">Email body</label>
        <RichTextEditor
          content={bodyHtml || '<p>Hi {{firstName}},</p><p></p>'}
          onChange={onBodyChange}
          minHeight="300px"
        />
      </div>

      {/* Navigation */}
      <div className="flex gap-3 justify-end">
        <button
          type="button"
          onClick={onBack}
          className="border border-[#333] text-[#9ca3af] hover:text-[#e5e7eb] px-4 py-2 rounded-lg text-sm"
        >
          Back
        </button>
        <button
          type="button"
          onClick={onNext}
          className="bg-[#8b5cf6] hover:bg-[#7c3aed] text-white px-4 py-2 rounded-lg text-sm"
        >
          Next
        </button>
      </div>
    </div>
  )
}
