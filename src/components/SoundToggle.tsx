import { useEffect, useState } from 'react'
import { isMuted, loadMutePreference, playSound, setMuted, unlockAudio } from '../game/audio'

interface SoundToggleProps {
  variant?: 'icon' | 'row' | 'chip'
}

export function SoundToggle({ variant = 'icon' }: SoundToggleProps) {
  const [muted, setMutedState] = useState(false)

  useEffect(() => {
    setMutedState(loadMutePreference())
  }, [])

  function toggle() {
    unlockAudio()
    const next = !isMuted()
    setMuted(next)
    setMutedState(next)
    if (!next) playSound('button')
  }

  if (variant === 'row') {
    return (
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-xs font-medium text-ink-soft hover:bg-white/8 hover:text-ink"
        aria-label={muted ? 'Unmute sounds' : 'Mute sounds'}
      >
        <span>Volume</span>
        <span>{muted ? 'Muted' : 'On'}</span>
      </button>
    )
  }

  if (variant === 'chip') {
    return (
      <button
        type="button"
        onClick={toggle}
        className="corner-control"
        aria-label={muted ? 'Unmute sounds' : 'Mute sounds'}
        aria-pressed={!muted}
      >
        {muted ? '🔇 Sound off' : '🔊 Sound on'}
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="rounded-lg px-2 py-1 text-[11px] font-medium text-ink-muted hover:bg-white/10 hover:text-ink"
      aria-label={muted ? 'Unmute sounds' : 'Mute sounds'}
      title={muted ? 'Sound off' : 'Sound on'}
    >
      {muted ? '🔇' : '🔊'}
    </button>
  )
}
