import type { AiDifficulty } from '../game/deal'
import {
  PLAYER_COUNT_OPTIONS,
  teamIdForSeat,
  type PlayerCount,
} from '../game/teams'
import { playSound } from '../game/audio'
import type { PartnerVoiceSettings } from '../partnerVoice'
import { PartnerVoiceSettingsPanel } from './PartnerVoiceSettings'

export const AI_AVATAR = '🤖'

export const HUMAN_AVATARS = [
  '🐶',
  '🐱',
  '🐻',
  '🦊',
  '🐼',
  '🐨',
  '🦁',
  '🐯',
  '🐸',
  '🐙',
  '🦄',
  '🐲',
] as const

export type Avatar = (typeof HUMAN_AVATARS)[number]

export const AI_DIFFICULTIES: { value: AiDifficulty; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'expert', label: 'Expert' },
]

export interface SetupHuman {
  name: string
  age: number
  avatar: Avatar
}

export interface SetupPlayer {
  name: string
  age: number
  avatar: string
  isHuman: boolean
  aiDifficulty: AiDifficulty
}

interface SetupScreenProps {
  playerCount: PlayerCount
  onPlayerCountChange: (count: PlayerCount) => void
  humanCount: number
  onHumanCountChange: (count: number) => void
  humanPlayers: SetupHuman[]
  onHumanPlayersChange: (players: SetupHuman[]) => void
  aiDifficulty: AiDifficulty
  onAiDifficultyChange: (difficulty: AiDifficulty) => void
  onStart: () => void
  partnerVoiceSettings: PartnerVoiceSettings
  onPartnerVoiceChange: (settings: PartnerVoiceSettings) => void
  savedSessionLabel?: string | null
  onResumeSaved?: () => void
  onDiscardSaved?: () => void
}

export function createDefaultHumanPlayers(count: number): SetupHuman[] {
  return Array.from({ length: count }, (_, i) => ({
    name: '',
    age: 0,
    avatar: HUMAN_AVATARS[i % HUMAN_AVATARS.length],
  }))
}

export function buildSetupPlayers(
  humanPlayers: SetupHuman[],
  playerCount: PlayerCount,
  aiDifficulty: AiDifficulty,
): SetupPlayer[] {
  return Array.from({ length: playerCount }, (_, i) => {
    if (i < humanPlayers.length) {
      const human = humanPlayers[i]
      return {
        name: human.name,
        age: humanPlayers.length >= 2 ? human.age : 0,
        avatar: human.avatar,
        isHuman: true,
        aiDifficulty: 'normal',
      }
    }
    return {
      name: `AI ${i + 1}`,
      age: 0,
      avatar: AI_AVATAR,
      isHuman: false,
      aiDifficulty,
    }
  })
}

/** @deprecated Use createDefaultHumanPlayers + buildSetupPlayers */
export function createDefaultSetupPlayers(count: PlayerCount, humans = 1): SetupPlayer[] {
  return buildSetupPlayers(createDefaultHumanPlayers(humans), count, 'normal')
}

