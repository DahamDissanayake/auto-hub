'use client'
import { useState, useCallback } from 'react'
import * as XLSX from 'xlsx'
import { autoMapColumns } from '@/lib/mails/mapColumns'
import type { MappedContact } from '@/lib/mails/types'

const FIELD_OPTIONS = ['firstName', 'lastName', 'email', 'company', 'ignore'] as const
type FieldOption = typeof FIELD_OPTIONS[number]

interface Props {
  onConfirm: (contacts: MappedContact[]) => void
  onBack: () => void
}

export function Step2UploadContacts({ onConfirm, onBack }: Props) {
  const [headers, setHeaders] = useState<string[]>([])
  const [mapping, setMapping] = useState<Record<string, FieldOption>>({})
  const [preview, setPreview] = useState<string[][]>([])
  const [allRows, setAllRows] = useState<string[][]>([])
  const [confirmed, setConfirmed] = useState(false)

  const handleFile = useCallback((file: File) => {
    const reader = new FileReader()
    reader.onload = e => {
      const data = new Uint8Array(e.target!.result as ArrayBuffer)
      const wb = XLSX.read(data, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 })
      const hdrs = (rows[0] as string[]) ?? []
      const dataRows = rows.slice(1) as string[][]
      setHeaders(hdrs)
      setMapping(autoMapColumns(hdrs) as Record<string, FieldOption>)
      setPreview(dataRows.slice(0, 5))
      setAllRows(dataRows)
      setConfirmed(false)
    }
    reader.readAsArrayBuffer(file)
  }, [])

  function handleConfirm() {
    const emailIdx = headers.findIndex(h => mapping[h] === 'email')
    if (emailIdx === -1) { alert('You must map at least one column to "email".'); return }

    const contacts: MappedContact[] = allRows
      .filter(row => row[emailIdx])
      .map(row => {
        const obj: Record<string, string> = {}
        headers.forEach((h, i) => {
          const field = mapping[h]
          if (field !== 'ignore') obj[field] = row[i] ?? ''
        })
        return obj as unknown as MappedContact
      })
    setConfirmed(true)
    onConfirm(contacts)
  }

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <label
        className="flex flex-col items-center justify-center border-2 border-dashed border-[#333] rounded-xl py-10 cursor-pointer hover:border-[#8b5cf6] transition-colors"
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
      >
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
        />
        <span className="text-sm text-[#6b7280]">
          Drop your Excel file here or <span className="text-[#8b5cf6]">browse</span>
        </span>
        <span className="text-xs text-[#4b5563] mt-1">.xlsx · .xls · .csv</span>
      </label>

      {headers.length > 0 && (
        <>
          {/* Column mapping */}
          <div className="bg-[#111] border border-[#222] rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-[#1e1e1e] text-xs text-[#9ca3af] font-medium">
              Map columns
            </div>
            <div className="divide-y divide-[#1a1a1a]">
              {headers.map(h => (
                <div key={h} className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-sm text-[#e5e7eb]">{h}</span>
                  <select
                    value={mapping[h]}
                    onChange={e => setMapping(m => ({ ...m, [h]: e.target.value as FieldOption }))}
                    className="bg-[#0a0a0a] border border-[#222] rounded-lg px-2 py-1 text-xs text-[#e5e7eb] focus:outline-none focus:border-[#8b5cf6]"
                  >
                    {FIELD_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>

          {/* Preview table */}
          {preview.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs border border-[#222] rounded-xl overflow-hidden">
                <thead>
                  <tr className="bg-[#111]">
                    {headers.map(h => (
                      <th key={h} className="px-3 py-2 text-left text-[#6b7280] font-medium border-b border-[#222]">
                        {h} → <span className="text-[#8b5cf6]">{mapping[h]}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row, i) => (
                    <tr key={i} className="border-b border-[#1a1a1a]">
                      {headers.map((_, j) => (
                        <td key={j} className="px-3 py-2 text-[#9ca3af]">{row[j] ?? ''}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs text-[#4b5563] mt-1">
                Showing {preview.length} of {allRows.length} rows
              </p>
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3">
            <button
              onClick={onBack}
              className="border border-[#333] text-[#9ca3af] hover:text-[#e5e7eb] px-4 py-2 rounded-lg text-sm"
            >
              Back
            </button>
            <button
              onClick={handleConfirm}
              disabled={confirmed}
              className="flex-1 sm:flex-none px-4 py-2 bg-[#8b5cf6] text-white text-sm rounded-lg hover:bg-[#7c3aed] disabled:opacity-50"
            >
              {confirmed ? `✓ ${allRows.length} contacts loaded` : 'Confirm mapping'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
