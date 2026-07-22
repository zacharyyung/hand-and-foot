import type { IncomingMessage, ServerResponse } from 'http'

const DEFAULT_MODEL = 'eleven_turbo_v2_5'

function parseUpstreamError(raw: string, status: number): string {
  try {
    const parsed = JSON.parse(raw) as { detail?: unknown; message?: string }
    if (parsed.detail && typeof parsed.detail === 'object') {
      const detail = parsed.detail as { message?: string; code?: string }
      if (detail.code === 'paid_plan_required') {
        return 'This voice requires a paid ElevenLabs plan. Try Morgan or Alex instead.'
      }
      if (detail.message) return detail.message
    }
    if (parsed.message) return parsed.message
  } catch {
    /* fall through */
  }
  return raw.slice(0, 200) || `ElevenLabs request failed (${status})`
}

interface TtsRequestBody {
  text?: string
  voiceId?: string
  speed?: number
  modelId?: string
}

function getApiKey(): string | undefined {
  return process.env.ELEVENLABS_API_KEY ?? process.env.VITE_ELEVENLABS_API_KEY
}

function sendJson(res: ServerResponse, status: number, payload: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(payload))
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const method = req.method ?? 'GET'
  const apiKey = getApiKey()

  if (method === 'GET') {
    sendJson(res, 200, {
      configured: Boolean(apiKey),
      provider: 'elevenlabs',
    })
    return
  }

  if (method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' })
    return
  }

  if (!apiKey) {
    sendJson(res, 503, {
      error: 'ELEVENLABS_API_KEY not configured',
      hint: 'Add ELEVENLABS_API_KEY to .env and restart the dev server.',
    })
    return
  }

  let body: TtsRequestBody = {}
  try {
    const chunks: Buffer[] = []
    for await (const chunk of req) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
    }
    body = JSON.parse(Buffer.concat(chunks).toString()) as TtsRequestBody
  } catch {
    sendJson(res, 400, { error: 'Invalid JSON body' })
    return
  }

  const text = body.text?.trim()
  const voiceId = body.voiceId?.trim()
  if (!text || !voiceId) {
    sendJson(res, 400, { error: 'text and voiceId are required' })
    return
  }

  const speed = body.speed ?? 1
  const modelId = body.modelId ?? process.env.ELEVENLABS_MODEL ?? DEFAULT_MODEL

  try {
    const upstream = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify({
          text,
          model_id: modelId,
          voice_settings: {
            stability: 0.45,
            similarity_boost: 0.75,
            style: 0.35,
            use_speaker_boost: true,
            speed,
          },
          optimize_streaming_latency: 3,
        }),
      },
    )

    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => '')
      sendJson(res, upstream.status, {
        error: 'ElevenLabs request failed',
        detail: parseUpstreamError(detail, upstream.status),
      })
      return
    }

    const audio = Buffer.from(await upstream.arrayBuffer())
    res.statusCode = 200
    res.setHeader('Content-Type', 'audio/mpeg')
    res.setHeader('Cache-Control', 'no-store')
    res.end(audio)
  } catch (error) {
    sendJson(res, 502, {
      error: 'Failed to reach ElevenLabs',
      detail: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}
