/**
 * Soft tactile tabletop SFX via Web Audio API.
 * No external assets — warm, short, non-arcade.
 */

export type SoundId =
  | 'select'
  | 'deselect'
  | 'draw'
  | 'discard'
  | 'place'
  | 'sort'
  | 'invalid'
  | 'threshold'
  | 'bookComplete'
  | 'goToFoot'
  | 'goOut'
  | 'yourTurn'
  | 'turnChange'
  | 'scoreTick'
  | 'chat'
  | 'button'

let ctx: AudioContext | null = null
let muted = false
let volume = 0.35

const MUTE_KEY = 'hf-sound-muted'

export function isMuted(): boolean {
  return muted
}

export function setMuted(value: boolean) {
  muted = value
  try {
    localStorage.setItem(MUTE_KEY, value ? '1' : '0')
  } catch {
    /* ignore */
  }
}

export function loadMutePreference() {
  try {
    muted = localStorage.getItem(MUTE_KEY) === '1'
  } catch {
    muted = false
  }
  return muted
}

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AC) return null
    ctx = new AC()
  }
  if (ctx.state === 'suspended') {
    void ctx.resume()
  }
  return ctx
}

function tone(
  frequency: number,
  duration: number,
  type: OscillatorType = 'sine',
  gain = 0.08,
  fade = 0.04,
) {
  const audio = getCtx()
  if (!audio || muted) return

  const now = audio.currentTime
  const osc = audio.createOscillator()
  const g = audio.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(frequency, now)
  g.gain.setValueAtTime(0, now)
  g.gain.linearRampToValueAtTime(gain * volume, now + 0.008)
  g.gain.exponentialRampToValueAtTime(0.0001, now + duration)
  osc.connect(g)
  g.connect(audio.destination)
  osc.start(now)
  osc.stop(now + duration + fade)
}

function noiseBurst(duration: number, gain = 0.05, filterFreq = 1200) {
  const audio = getCtx()
  if (!audio || muted) return

  const length = Math.floor(audio.sampleRate * duration)
  const buffer = audio.createBuffer(1, length, audio.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / length)
  }

  const src = audio.createBufferSource()
  src.buffer = buffer
  const filter = audio.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = filterFreq
  const g = audio.createGain()
  const now = audio.currentTime
  g.gain.setValueAtTime(gain * volume, now)
  g.gain.exponentialRampToValueAtTime(0.0001, now + duration)
  src.connect(filter)
  filter.connect(g)
  g.connect(audio.destination)
  src.start(now)
}

export function playSound(id: SoundId) {
  if (muted) return
  getCtx()

  switch (id) {
    case 'select':
      tone(520, 0.05, 'sine', 0.04)
      break
    case 'deselect':
      tone(380, 0.04, 'sine', 0.03)
      break
    case 'draw':
      noiseBurst(0.07, 0.04, 1800)
      tone(280, 0.08, 'triangle', 0.025)
      break
    case 'discard':
      noiseBurst(0.09, 0.055, 900)
      tone(220, 0.1, 'triangle', 0.035)
      break
    case 'place':
      noiseBurst(0.06, 0.045, 1100)
      break
    case 'sort':
      noiseBurst(0.05, 0.03, 2200)
      setTimeout(() => noiseBurst(0.04, 0.025, 2000), 40)
      setTimeout(() => noiseBurst(0.04, 0.02, 1800), 80)
      break
    case 'invalid':
      tone(160, 0.12, 'triangle', 0.05)
      break
    case 'threshold':
      tone(440, 0.12, 'sine', 0.05)
      setTimeout(() => tone(554, 0.14, 'sine', 0.045), 70)
      break
    case 'bookComplete':
      noiseBurst(0.08, 0.05, 800)
      setTimeout(() => {
        tone(523, 0.1, 'sine', 0.045)
        setTimeout(() => tone(659, 0.12, 'sine', 0.04), 60)
        setTimeout(() => tone(784, 0.16, 'sine', 0.035), 120)
      }, 50)
      break
    case 'goToFoot':
      tone(392, 0.1, 'sine', 0.045)
      setTimeout(() => tone(523, 0.14, 'sine', 0.04), 80)
      break
    case 'goOut':
      tone(392, 0.1, 'sine', 0.05)
      setTimeout(() => tone(523, 0.1, 'sine', 0.045), 90)
      setTimeout(() => tone(659, 0.12, 'sine', 0.04), 180)
      setTimeout(() => tone(784, 0.22, 'sine', 0.04), 280)
      break
    case 'yourTurn':
      tone(494, 0.1, 'sine', 0.04)
      setTimeout(() => tone(659, 0.14, 'sine', 0.035), 90)
      break
    case 'turnChange':
      tone(330, 0.08, 'sine', 0.025)
      break
    case 'scoreTick':
      tone(660, 0.04, 'sine', 0.025)
      break
    case 'chat':
      tone(700, 0.05, 'sine', 0.03)
      break
    case 'button':
      tone(400, 0.035, 'sine', 0.03)
      break
  }
}

/** Unlock audio on first user gesture (browser autoplay policy). */
export function unlockAudio() {
  const audio = getCtx()
  if (audio?.state === 'suspended') void audio.resume()
}
