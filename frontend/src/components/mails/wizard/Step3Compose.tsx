'use client'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'

const MERGE_TAGS = ['{{firstName}}', '{{lastName}}', '{{email}}', '{{company}}']

interface Props {
  subject: string
  bodyHtml: string
  onSubjectChange: (v: string) => void
  onBodyChange: (v: string) => void
}

export function Step3Compose({ subject, bodyHtml, onSubjectChange, onBodyChange }: Props) {
  const editor = useEditor({
    extensions: [StarterKit],
    content: bodyHtml || '<p>Hi {{firstName}},</p><p></p>',
    onUpdate: ({ editor }) => onBodyChange(editor.getHTML()),
  })

  function insertTag(tag: string) {
    editor?.chain().focus().insertContent(tag).run()
  }

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
        <span className="text-xs text-[#6b7280]">Insert:</span>
        {MERGE_TAGS.map(tag => (
          <button
            key={tag}
            type="button"
            onClick={() => insertTag(tag)}
            className="px-2 py-0.5 text-xs bg-[#8b5cf6]/10 text-[#8b5cf6] border border-[#8b5cf6]/30 rounded hover:bg-[#8b5cf6]/20"
          >
            {tag}
          </button>
        ))}
      </div>

      {/* Body editor */}
      <div>
        <label className="block text-xs text-[#9ca3af] mb-1.5">Email body</label>
        <div className="bg-[#0a0a0a] border border-[#222] rounded-lg p-3 min-h-[240px] text-sm text-[#e5e7eb] focus-within:border-[#8b5cf6] transition-colors prose prose-invert max-w-none">
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  )
}
