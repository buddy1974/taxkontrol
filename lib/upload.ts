/**
 * Upload validation based on the file's actual bytes, not the browser-supplied
 * MIME type (which a client can set to anything).
 */

export type DetectedType = 'image/jpeg' | 'image/png' | 'application/pdf' | 'image/webp' | 'image/gif' | 'image/heic'

export function sniffFileType(buf: Uint8Array): DetectedType | null {
  const at = (i: number) => buf[i]
  if (buf.length >= 4 && at(0) === 0x25 && at(1) === 0x50 && at(2) === 0x44 && at(3) === 0x46) return 'application/pdf' // %PDF
  if (buf.length >= 3 && at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return 'image/jpeg'
  if (buf.length >= 8 && at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47 && at(4) === 0x0d && at(5) === 0x0a && at(6) === 0x1a && at(7) === 0x0a) return 'image/png'
  if (buf.length >= 12 && String.fromCharCode(...buf.slice(0, 4)) === 'RIFF' && String.fromCharCode(...buf.slice(8, 12)) === 'WEBP') return 'image/webp'
  if (buf.length >= 6 && String.fromCharCode(...buf.slice(0, 6)).startsWith('GIF8')) return 'image/gif'
  if (buf.length >= 12 && String.fromCharCode(...buf.slice(4, 8)) === 'ftyp' && /^(heic|heix|mif1|msf1|heim|heis)$/.test(String.fromCharCode(...buf.slice(8, 12)))) return 'image/heic'
  return null
}

const FRIENDLY: Partial<Record<DetectedType, string>> = {
  'image/heic': 'HEIC photos cannot be read yet. Please convert to JPG or PNG first.',
  'image/webp': 'WEBP files are not supported. Please upload a JPG, PNG or PDF.',
  'image/gif': 'GIF files are not supported. Please upload a JPG, PNG or PDF.',
}

export type AcceptedType = 'image/jpeg' | 'image/png' | 'application/pdf'

export interface ValidatedUpload {
  buffer: Buffer
  mimeType: AcceptedType
  /** Safe storage file name: ASCII, no path separators, max 100 chars. */
  safeName: string
  originalName: string
}

export class UploadError extends Error {
  constructor(public readonly status: 400 | 413 | 415, message: string) {
    super(message)
  }
}

export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'file'
  const cleaned = base
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+/, '')
    .slice(-100)
  return cleaned || 'file'
}

export async function validateUpload(
  file: FormDataEntryValue | null,
  opts: { maxBytes: number; accept: readonly AcceptedType[] }
): Promise<ValidatedUpload> {
  if (!file || typeof file === 'string') throw new UploadError(400, 'No file provided.')
  if (file.size === 0) throw new UploadError(400, 'The file is empty.')
  if (file.size > opts.maxBytes) {
    throw new UploadError(413, `File too large. Maximum size is ${Math.round(opts.maxBytes / 1024 / 1024)} MB.`)
  }
  const buffer = Buffer.from(await file.arrayBuffer())
  const detected = sniffFileType(buffer)
  if (detected && FRIENDLY[detected]) throw new UploadError(415, FRIENDLY[detected]!)
  if (!detected || !(opts.accept as readonly string[]).includes(detected)) {
    const allowed = opts.accept.map(t => (t === 'application/pdf' ? 'PDF' : t === 'image/png' ? 'PNG' : 'JPG')).join(', ')
    throw new UploadError(415, `Unsupported file. Please upload: ${allowed}.`)
  }
  return { buffer, mimeType: detected as AcceptedType, safeName: safeFileName(file.name), originalName: file.name.slice(0, 200) }
}
