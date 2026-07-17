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

/** Card-on-felt snap — layered paper + table thump like classic online card games. */
function cardTableSnap(options?: { harder?: boolean }) {
  const audioCtx = getCtx()
  if (!audioCtx || muted) return

  const now = audioCtx.currentTime
  const harder = options?.harder ?? false
  const vol = volume * (harder ? 1.12 : 1)

  function burst(
    ac: AudioContext,
    duration: number,
    gain: number,
    filterType: BiquadFilterType,
    filterFreq: number,
    q = 0.7,
    startOffset = 0,
  ) {
    const length = Math.floor(ac.sampleRate * duration)
    const buffer = ac.createBuffer(1, length, ac.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < length; i++) {
      const t = i / length
      const env = (1 - t) * (1 - t)
      data[i] = (Math.random() * 2 - 1) * env
    }

    const src = ac.createBufferSource()
    src.buffer = buffer
    const filter = ac.createBiquadFilter()
    filter.type = filterType
    filter.frequency.value = filterFreq
    filter.Q.value = q
    const g = ac.createGain()
    const t0 = now + startOffset
    g.gain.setValueAtTime(gain * vol, t0)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration)
    src.connect(filter)
    filter.connect(g)
    g.connect(ac.destination)
    src.start(t0)
  }

  // Paper edge snap
  burst(audioCtx, 0.02, 0.085, 'bandpass', harder ? 3600 : 3100, 1.15)
  // Card sliding onto felt
  burst(
    audioCtx,
    0.05,
    harder ? 0.075 : 0.058,
    'lowpass',
    harder ? 1500 : 1200,
    0.55,
    0.003,
  )
  // Table contact thump
  const thump = audioCtx.createOscillator()
  const thumpGain = audioCtx.createGain()
  thump.type = 'sine'
  thump.frequency.setValueAtTime(harder ? 92 : 108, now)
  thump.frequency.exponentialRampToValueAtTime(52, now + 0.045)
  thumpGain.gain.setValueAtTime(0, now)
  thumpGain.gain.linearRampToValueAtTime((harder ? 0.085 : 0.068) * vol, now + 0.002)
  thumpGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.065)
  thump.connect(thumpGain)
  thumpGain.connect(audioCtx.destination)
  thump.start(now)
  thump.stop(now + 0.075)
}

/** Completed book — page rustle + soft cover close (distinct from card snap). */
function bookCloseSound() {
  const audioCtx = getCtx()
  if (!audioCtx || muted) return

  const now = audioCtx.currentTime
  const vol = volume

  function paperSwipe(
    ac: AudioContext,
    startOffset: number,
    duration: number,
    gain: number,
    filterFreq: number,
  ) {
    const length = Math.floor(ac.sampleRate * duration)
    const buffer = ac.createBuffer(1, length, ac.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < length; i++) {
      const t = i / length
      const env = Math.sin(t * Math.PI)
      data[i] = (Math.random() * 2 - 1) * env * env
    }

    const src = ac.createBufferSource()
    src.buffer = buffer
    const filter = ac.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = filterFreq
    filter.Q.value = 0.85
    const g = ac.createGain()
    const t0 = now + startOffset
    g.gain.setValueAtTime(gain * vol, t0)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration)
    src.connect(filter)
    filter.connect(g)
    g.connect(ac.destination)
    src.start(t0)
  }

  // Pages sliding together
  paperSwipe(audioCtx, 0, 0.055, 0.07, 2800)
  paperSwipe(audioCtx, 0.05, 0.07, 0.055, 2100)

  // Cover settling shut
  const cover = audioCtx.createOscillator()
  const coverGain = audioCtx.createGain()
  cover.type = 'triangle'
  cover.frequency.setValueAtTime(118, now + 0.09)
  cover.frequency.exponentialRampToValueAtTime(62, now + 0.17)
  coverGain.gain.setValueAtTime(0, now + 0.09)
  coverGain.gain.linearRampToValueAtTime(0.09 * vol, now + 0.095)
  coverGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2)
  cover.connect(coverGain)
  coverGain.connect(audioCtx.destination)
  cover.start(now + 0.09)
  cover.stop(now + 0.22)

  // Felt/table muffled thump
  const length = Math.floor(audioCtx.sampleRate * 0.09)
  const buffer = audioCtx.createBuffer(1, length, audioCtx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i++) {
    const env = 1 - i / length
    data[i] = (Math.random() * 2 - 1) * env * env
  }
  const thumpSrc = audioCtx.createBufferSource()
  thumpSrc.buffer = buffer
  const thumpFilter = audioCtx.createBiquadFilter()
  thumpFilter.type = 'lowpass'
  thumpFilter.frequency.value = 320
  const thumpGain = audioCtx.createGain()
  const t0 = now + 0.1
  thumpGain.gain.setValueAtTime(0.06 * vol, t0)
  thumpGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.09)
  thumpSrc.connect(thumpFilter)
  thumpFilter.connect(thumpGain)
  thumpGain.connect(audioCtx.destination)
  thumpSrc.start(t0)

  // Warm single “sealed” note — reward without a jingle run
  const seal = audioCtx.createOscillator()
  const sealGain = audioCtx.createGain()
  seal.type = 'sine'
  seal.frequency.setValueAtTime(392, now + 0.14)
  sealGain.gain.setValueAtTime(0, now + 0.14)
  sealGain.gain.linearRampToValueAtTime(0.032 * vol, now + 0.155)
  sealGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32)
  seal.connect(sealGain)
  sealGain.connect(audioCtx.destination)
  seal.start(now + 0.14)
  seal.stop(now + 0.34)
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
      cardTableSnap({ harder: true })
      break
    case 'place':
      cardTableSnap()
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
      bookCloseSound()
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
