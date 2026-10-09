import Link from 'next/link'
import { Suspense } from 'react'
import ContactForm from './ContactForm'

export const metadata = {
  title: 'Beratung anfragen – TaxKontrol',
}

export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const rawSystem = params.system
  const system = Array.isArray(rawSystem) ? rawSystem[0] : rawSystem
  const isTaxKontrol = system === 'taxkontrol'

  return (
    <div className="min-h-screen bg-gray-950 py-16 px-4">
      <div className="max-w-2xl mx-auto space-y-8">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white mb-2">
            {isTaxKontrol ? 'TaxKontrol Beratung anfragen' : 'Kontakt aufnehmen'}
          </h1>
          {isTaxKontrol ? (
            <p className="text-sm text-gray-400 leading-relaxed">
              Beschreiben Sie kurz Ihre aktuelle Situation: Finanzamt-Briefe, Belege, Einnahmen,
              Ausgaben, Jobcenter-Unterlagen oder Vorbereitung für den Steuerberater. Wir prüfen,
              wie TaxKontrol Sie beim Sortieren, Verstehen und Vorbereiten unterstützen kann.
            </p>
          ) : (
            <p className="text-sm text-gray-400">Nehmen Sie Kontakt mit uns auf.</p>
          )}
        </div>

        {/* Trust cards — TaxKontrol context only */}
        {isTaxKontrol && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-1">
              <p className="text-sm font-semibold text-white">Kostenlose Ersteinschätzung</p>
              <p className="text-xs text-gray-400">
                Wir schauen uns an, welche Unterlagen, Prozesse oder Unsicherheiten gerade blockieren.
              </p>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-1">
              <p className="text-sm font-semibold text-white">Finanzamt &amp; Unterlagen</p>
              <p className="text-xs text-gray-400">
                Geeignet für Briefe, Belege, Einnahmen, Ausgaben, Jobcenter-Berichte und
                Steuerberater-Vorbereitung.
              </p>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-1">
              <p className="text-sm font-semibold text-white">Antwortzeit</p>
              <p className="text-xs text-gray-400">
                Wir antworten in der Regel innerhalb eines Werktags.
              </p>
            </div>
          </div>
        )}

        {/* Form */}
        <Suspense>
          <ContactForm isTaxKontrol={isTaxKontrol} system={system ?? null} />
        </Suspense>

        <p className="text-xs text-gray-700 pt-2">
          <a href="/impressum" className="hover:text-gray-400">Impressum</a>
          <span className="mx-2">·</span>
          <a href="/datenschutz" className="hover:text-gray-400">Datenschutz</a>
          <span className="mx-2">·</span>
          <Link href="/" className="hover:text-gray-400">Startseite</Link>
        </p>

      </div>
    </div>
  )
}
