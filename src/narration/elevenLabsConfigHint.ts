/** User-facing hint when the ElevenLabs API key is missing. */
export function elevenLabsConfigHint(options?: { includeNarrationSuffix?: boolean }): string {
  const onDeployedHost =
    typeof window !== 'undefined' &&
    window.location.hostname !== 'localhost' &&
    window.location.hostname !== '127.0.0.1'

  if (onDeployedHost) {
    return (
      'Set ELEVENLABS_API_KEY in the Vercel project Environment Variables ' +
      '(Production), then redeploy.' +
      (options?.includeNarrationSuffix ? ' Partner voice needs this key.' : '')
    )
  }

  return (
    'Add ELEVENLABS_API_KEY to .env and restart the dev server' +
    (options?.includeNarrationSuffix ? ' to enable narration.' : '.')
  )
}
