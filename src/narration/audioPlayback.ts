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
  if (audioCtx.state === 'suspended') {
    void audioCtx.resume()
  }
  return audioCtx
}

export function unlockNarrationAudio(): void {
  const ctx = getAudioContext()
  if (ctx?.state === 'suspended') void ctx.resume()
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

export function playArrayBuffer(data: ArrayBuffer, volume: number): Promise<void> {
  const ctx = getAudioContext()
  if (!ctx) return Promise.resolve()

  stopPlayback()

  return ctx
    .decodeAudioData(data.slice(0))
    .then((buffer) =>
      new Promise<void>((resolve) => {
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
      }),
    )
    .catch(() => undefined)
}

export function playBlob(blob: Blob, volume: number): Promise<void> {
  stopPlayback()

  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob)
    const audio = new Audio(url)
    audio.volume = volume
    currentElement = audio
    audio.onended = () => {
      URL.revokeObjectURL(url)
      if (currentElement === audio) currentElement = null
      resolve()
    }
    audio.onerror = () => {
      URL.revokeObjectURL(url)
      if (currentElement === audio) currentElement = null
      resolve()
    }
    void audio.play().catch(() => resolve())
  })
}
