const EUR = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })

/** 1234.5 -> "1.234,50 €" */
export function eur(amount: number): string {
  return EUR.format(amount)
}

/** Signed amount for flows: "+1.234,50 €" / "−12,00 €" (true minus sign). */
export function eurSigned(amount: number, sign: '+' | '-'): string {
  return `${sign === '+' ? '+' : '−'}${EUR.format(Math.abs(amount))}`
}

const DATE = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' })
export function germanDate(value: string | Date): string {
  return DATE.format(typeof value === 'string' ? new Date(value) : value)
}