export function SetupScreen({
  playerCount,
  onPlayerCountChange,
  humanCount,
  onHumanCountChange,
  humanPlayers,
  onHumanPlayersChange,
  aiDifficulty,
  onAiDifficultyChange,
  onStart,
  partnerVoiceSettings,
  onPartnerVoiceChange,
  savedSessionLabel = null,
  onResumeSaved,
  onDiscardSaved,
}: SetupScreenProps) {
  function updateHuman(index: number, patch: Partial<SetupHuman>) {
    const next = [...humanPlayers]
    next[index] = { ...next[index], ...patch }
    onHumanPlayersChange(next)
  }

  function setHumanCount(count: number) {
    playSound('button')
    onHumanCountChange(count)
    if (humanPlayers.length < count) {
      onHumanPlayersChange([
        ...humanPlayers,
        ...createDefaultHumanPlayers(count).slice(humanPlayers.length),
      ])
    } else if (humanPlayers.length > count) {
      onHumanPlayersChange(humanPlayers.slice(0, count))
    }
  }

  const askAge = humanCount >= 2

  const humansValid = humanPlayers.every(
    (p) => p.name.trim().length > 0 && (!askAge || p.age > 0),
  )
  const canStart = humanPlayers.length > 0 && humansValid

  function adjustAge(index: number, delta: number) {
    playSound('button')
    const current = humanPlayers[index].age || 0
    const next = Math.min(120, Math.max(1, current + delta))
    updateHuman(index, { age: next })
  }

  function setupChoiceClass(selected: boolean, sizeClass: string): string {
    return [
      'setup-choice font-display transition-all duration-150 ease-press',
      sizeClass,
      selected ? 'setup-choice-selected' : 'font-semibold',
    ].join(' ')
  }

  const aiCount = playerCount - humanCount

  return (
    <div className="setup-screen relative mx-auto max-w-2xl px-5 pb-[max(3rem,calc(var(--safe-bottom)+2rem))] pt-[max(3rem,calc(var(--safe-top)+2.5rem))] sm:px-6 sm:pb-16 sm:pt-16">
      <header className="setup-screen-header mb-8 text-center sm:mb-12">
        <p className="setup-screen-eyebrow mb-2 font-sans text-[11px] uppercase tracking-[0.22em] text-ink-faint">
          Tabletop
        </p>
        <h1 className="setup-screen-title font-display text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
          Hand &amp; Foot
        </h1>
        <p className="setup-screen-subtitle mx-auto mt-3 max-w-md text-sm text-ink-muted">
          A calm, premium take on the classic team rummy game.
        </p>
      </header>

      <div className="setup-screen-body space-y-8">
        <section className="setup-screen-section">
          <label className="setup-screen-label mb-3 block text-center text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted">
            Players
          </label>
          <div className="flex flex-wrap justify-center gap-2">
            {PLAYER_COUNT_OPTIONS.map((count) => (
              <button
                key={count}
                onClick={() => {
                  playSound('button')
                  onPlayerCountChange(count)
                }}
                className={setupChoiceClass(
                  playerCount === count,
                  'setup-choice-count min-w-[4.5rem] rounded-xl px-4 py-2.5',
                )}
              >
                <span className="block text-lg font-[inherit] leading-none">{count}</span>
                <span
                  className={`setup-choice-sub mt-0.5 block text-[10px] ${
                    playerCount === count ? '' : 'font-normal text-ink-faint'
                  }`}
                >
                  {count / 2} teams
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="setup-screen-section">
          <label className="setup-screen-label mb-3 block text-center text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted">
            Humans at the table
          </label>
          <div className="flex flex-wrap justify-center gap-2">
            {Array.from({ length: playerCount }, (_, i) => i + 1).map((count) => (
              <button
                key={count}
                type="button"
                onClick={() => setHumanCount(count)}
                className={setupChoiceClass(
                  humanCount === count,
                  'setup-choice-human min-w-[3rem] rounded-xl px-3 py-2',
                )}
              >
                <span className="text-base font-[inherit] leading-none">{count}</span>
              </button>
            ))}
          </div>
        </section>

        {aiCount > 0 && (
          <section className="setup-screen-section">
            <label className="setup-screen-label mb-3 block text-center text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted">
              AI expertise
            </label>
            <div className="flex flex-wrap justify-center gap-2">
              {AI_DIFFICULTIES.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    playSound('button')
                    onAiDifficultyChange(option.value)
                  }}
                  className={setupChoiceClass(
                    aiDifficulty === option.value,
                    'setup-choice-ai min-w-[5.5rem] rounded-xl px-4 py-2.5',
                  )}
                >
                  <span className="text-base font-[inherit] leading-none">{option.label}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        <div className="setup-screen-players space-y-4">
          {humanPlayers.map((player, index) => (
            <div
              key={index}
              className="setup-player-card rounded-2xl bg-black/25 px-4 py-4"
            >
              <div className="setup-player-card-meta mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-ink">
                  Player {index + 1}
                  <span className="ml-2 text-[11px] font-normal text-ink-faint">
                    Seat {index + 1} · Team {teamIdForSeat(index, playerCount) + 1}
                  </span>
                </p>
              </div>

              <div className="setup-player-card-fields flex flex-col gap-4">
                <div className="setup-avatar-field flex min-w-0 flex-col gap-1.5">
                  <span className="text-[10px] text-ink-faint">Avatar</span>
                  <div className="setup-avatar-grid flex flex-wrap gap-1.5">
                    {HUMAN_AVATARS.map((avatar) => (
                      <button
                        key={avatar}
                        onClick={() => {
                          playSound('select')
                          updateHuman(index, { avatar })
                        }}
                        className={`setup-avatar-btn rounded-lg px-1.5 py-1 text-lg transition ${
                          player.avatar === avatar
                            ? 'bg-accent/25 ring-1 ring-accent/60'
                            : 'bg-white/5 hover:bg-white/10'
                        }`}
                      >
                        {avatar}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap items-end gap-4">
                  <label className="setup-name-field flex min-w-[12rem] flex-1 flex-col gap-1.5">
                    <span className="text-[10px] text-ink-faint">Name</span>
                    <input
                      value={player.name}
                      onChange={(e) => updateHuman(index, { name: e.target.value })}
                      placeholder={`Player ${index + 1}`}
                      className="field-control px-3 py-2 text-sm"
                    />
                  </label>
                  {askAge && (
                    <label className="flex flex-col gap-1.5">
                      <span className="text-[10px] text-ink-faint">Age</span>
                      <div className="field-age-group">
                        <button
                          type="button"
                          className="field-stepper"
                          aria-label="Decrease age"
                          disabled={player.age <= 1}
                          onClick={() => adjustAge(index, -1)}
                        >
                          −
                        </button>
                        <input
                          type="number"
                          min={1}
                          max={120}
                          value={player.age || ''}
                          onChange={(e) =>
                            updateHuman(index, { age: Number(e.target.value) })
                          }
                          className="field-control field-control--number py-2 text-sm"
                        />
                        <button
                          type="button"
                          className="field-stepper"
                          aria-label="Increase age"
                          disabled={player.age >= 120}
                          onClick={() => adjustAge(index, 1)}
                        >
                          +
                        </button>
                      </div>
                    </label>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-8">
        <PartnerVoiceSettingsPanel
          settings={partnerVoiceSettings}
          onChange={onPartnerVoiceChange}
        />
      </div>

      <button
        onClick={onStart}
        disabled={!canStart}
        className="setup-screen-cta btn-primary mt-10 w-full py-3.5 text-sm disabled:opacity-40"
      >
        {savedSessionLabel ? 'New game' : 'Sit down & deal'}
      </button>

      {savedSessionLabel && onResumeSaved && onDiscardSaved && (
        <div className="setup-saved-session mt-4 rounded-2xl border border-accent/25 bg-black/30 px-4 py-3.5">
          <p className="text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-accent">
            Saved game
          </p>
          <p className="mt-1.5 text-center text-xs text-ink-soft">{savedSessionLabel}</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => {
                playSound('button')
                onResumeSaved()
              }}
              className="btn-primary flex-1 py-2.5 text-sm"
            >
              Resume
            </button>
            <button
              type="button"
              onClick={() => {
                playSound('button')
                onDiscardSaved()
              }}
              className="btn-secondary flex-1 py-2.5 text-sm"
            >
              Discard saved
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
