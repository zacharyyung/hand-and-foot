import type { CommentaryRequest } from './types'
import { buildCommentary } from './commentary'

const pending = new Map<string, Promise<string>>()

export async function generateCommentary(request: CommentaryRequest): Promise<string> {
  const fallback = buildCommentary(request)
  const apiKey = import.meta.env.VITE_LLM_API_KEY
  const apiUrl = import.meta.env.VITE_LLM_API_URL ?? 'https://api.openai.com/v1/chat/completions'
  const model = import.meta.env.VITE_LLM_MODEL ?? 'gpt-4o-mini'

  if (!request.event || !apiKey) return fallback

  const cacheKey = `${request.event.type}:${request.personality}:${request.excitement}`
  const existing = pending.get(cacheKey)
  if (existing) return existing

  const promise = (async () => {
    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          temperature: 0.8,
          max_tokens: 60,
          messages: [
            {
              role: 'system',
              content:
                'You are a live Hand and Foot card game commentator at a premium tabletop. ' +
                'Write one short spoken sentence (under 20 words). No markdown, no quotes. ' +
                'Sound natural, warm, and specific to the moment.',
            },
            {
              role: 'user',
              content: JSON.stringify({
                event: request.event,
                personality: request.personality,
                excitement: request.excitement,
                roundNumber: request.game?.roundNumber ?? null,
                hint: fallback,
              }),
            },
          ],
        }),
      })

      if (!response.ok) return fallback
      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>
      }
      const text = data.choices?.[0]?.message?.content?.trim()
      if (!text) return fallback
      return text.replace(/^["']|["']$/g, '')
    } catch {
      return fallback
    } finally {
      pending.delete(cacheKey)
    }
  })()

  pending.set(cacheKey, promise)
  return promise
}
