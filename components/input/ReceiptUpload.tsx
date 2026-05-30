'use client'

import { useState, useRef } from 'react'

const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf']
const REJECTED_MESSAGES: Record<string, string> = {
  'image/heic': 'HEIC files cannot be read automatically. Please convert to JPG or PNG first.',
  'image/heif': 'HEIF files cannot be read automatically. Please convert to JPG or PNG first.',
  'image/webp': 'WEBP files are not supported. Please upload a JPG or PNG instead.',
  'image/gif':  'GIF files are not supported. Please upload a JPG, PNG, or PDF.',
  'image/bmp':  'BMP files are not supported. Please upload a JPG or PNG instead.',
  'image/tiff': 'TIFF files are not supported. Please upload a JPG or PNG instead.',
}

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
  const [status, setStatus] = useState<'idle' | 'uploading' | 'success' | 'fallback' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const [extracted, setExtracted] = useState<Extracted | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    if (!file) return

    const mimeType = file.type.toLowerCase()

    // Client-side MIME validation before any network call
    if (REJECTED_MESSAGES[mimeType]) {
      setStatus('error')
      setErrorMessage(REJECTED_MESSAGES[mimeType])
      return
    }
    if (!ALLOWED_TYPES.includes(mimeType)) {
      setStatus('error')
      setErrorMessage(`Unsupported file type. Please upload a JPG, PNG, or PDF.`)
      return
    }

    setUploading(true)
    setStatus('uploading')
    setErrorMessage('')

    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch('/api/v1/documents', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()

      if (!res.ok) {
        // Server returned 4xx/5xx — surface the real error message
        setStatus('error')
        setErrorMessage(data.error ?? 'Upload failed. Please try again.')
        return
      }

      if (data.status === 'PROCESSED' && data.extracted) {
        setStatus('success')
        setExtracted(data.extracted)
        onExtracted(data.extracted)
      } else {
        // File saved, OCR did not produce structured data — calm fallback
        setStatus('fallback')
      }
    } catch {
      setStatus('error')
      setErrorMessage('A connection error occurred. Please check your connection and try again.')
    } finally {
      setUploading(false)
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  function reset() {
    setStatus('idle')
    setErrorMessage('')
    setExtracted(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div>
      <label className="block text-sm text-gray-400 mb-1">
        Upload receipt photo or PDF (optional)
      </label>
      <p className="text-xs text-gray-600 mb-2">
        Uploading receipts regularly strengthens your records and reduces missing-document problems later.
      </p>
      <div
        onDrop={handleDrop}
        onDragOver={e => e.preventDefault()}
        onClick={() => status === 'idle' && fileRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
          status === 'success'
            ? 'border-emerald-700 bg-emerald-950'
            : status === 'fallback'
            ? 'border-amber-700 bg-amber-950'
            : status === 'error'
            ? 'border-red-800 bg-red-950'
            : 'border-gray-700 hover:border-gray-600 bg-gray-900 cursor-pointer'
        }`}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".jpg,.jpeg,.png,.pdf"
          className="hidden"
          onChange={e => {
            const file = e.target.files?.[0]
            if (file) handleFile(file)
          }}
        />

        {uploading && (
          <p className="text-sm text-gray-400">Reading receipt with AI...</p>
        )}

        {!uploading && status === 'idle' && (
          <div>
            <p className="text-sm text-gray-400">Drop receipt here or tap to upload</p>
            <p className="text-xs text-gray-600 mt-1">JPG, PNG, PDF — AI will read it automatically</p>
          </div>
        )}

        {!uploading && status === 'success' && (
          <div className="space-y-1">
            <p className="text-sm text-emerald-400 font-medium">Receipt uploaded and read successfully.</p>
            {extracted && (
              <p className="text-xs text-emerald-600">
                {extracted.merchant ?? 'Unknown'}{extracted.amount != null ? ` — €${extracted.amount}` : ''}
              </p>
            )}
            <button
              onClick={e => { e.stopPropagation(); reset() }}
              className="text-xs text-gray-500 hover:text-gray-400 mt-2 underline"
            >
              Upload a different file
            </button>
          </div>
        )}

        {!uploading && status === 'fallback' && (
          <div className="text-left space-y-2">
            <p className="text-sm text-amber-400 font-medium">Receipt uploaded safely.</p>
            <p className="text-xs text-gray-400">
              We could not read all the details automatically. You can still fill in the fields manually below — your receipt is saved.
            </p>
            <button
              onClick={e => { e.stopPropagation(); reset() }}
              className="text-xs text-gray-500 hover:text-gray-400 mt-1 underline"
            >
              Try a different file
            </button>
          </div>
        )}

        {!uploading && status === 'error' && (
          <div className="text-left space-y-2">
            <p className="text-sm text-red-400 font-medium">
              {errorMessage || 'Upload could not be completed.'}
            </p>
            <p className="text-xs text-gray-500">
              Accepted formats: JPG, PNG, PDF — max 10 MB.
            </p>
            <button
              onClick={e => { e.stopPropagation(); reset() }}
              className="text-xs text-gray-500 hover:text-gray-400 mt-1 underline"
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
