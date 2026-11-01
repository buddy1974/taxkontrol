/**
 * Single entry point for Claude API calls (official SDK).
 *
 * - Model is configurable via ANTHROPIC_MODEL (default: claude-opus-5-5).
 * - JSON results use structured outputs (zod schema) so responses are
 *   validated, never regex-stripped and JSON.parsed.
 * - Server-side refusal fallback ("default" routing) is enabled.
 * - Every helper returns null instead of throwing: AI output is only ever a
 *   SUGGESTION that the user reviews; a failed call means "fill in manually".
 */
import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import type { z } from 'zod'

export const AI_MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-5-5'
const FALLBACK_BETA = 'server-side-fallback-2026-07-01'

let client: Anthropic | null = null
function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null
  client ??= new Anthropic({ timeout: 90_000, maxRetries: 2 })
  return client
}

export type FileMediaType = 'image/jpeg' | 'image/png' | 'application/pdf'

/** Builds the content block for an uploaded file. */
export function fileBlock(base64: string, mediaType: FileMediaType): Anthropic.Beta.BetaContentBlockParam {
  return mediaType === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
    : { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } }
}

function logFailure(task: string, err: unknown) {
  if (err instanceof Anthropic.APIError) {
    console.error(`[ai:${task}] API error ${err.status}`)
  } else {
    console.error(`[ai:${task}] failed: ${err instanceof Error ? err.name : typeof err}`)
  }
}

/** Asks Claude for JSON matching `schema`. Returns null on any failure or refusal. */
export async function extractStructured<S extends z.ZodType>(params: {
  task: string
  schema: S
  content: Anthropic.Beta.BetaContentBlockParam[]
  maxTokens?: number
}): Promise<z.infer<S> | null> {
  const c = getClient()
  if (!c) return null
  try {
    const response = await c.beta.messages.parse({
      model: AI_MODEL,
      max_tokens: params.maxTokens ?? 4096,
      betas: [FALLBACK_BETA],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: betaZodOutputFormat(params.schema) },
      messages: [{ role: 'user', content: params.content }],
    })
    if (response.stop_reason === 'refusal' || response.stop_reason === 'max_tokens') {
      console.warn(`[ai:${params.task}] no usable result (stop_reason=${response.stop_reason})`)
      return null
    }
    return (response.parsed_output as z.infer<S> | null) ?? null
  } catch (err) {
    logFailure(params.task, err)
    return null
  }
}

/** Plain-text answer (e.g. OCR of a letter). Returns null on failure or refusal. */
export async function extractText(params: {
  task: string
  content: Anthropic.Beta.BetaContentBlockParam[]
  maxTokens?: number
}): Promise<string | null> {
  const c = getClient()
  if (!c) return null
  try {
    const response = await c.beta.messages.create({
      model: AI_MODEL,
      max_tokens: params.maxTokens ?? 8192,
      betas: [FALLBACK_BETA],
      fallbacks: 'default',
      output_config: { effort: 'low' },
      messages: [{ role: 'user', content: params.content }],
    })
    if (response.stop_reason === 'refusal') return null
    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
      .map(b => b.text)
      .join('\n')
      .trim()
    return text || null
  } catch (err) {
    logFailure(params.task, err)
    return null
  }
}
