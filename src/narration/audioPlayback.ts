let audioCtx: AudioContext | null = null
let currentSource: AudioBufferSourceNode | null = null
let currentElement: HTMLAudioElement | null = null

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!audioCtx) {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AC) return null
    audioCtx = new AC()
  }
  return audioCtx
}

async function ensureRunning(ctx: AudioContext): Promise<boolean> {
  if (ctx.state === 'running') return true
  try {
    await ctx.resume()
  } catch {
    return false
  }
  return (ctx.state as AudioContextState) === 'running'
}

/** Unlock partner-voice Web Audio on a real user gesture (iOS Safari autoplay). */
export function unlockNarrationAudio(): void {
  const ctx = getAudioContext()
  if (!ctx) return
  void ensureRunning(ctx)
  // A tiny silent buffer during the gesture fully unlocks Web Audio on iOS.
  try {
    const buffer = ctx.createBuffer(1, 1, ctx.sampleRate)
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(ctx.destination)
    source.start(0)
  } catch {
    /* ignore unlock priming failures */
  }
}

export function stopPlayback(): void {
  if (currentSource) {
    try {
      currentSource.stop()
    } catch {
      /* already stopped */
    }
    currentSource.disconnect()
    currentSource = null
  }
  if (currentElement) {
    currentElement.pause()
    if (currentElement.src.startsWith('blob:')) {
      URL.revokeObjectURL(currentElement.src)
    }
    currentElement = null
  }
}

/**
 * Play TTS via Web Audio. Prefer this over HTMLAudioElement — mobile Safari
 * blocks MediaElement.play() after an async network fetch even when SFX work.
 */
export async function playArrayBuffer(data: ArrayBuffer, volume: number): Promise<void> {
  const ctx = getAudioContext()
  if (!ctx) return

  stopPlayback()

  if (!(await ensureRunning(ctx))) return

  try {
    const buffer = await ctx.decodeAudioData(data.slice(0))
    await new Promise<void>((resolve) => {
      const source = ctx.createBufferSource()
      const gain = ctx.createGain()
      source.buffer = buffer
      gain.gain.value = volume
      source.connect(gain)
      gain.connect(ctx.destination)
      source.onended = () => {
        if (currentSource === source) currentSource = null
        resolve()
      }
      currentSource = source
      source.start(0)
    })
  } catch {
    /* decode / play failures should not interrupt gameplay */
  }
}

/** Decode blob audio and play through Web Audio (same mobile-safe path). */
export async function playBlob(blob: Blob, volume: number): Promise<void> {
  const data = await blob.arrayBuffer()
  await playArrayBuffer(data, volume)
}
