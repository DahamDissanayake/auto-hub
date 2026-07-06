'use client'
import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Link } from '@tiptap/extension-link'
import { Image } from '@tiptap/extension-image'
import { Underline } from '@tiptap/extension-underline'
import { TextAlign } from '@tiptap/extension-text-align'
import { Color } from '@tiptap/extension-color'
import { TextStyle } from '@tiptap/extension-text-style'
import { useRef, useCallback } from 'react'
import {
  Bold, Italic, UnderlineIcon, Strikethrough,
  Link2, Image as ImageIcon, AlignLeft, AlignCenter, AlignRight,
  List, ListOrdered, Heading2, Heading3, Minus, Undo, Redo,
} from 'lucide-react'

// ── Toolbar button ────────────────────────────────────────────────────────────
function Btn({
  onClick, active, title, children, disabled,
}: {
  onClick: () => void; active?: boolean; title: string; children: React.ReactNode; disabled?: boolean
}) {
  return (
    <button
      type="button"
      onMouseDown={e => { e.preventDefault(); onClick() }}
      disabled={disabled}
      title={title}
      className={`p-1.5 rounded transition-colors disabled:opacity-30 ${
        active
          ? 'bg-[#8b5cf6]/20 text-[#8b5cf6]'
          : 'text-[#9ca3af] hover:text-[#e5e7eb] hover:bg-[#1e1e1e]'
      }`}
    >
      {children}
    </button>
  )
}

function Divider() {
  return <span className="w-px h-4 bg-[#2a2a2a] mx-0.5 self-center" />
}

// ── Toolbar ───────────────────────────────────────────────────────────────────
function Toolbar({ editor, onImageUpload }: { editor: Editor; onImageUpload: () => void }) {
  const e = editor

  function setLink() {
    const prev = e.getAttributes('link').href as string | undefined
    const url = window.prompt('URL', prev ?? 'https://')
    if (url === null) return
    if (url === '') { e.chain().focus().unsetLink().run(); return }
    e.chain().focus().extendMarkRange('link').setLink({ href: url, target: '_blank' }).run()
  }

  return (
    <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-[#222] bg-[#0d0d0d] rounded-t-lg">
      {/* Undo / Redo */}
      <Btn onClick={() => e.chain().focus().undo().run()} title="Undo" disabled={!e.can().undo()}>
        <Undo size={14} />
      </Btn>
      <Btn onClick={() => e.chain().focus().redo().run()} title="Redo" disabled={!e.can().redo()}>
        <Redo size={14} />
      </Btn>
      <Divider />

      {/* Headings */}
      <Btn
        onClick={() => e.chain().focus().toggleHeading({ level: 2 }).run()}
        active={e.isActive('heading', { level: 2 })}
        title="Heading 2"
      >
        <Heading2 size={14} />
      </Btn>
      <Btn
        onClick={() => e.chain().focus().toggleHeading({ level: 3 }).run()}
        active={e.isActive('heading', { level: 3 })}
        title="Heading 3"
      >
        <Heading3 size={14} />
      </Btn>
      <Divider />

      {/* Inline marks */}
      <Btn onClick={() => e.chain().focus().toggleBold().run()} active={e.isActive('bold')} title="Bold">
        <Bold size={14} />
      </Btn>
      <Btn onClick={() => e.chain().focus().toggleItalic().run()} active={e.isActive('italic')} title="Italic">
        <Italic size={14} />
      </Btn>
      <Btn onClick={() => e.chain().focus().toggleUnderline().run()} active={e.isActive('underline')} title="Underline">
        <UnderlineIcon size={14} />
      </Btn>
      <Btn onClick={() => e.chain().focus().toggleStrike().run()} active={e.isActive('strike')} title="Strikethrough">
        <Strikethrough size={14} />
      </Btn>
      <Divider />

      {/* Text colour */}
      <label title="Text colour" className="p-1.5 rounded cursor-pointer text-[#9ca3af] hover:text-[#e5e7eb] hover:bg-[#1e1e1e]">
        <span className="text-xs font-bold" style={{ textDecorationLine: 'underline', textDecorationColor: e.getAttributes('textStyle').color ?? '#fff' }}>A</span>
        <input
          type="color"
          className="sr-only"
          onChange={ev => e.chain().focus().setColor(ev.target.value).run()}
        />
      </label>
      <Divider />

      {/* Lists */}
      <Btn onClick={() => e.chain().focus().toggleBulletList().run()} active={e.isActive('bulletList')} title="Bullet list">
        <List size={14} />
      </Btn>
      <Btn onClick={() => e.chain().focus().toggleOrderedList().run()} active={e.isActive('orderedList')} title="Ordered list">
        <ListOrdered size={14} />
      </Btn>
      <Divider />

      {/* Alignment */}
      <Btn onClick={() => e.chain().focus().setTextAlign('left').run()} active={e.isActive({ textAlign: 'left' })} title="Align left">
        <AlignLeft size={14} />
      </Btn>
      <Btn onClick={() => e.chain().focus().setTextAlign('center').run()} active={e.isActive({ textAlign: 'center' })} title="Align center">
        <AlignCenter size={14} />
      </Btn>
      <Btn onClick={() => e.chain().focus().setTextAlign('right').run()} active={e.isActive({ textAlign: 'right' })} title="Align right">
        <AlignRight size={14} />
      </Btn>
      <Divider />

      {/* Link */}
      <Btn onClick={setLink} active={e.isActive('link')} title="Insert / edit link">
        <Link2 size={14} />
      </Btn>

      {/* Image upload */}
      <Btn onClick={onImageUpload} title="Insert image">
        <ImageIcon size={14} />
      </Btn>

      {/* Horizontal rule */}
      <Btn onClick={() => e.chain().focus().setHorizontalRule().run()} title="Horizontal rule">
        <Minus size={14} />
      </Btn>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
interface Props {
  content: string
  onChange: (html: string) => void
  minHeight?: string
  placeholder?: string
}

export function RichTextEditor({ content, onChange, minHeight = '220px', placeholder }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link.configure({ openOnClick: false }),
      Image.configure({ inline: true, allowBase64: true }),
      TextStyle,
      Color,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
    ],
    content: content || `<p>${placeholder ? '' : ''}</p>`,
    onUpdate: ({ editor: ed }) => onChange(ed.getHTML()),
    editorProps: {
      attributes: {
        class: 'outline-none min-h-[inherit] prose prose-invert prose-sm max-w-none',
      },
    },
  })

  const handleImageUpload = useCallback(() => {
    fileRef.current?.click()
  }, [])

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !editor) return
    const reader = new FileReader()
    reader.onload = ev => {
      const src = ev.target?.result as string
      editor.chain().focus().setImage({ src }).run()
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  if (!editor) return null

  return (
    <div className="border border-[#222] rounded-lg overflow-hidden focus-within:border-[#8b5cf6] transition-colors bg-[#0a0a0a]">
      <Toolbar editor={editor} onImageUpload={handleImageUpload} />
      <div className="px-3 py-2 text-sm text-[#e5e7eb]" style={{ minHeight }}>
        <EditorContent editor={editor} />
      </div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} />
    </div>
  )
}
