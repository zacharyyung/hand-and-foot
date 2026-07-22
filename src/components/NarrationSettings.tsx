import { useEffect, useState } from 'react'
import { unlockAudio } from '../game/audio'
import {
  narrationService,
  NARRATOR_VOICES,
  type NarrationFrequency,
  type NarrationSettings,
} from '../narration'
import { refreshElevenLabsProviderStatus } from '../narration/providers/ElevenLabsProvider'

interface NarrationSettingsPanelProps {
  settings: NarrationSettings
  onChange: (settings: NarrationSettings) => void
}

const FREQUENCY_LABELS: Record<NarrationFrequency, string> = {
  minimal: 'Big moments only',
  normal: 'Light (recommended)',
  full: 'Detailed',
}

export function NarrationSettingsPanel({
  settings,
  onChange,
}: NarrationSettingsPanelProps) {
  const [providerLabel, setProviderLabel] = useState(() =>
    narrationService.getActiveProviderLabel(),
  )
  const [statusMessage, setStatusMessage] = useState<string | null>(() =>
    narrationService.getProviderStatusMessage(),
  )
  const [previewingVoiceId, setPreviewingVoiceId] = useState<string | null>(null)

  useEffect(() => {
    void refreshElevenLabsProviderStatus().then(() => {
      setProviderLabel(narrationService.getActiveProviderLabel())
      setStatusMessage(narrationService.getProviderStatusMessage())
    })
  }, [settings.enabled])

  function refreshStatus() {
    setProviderLabel(narrationService.getActiveProviderLabel())
    setStatusMessage(narrationService.getProviderStatusMessage())
  }

  function patch(partial: Partial<NarrationSettings>) {
    onChange(narrationService.updateSettings(partial))
    refreshStatus()
  }

  async function playVoiceSample(voiceId: string) {
    unlockAudio()
    narrationService.unlock()
    setPreviewingVoiceId(voiceId)
    try {
      await narrationService.previewVoice(voiceId)
      refreshStatus()
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Could not preview voice')
    } finally {
      setPreviewingVoiceId(null)
    }
  }

  function handleVoiceChange(voiceId: string) {
    patch({ voiceId })
    void playVoiceSample(voiceId)
  }

  const elevenLabsReady = narrationService.isProviderConfigured()
  const previewing = previewingVoiceId !== null

  return (
    <section className="rounded-xl bg-black/20 px-3 py-2.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
          Narration
        </p>
        <span
          className={`text-[10px] ${elevenLabsReady ? 'text-accent' : 'text-amber-200/90'}`}
        >
          {providerLabel}
        </span>
      </div>

      <button
        type="button"
        onClick={() => patch({ enabled: !settings.enabled })}
        className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-xs font-medium text-ink-soft hover:bg-white/8 hover:text-ink"
        aria-pressed={settings.enabled}
      >
        <span>Table commentary</span>
        <span>{settings.enabled ? 'On' : 'Off'}</span>
      </button>

      {settings.enabled && (
        <div className="mt-2 space-y-2 border-t border-white/8 pt-2">
          <label className="block px-2">
            <span className="mb-1 block text-[10px] text-ink-faint">Narrator</span>
            <select
              value={settings.voiceId}
              onChange={(e) => handleVoiceChange(e.target.value)}
              disabled={previewing}
              className="w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-ink-soft disabled:opacity-60"
            >
              {NARRATOR_VOICES.map((voice) => (
                <option key={voice.id} value={voice.id}>
                  {voice.name} — {voice.description}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[10px] text-ink-faint">
              {previewing
                ? `Playing ${NARRATOR_VOICES.find((v) => v.id === previewingVoiceId)?.name ?? 'voice'} sample…`
                : 'Select a voice to hear a sample line.'}
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

          <label className="block px-2">
            <span className="mb-1 block text-[10px] text-ink-faint">Frequency</span>
            <select
              value={settings.frequency}
              onChange={(e) => patch({ frequency: e.target.value as NarrationFrequency })}
              className="w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-ink-soft"
            >
              {(Object.keys(FREQUENCY_LABELS) as NarrationFrequency[]).map((key) => (
                <option key={key} value={key}>
                  {FREQUENCY_LABELS[key]}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={() => patch({ useLlmCommentary: !settings.useLlmCommentary })}
            className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-xs font-medium text-ink-soft hover:bg-white/8 hover:text-ink"
            aria-pressed={settings.useLlmCommentary}
          >
            <span>AI commentary</span>
            <span>{settings.useLlmCommentary ? 'On' : 'Off'}</span>
          </button>

          <button
            type="button"
            onClick={() => void playVoiceSample(settings.voiceId)}
            disabled={previewing || !elevenLabsReady}
            className="flex w-full items-center justify-center gap-2 rounded-lg px-2 py-2 text-xs font-medium text-ink-soft hover:bg-white/8 hover:text-ink disabled:opacity-50"
          >
            Replay voice sample
          </button>
        </div>
      )}

      <p className="mt-1.5 px-2 text-[10px] leading-relaxed text-ink-faint">
        {settings.enabled
          ? 'All narration uses ElevenLabs — pick a voice above to preview it.'
          : 'Turn on for a narrated tabletop experience.'}
      </p>

      {statusMessage && (
        <p className="mt-1.5 px-2 text-[10px] leading-relaxed text-amber-200/90">{statusMessage}</p>
      )}
    </section>
  )
}
