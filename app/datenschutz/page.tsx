import Link from 'next/link'
export default function DatenschutzPage() {
  return (
    <div className="min-h-screen bg-gray-950 py-16 px-4">
      <div className="max-w-2xl mx-auto text-gray-300 space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-white mb-2">Datenschutzerklärung</h1>
          <p className="text-sm text-gray-400">Gemäß DSGVO / GDPR</p>
        </div>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-white">1. Verantwortlicher</h2>
          <p className="text-sm">
            Marcel Tabit Akwe, Körnerstr. 8, 45143 Essen, Deutschland
          </p>
          <p className="text-sm">E-Mail: info@maxpromo.digital</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-white">2. Welche Daten wir erheben</h2>
          <p className="text-sm text-gray-400">
            Bei der Registrierung und Nutzung von TaxKontrol erheben wir folgende Daten:
          </p>
          <ul className="text-sm text-gray-400 space-y-1 list-disc list-inside">
            <li>E-Mail-Adresse und Passwort (verschlüsselt gespeichert)</li>
            <li>Finanzdaten, die Sie selbst eingeben (Einnahmen, Ausgaben, Rechnungen)</li>
            <li>Hochgeladene Dokumente (Belege, Rechnungen, Finanzamt-Schreiben) zur automatischen Erkennung</li>
            <li>Nutzungsdaten zur Systemstabilität (keine Weitergabe an Dritte)</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-white">3. Zweck der Verarbeitung</h2>
          <p className="text-sm text-gray-400">
            Ihre Daten werden ausschließlich zur Bereitstellung der TaxKontrol-Funktionen verwendet:
            Authentifizierung, Belegverwaltung, OCR-Texterkennung, Einnahmen-Ausgaben-Rechnung,
            Finanzkalkulation, Steuerreserve-Berechnung und Vorbereitung für die Zusammenarbeit
            mit einem Steuerberater.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-white">4. KI-Verarbeitung (Belegerkennung)</h2>
          <p className="text-sm text-gray-400">
            Hochgeladene Belege werden zur automatischen Texterkennung an die Anthropic API
            (Claude) übermittelt. Anthropic verarbeitet diese Daten gemäß ihrer eigenen
            Datenschutzrichtlinien. Weitere Informationen: anthropic.com/privacy
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-white">5. Eingesetzte Dienste</h2>
          <p className="text-sm text-gray-400">
            Folgende Drittanbieter werden zur Bereitstellung des Dienstes eingesetzt:
          </p>
          <ul className="text-sm text-gray-400 space-y-1 list-disc list-inside">
            <li>Neon Postgres — Datenbankhosting (DSGVO-konform)</li>
            <li>Cloudflare R2 — Dokumentenspeicherung (DSGVO-konform)</li>
            <li>NextAuth.js — Authentifizierung (läuft auf eigenem Server, keine Datenweitergabe)</li>
            <li>Anthropic API (Claude) — KI-Dokumentenverarbeitung (siehe Abschnitt 4)</li>
            <li>Vercel — Anwendungshosting (DSGVO-konformer Hosting-Dienst)</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-white">6. Ihre Rechte</h2>
          <p className="text-sm text-gray-400">
            Sie haben das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der
            Verarbeitung, Datenübertragbarkeit (Export) und Widerspruch gegen die Verarbeitung.
            Sie haben außerdem das Recht, sich bei der zuständigen Datenschutz-Aufsichtsbehörde
            zu beschweren (LDI NRW, Kavalleriestr. 2–4, 40213 Düsseldorf).
            Wenden Sie sich bei Anfragen an: info@maxpromo.digital
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-white">7. Kontakt Datenschutz</h2>
          <p className="text-sm text-gray-400">
            Bei Fragen zum Datenschutz: info@maxpromo.digital
          </p>
        </section>

        <p className="text-xs text-gray-400 pt-4">
          Stand: Juni 2026 &nbsp;|&nbsp;
          <a href="/impressum" className="hover:text-gray-400">Impressum</a>
          &nbsp;|&nbsp;
          <Link href="/" className="hover:text-gray-400">Zurück zur Startseite</Link>
        </p>
      </div>
    </div>
  )
}
