/**
 * Error logging without personal data.
 *
 * Prisma error messages echo the query arguments (names, e-mails, amounts,
 * free text). Those must not end up in hosted logs, so for Prisma errors only
 * the class, the error code and the model are logged. For other errors the
 * first line of the message (capped) and the stack frames are logged.
 */
export function safeErrorSummary(err: unknown): string {
  if (!(err instanceof Error)) return `non-error thrown (${typeof err})`
  const name = err.name || 'Error'
  if (name.startsWith('PrismaClient')) {
    const code = (err as { code?: unknown }).code
    const model = (err as { meta?: { modelName?: unknown } }).meta?.modelName
    return [name, typeof code === 'string' ? code : null, typeof model === 'string' ? model : null].filter(Boolean).join(' ')
  }
  const firstLine = (err.message ?? '').split('\n')[0].slice(0, 200)
  const frames = (err.stack ?? '').split('\n').filter(l => l.trimStart().startsWith('at ')).slice(0, 8).join('\n')
  return `${name}: ${firstLine}${frames ? `\n${frames}` : ''}`
}

export function logError(context: string, err: unknown): void {
  console.error(`[${context}] ${safeErrorSummary(err)}`)
}
