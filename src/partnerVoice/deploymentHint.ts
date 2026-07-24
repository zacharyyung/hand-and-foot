/** User-facing hint when ElevenLabs is not configured on the server. */
export function getElevenLabsSetupHint(): string {
  if (typeof window === 'undefined') {
    return 'Add ELEVENLABS_API_KEY to .env (local) or Vercel project settings (production).'
  }

  const host = window.location.hostname
  if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local')) {
    return 'Add ELEVENLABS_API_KEY to .env and restart the dev server.'
  }

  return 'Add ELEVENLABS_API_KEY in Vercel → Project Settings → Environment Variables, then redeploy.'
}
