import Link from 'next/link'

interface Warning {
  id: string
  severity: 'low' | 'medium' | 'high'
  message: string
  href?: string
}

const STYLES = {
  high: 'bg-red-950 border-red-800 text-red-200',
  medium: 'bg-amber-950 border-amber-800 text-amber-200',
  low: 'bg-blue-950 border-blue-800 text-blue-200',
}

export default function WarningBanner({ warnings }: { warnings: Warning[] }) {
  if (warnings.length === 0) return null
  return (
    <section aria-label="Things that need your attention" className="space-y-2">
      {warnings.map(w => (
        <div key={w.id} role={w.severity === 'high' ? 'alert' : undefined} className={`rounded-lg px-4 py-3 border text-sm ${STYLES[w.severity]}`}>
          <span aria-hidden="true" className="mr-1">{w.severity === 'high' ? '⚠' : 'ℹ'}</span>
          {w.message}
          {w.href && (
            <>
              {' '}
              <Link href={w.href} className="underline underline-offset-2 font-medium whitespace-nowrap">
                Open
              </Link>
            </>
          )}
        </div>
      ))}
    </section>
  )
}
