import { useEffect, useState } from 'react'
import { isMuted, loadMutePreference, playSound, setMuted, unlockAudio } from '../game/audio'

export function SoundToggle() {
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
