import { useEffect, useState } from 'react'
import { unlockAudio } from '../game/audio'
import { NARRATOR_VOICES } from '../narration/types'
import { refreshElevenLabsProviderStatus } from '../narration/providers/ElevenLabsProvider'
import {
  partnerVoiceService,
  type PartnerVoiceSettings,
} from '../partnerVoice'

interface PartnerVoiceSettingsPanelProps {
  settings: PartnerVoiceSettings
  onChange: (settings: PartnerVoiceSettings) => void
}

export function PartnerVoiceSettingsPanel({
  settings,
  onChange,
}: PartnerVoiceSettingsPanelProps) {
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [previewing, setPreviewing] = useState(false)

  useEffect(() => {
    void refreshElevenLabsProviderStatus().then(() => {
      setStatusMessage(partnerVoiceService.getStatusMessage())
    })
  }, [settings.enabled])

  function patch(partial: Partial<PartnerVoiceSettings>) {
    onChange(partnerVoiceService.updateSettings(partial))
    setStatusMessage(partnerVoiceService.getStatusMessage())
  }

  async function handleVoiceChange(voiceId: string) {
    patch({ voiceId })
    unlockAudio()
    partnerVoiceService.unlock()
    setPreviewing(true)
    try {
      await partnerVoiceService.previewVoice(voiceId)
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Could not preview voice')
    } finally {
      setPreviewing(false)
    }
  }

  return (
    <section className="rounded-xl bg-black/20 px-3 py-2.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
          Partner voice
        </p>
        <span className="text-[10px] text-accent">
          {partnerVoiceService.isConfigured() ? 'ElevenLabs' : 'Not configured'}
        </span>
      </div>

      <button
        type="button"
        onClick={() => patch({ enabled: !settings.enabled })}
        className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-xs font-medium text-ink-soft hover:bg-white/8 hover:text-ink"
        aria-pressed={settings.enabled}
      >
        <span>AI partner speaks</span>
        <span>{settings.enabled ? 'On' : 'Off'}</span>
      </button>

      {settings.enabled && (
        <div className="mt-2 space-y-2 border-t border-white/8 pt-2">
          <label className="block px-2">
            <span className="mb-1 block text-[10px] text-ink-faint">Partner voice</span>
            <select
              value={settings.voiceId}
              onChange={(e) => void handleVoiceChange(e.target.value)}
              disabled={previewing}
              className="w-full rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-base text-ink-soft disabled:opacity-60"
            >
              {NARRATOR_VOICES.map((voice) => (
                <option key={voice.id} value={voice.id}>
                  {voice.name} — {voice.description}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[10px] text-ink-faint">
              {previewing ? 'Playing sample…' : 'Select a voice to hear a sample.'}
            </p>
          </label>

          <label className="block px-2">
            <span className="mb-1 flex items-center justify-between text-[10px] text-ink-faint">
              <span>Volume</span>
              <span>{Math.round(settings.volume * 100)}%</span>
            </span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(settings.volume * 100)}
              onChange={(e) => patch({ volume: Number(e.target.value) / 100 })}
              className="w-full accent-accent"
            />
          </label>

          <label className="block px-2">
            <span className="mb-1 flex items-center justify-between text-[10px] text-ink-faint">
              <span>Speaking speed</span>
              <span>{settings.speed.toFixed(2)}×</span>
            </span>
            <input
              type="range"
              min={70}
              max={130}
              value={Math.round(settings.speed * 100)}
              onChange={(e) => patch({ speed: Number(e.target.value) / 100 })}
              className="w-full accent-accent"
            />
          </label>
        </div>
      )}

      <p className="mt-1.5 px-2 text-[10px] leading-relaxed text-ink-faint">
        Your AI partner speaks for go-out checks, wild-card asks, and replies — not general
        play-by-play.
      </p>

      {statusMessage && (
        <p className="mt-1.5 px-2 text-[10px] leading-relaxed text-amber-200/90">{statusMessage}</p>
      )}
    </section>
  )
}
