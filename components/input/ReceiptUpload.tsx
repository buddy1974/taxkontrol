'use client'

import { useState, useRef } from 'react'

type Extracted = {
  merchant: string | null
  amount: number | null
  vatRate: number | null
  date: string | null
  description: string | null
  type: string | null
}

interface Props {
  onExtracted: (data: Extracted) => void
}

export default function ReceiptUpload({ onExtracted }: Props) {
  const [uploading, setUploading] = useState(false)
  const [status, setStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    if (!file) return
    setUploading(true)
    setStatus('uploading')
    setMessage('Reading receipt...')

    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch('/api/v1/documents', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()

      if (data.extracted && data.extracted.amount) {
        setStatus('success')
        setMessage(`Found: ${data.extracted.merchant ?? 'Unknown'} — €${data.extracted.amount}`)
        onExtracted(data.extracted)
      } else {
        setStatus('error')
        setMessage('Could not read receipt automatically. Please fill in manually.')
      }
    } catch {
      setStatus('error')
      setMessage('Upload failed. Please try again.')
    } finally {
      setUploading(false)
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  return (
    <div>
      <label className="block text-sm text-gray-400 mb-1">
        Upload receipt photo or PDF (optional)
      </label>
      <div
        onDrop={handleDrop}
        onDragOver={e => e.preventDefault()}
        onClick={() => fileRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
          status === 'success'
            ? 'border-emerald-700 bg-emerald-950'
            : status === 'error'
            ? 'border-red-700 bg-red-950'
            : 'border-gray-700 hover:border-gray-600 bg-gray-900'
        }`}
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={e => {
            const file = e.target.files?.[0]
            if (file) handleFile(file)
          }}
        />
        {uploading ? (
          <p className="text-sm text-gray-400">Reading receipt with AI...</p>
        ) : status === 'success' ? (
          <p className="text-sm text-emerald-400">{message}</p>
        ) : status === 'error' ? (
          <p className="text-sm text-red-400">{message}</p>
        ) : (
          <div>
            <p className="text-sm text-gray-400">Drop receipt here or tap to upload</p>
            <p className="text-xs text-gray-600 mt-1">JPG, PNG, PDF — AI will read it automatically</p>
          </div>
        )}
      </div>
    </div>
  )
}
