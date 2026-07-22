import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import type { IncomingMessage, ServerResponse } from 'http'

const DEFAULT_MODEL = 'eleven_turbo_v2_5'

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString()))
      } catch (error) {
        reject(error)
      }
    })
    req.on('error', reject)
  })
}

function sendJson(res: ServerResponse, status: number, payload: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(payload))
}

function parseUpstreamError(raw: string, status: number): string {
  try {
    const parsed = JSON.parse(raw) as { detail?: { message?: string; code?: string } }
    if (parsed.detail?.code === 'paid_plan_required') {
      return 'This voice requires a paid ElevenLabs plan. Try Morgan or Alex instead.'
    }
    if (parsed.detail?.message) return parsed.detail.message
  } catch {
    /* fall through */
  }
  return raw.slice(0, 200) || `ElevenLabs request failed (${status})`
}

function elevenLabsDevProxy(env: Record<string, string>): Plugin {
  return {
    name: 'elevenlabs-dev-proxy',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/narration-tts')) return next()

        const apiKey = env.ELEVENLABS_API_KEY || env.VITE_ELEVENLABS_API_KEY
        const method = req.method ?? 'GET'

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

        try {
          const body = (await readJsonBody(req)) as {
            text?: string
            voiceId?: string
            speed?: number
            modelId?: string
          }
          const text = body.text?.trim()
          const voiceId = body.voiceId?.trim()
          if (!text || !voiceId) {
            sendJson(res, 400, { error: 'text and voiceId are required' })
            return
          }

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
                model_id: body.modelId ?? env.ELEVENLABS_MODEL ?? DEFAULT_MODEL,
                voice_settings: {
                  stability: 0.45,
                  similarity_boost: 0.75,
                  style: 0.35,
                  use_speaker_boost: true,
                  speed: body.speed ?? 1,
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
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), elevenLabsDevProxy(env)],
  }
})
