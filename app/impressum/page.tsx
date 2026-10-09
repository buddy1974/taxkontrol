import Link from 'next/link'
export default function ImpressumPage() {
  return (
    <div className="min-h-screen bg-gray-950 py-16 px-4">
      <div className="max-w-2xl mx-auto text-gray-300 space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-white mb-2">Impressum</h1>
          <p className="text-sm text-gray-400">Angaben gemäß § 5 DDG</p>
        </div>

        <section className="space-y-1">
          <h2 className="text-base font-semibold text-white">Anbieter</h2>
          <p className="text-sm">Marcel Tabit Akwe</p>
          <p className="text-sm">Körnerstr. 8</p>
          <p className="text-sm">45143 Essen</p>
          <p className="text-sm">Deutschland</p>
        </section>

        <section className="space-y-1">
          <h2 className="text-base font-semibold text-white">Kontakt</h2>
          <p className="text-sm">E-Mail: info@maxpromo.digital</p>
        </section>

        <section className="space-y-1">
          <h2 className="text-base font-semibold text-white">Steuerliche Angaben</h2>
          <p className="text-sm">Tätigkeitsform: Selbständige Tätigkeit</p>
          <p className="text-sm">Steuernummer: 111/5339/7597</p>
          <p className="text-sm">Finanzamt Essen-NordOst</p>
          <p className="text-sm">Kleinunternehmer gemäß § 19 UStG — keine Umsatzsteuer-Identifikationsnummer vorhanden.</p>
        </section>

        <section className="space-y-1">
          <h2 className="text-base font-semibold text-white">Verantwortlich für den Inhalt</h2>
          <p className="text-sm">Marcel Tabit Akwe, Körnerstr. 8, 45143 Essen</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-white">Haftungsausschluss</h2>
          <p className="text-sm text-gray-400">
            TaxKontrol ist ein Werkzeug zur Vorbereitung und Organisation von buchhalterischen Unterlagen.
            Es ersetzt keine steuerliche Beratung. Für die Richtigkeit und Vollständigkeit der eingegebenen
            Daten ist der Nutzer selbst verantwortlich. Steuerliche Entscheidungen sollten mit einem
            qualifizierten Steuerberater abgestimmt werden.
          </p>
        </section>

        <p className="text-xs text-gray-400 pt-4">
          <Link href="/" className="hover:text-gray-400">Zurück zur Startseite</Link>
        </p>
      </div>
    </div>
  )
}
