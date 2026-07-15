import type { AiDifficulty } from '../game/deal'
import {
  partnerSeat,
  PLAYER_COUNT_OPTIONS,
  teamIdForSeat,
  type PlayerCount,
} from '../game/teams'
import { playSound } from '../game/audio'
import { SoundToggle } from './SoundToggle'

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

export const AVATARS = [...HUMAN_AVATARS, AI_AVATAR] as const

export type Avatar = (typeof AVATARS)[number]

export const AI_DIFFICULTIES: { value: AiDifficulty; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'expert', label: 'Expert' },
]

export interface SetupPlayer {
  name: string
  age: number
  avatar: Avatar
  isHuman: boolean
  aiDifficulty: AiDifficulty
}

interface SetupScreenProps {
  playerCount: PlayerCount
  onPlayerCountChange: (count: PlayerCount) => void
  humanCount: number
  onHumanCountChange: (count: number) => void
  players: SetupPlayer[]
  onPlayersChange: (players: SetupPlayer[]) => void
  onStart: () => void
}

export function createDefaultSetupPlayers(count: number, humans = 1): SetupPlayer[] {
  return Array.from({ length: count }, (_, i) => ({
    name: i < humans ? '' : `AI ${i + 1}`,
    age: i < humans ? 0 : 0,
    avatar: i < humans ? HUMAN_AVATARS[i % HUMAN_AVATARS.length] : AI_AVATAR,
    isHuman: i < humans,
    aiDifficulty: 'normal' as AiDifficulty,
  }))
}

export function SetupScreen({
  playerCount,
  onPlayerCountChange,
  humanCount,
  onHumanCountChange,
  players,
  onPlayersChange,
  onStart,
}: SetupScreenProps) {
  function updatePlayer(index: number, patch: Partial<SetupPlayer>) {
    const next = [...players]
    next[index] = { ...next[index], ...patch }
    onPlayersChange(next)
  }

  function setHumanCount(count: number) {
    playSound('button')
    onHumanCountChange(count)
    const next = players.map((p, i) => {
      const isHuman = i < count
      return {
        ...p,
        isHuman,
        name: isHuman ? (p.isHuman ? p.name : '') : `AI ${i + 1}`,
        age: isHuman ? (p.isHuman ? p.age : 0) : 0,
        avatar: isHuman
          ? p.isHuman
            ? p.avatar
            : HUMAN_AVATARS[i % HUMAN_AVATARS.length]
          : AI_AVATAR,
      }
    })
    onPlayersChange(next)
  }

  function toggleHuman(index: number) {
    playSound('button')
    const isHuman = !players[index].isHuman
    updatePlayer(index, {
      isHuman,
      name: isHuman ? '' : `AI ${index + 1}`,
      age: isHuman ? 0 : 0,
      avatar: isHuman ? HUMAN_AVATARS[index % HUMAN_AVATARS.length] : AI_AVATAR,
    })
    const newHumanCount = players.filter((p, i) =>
      i === index ? isHuman : p.isHuman,
    ).length
    onHumanCountChange(newHumanCount)
  }

  const humansValid = players
    .filter((p) => p.isHuman)
    .every((p) => p.name.trim().length > 0 && p.age > 0)
  const canStart = humansValid

  return (
    <div className="relative mx-auto max-w-2xl px-6 py-12 sm:py-16">
      <div className="absolute right-6 top-6">
        <SoundToggle />
      </div>

      <header className="mb-10 text-center sm:mb-12">
        <p className="mb-2 font-sans text-[11px] uppercase tracking-[0.22em] text-ink-faint">
          Tabletop
        </p>
        <h1 className="font-display text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
          Hand &amp; Foot
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm text-ink-muted">
          A calm, premium take on the classic team rummy game.
        </p>
      </header>

      <section className="mb-8">
        <label className="mb-3 block text-center text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted">
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
              className={`min-w-[4.5rem] rounded-xl px-4 py-2.5 transition-all duration-150 ease-press ${
                playerCount === count
                  ? 'bg-accent text-felt-deep shadow-md'
                  : 'bg-white/10 text-ink-soft hover:bg-white/15'
              }`}
            >
              <span className="block font-display text-lg font-semibold leading-none">
                {count}
              </span>
              <span
                className={`mt-0.5 block text-[10px] ${
                  playerCount === count ? 'text-felt-deep/70' : 'text-ink-faint'
                }`}
              >
                {count / 2} teams
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="mb-10">
        <label className="mb-3 block text-center text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted">
          Humans at the table
        </label>
        <div className="flex flex-wrap justify-center gap-2">
          {Array.from({ length: playerCount + 1 }, (_, i) => i).map((count) => (
            <button
              key={count}
              type="button"
              onClick={() => setHumanCount(count)}
              className={`min-w-[3rem] rounded-xl px-3 py-2 transition-all duration-150 ${
                humanCount === count
                  ? 'bg-accent text-felt-deep'
                  : 'bg-white/10 text-ink-soft hover:bg-white/15'
              }`}
            >
              <span className="font-display text-base font-semibold">{count}</span>
            </button>
          ))}
        </div>
      </section>

      <div className="space-y-3">
        {players.map((player, index) => (
          <div
            key={index}
            className="rounded-2xl bg-black/25 px-4 py-3.5 backdrop-blur-sm"
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-ink">
                Seat {index + 1}
                <span className="ml-2 text-[11px] font-normal text-ink-faint">
                  team {teamIdForSeat(index, playerCount) + 1} · partner{' '}
                  {partnerSeat(index, playerCount) + 1}
                </span>
              </p>
              <button
                onClick={() => toggleHuman(index)}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold ${
                  player.isHuman
                    ? 'bg-sky-500/20 text-sky-200'
                    : 'bg-white/10 text-ink-muted'
                }`}
              >
                {player.isHuman ? 'Human' : 'AI'}
              </button>
            </div>

            <div className="flex flex-wrap items-end gap-4">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-ink-faint">Avatar</span>
                <div className="flex flex-wrap gap-1">
                  {AVATARS.map((avatar) => (
                    <button
                      key={avatar}
                      onClick={() => {
                        playSound('select')
                        updatePlayer(index, { avatar })
                      }}
                      className={`rounded-lg px-1.5 py-1 text-lg transition ${
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

              {player.isHuman ? (
                <>
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] text-ink-faint">Name</span>
                    <input
                      value={player.name}
                      onChange={(e) => updatePlayer(index, { name: e.target.value })}
                      placeholder={`Player ${index + 1}`}
                      className="rounded-xl border-0 bg-white/10 px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-1 focus:ring-accent/50"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] text-ink-faint">Age</span>
                    <input
                      type="number"
                      min={1}
                      max={120}
                      value={player.age || ''}
                      onChange={(e) =>
                        updatePlayer(index, { age: Number(e.target.value) })
                      }
                      className="w-20 rounded-xl border-0 bg-white/10 px-3 py-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-accent/50"
                    />
                  </label>
                </>
              ) : (
                <>
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] text-ink-faint">AI name</span>
                    <input
                      value={player.name}
                      onChange={(e) => updatePlayer(index, { name: e.target.value })}
                      className="rounded-xl border-0 bg-white/10 px-3 py-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-accent/50"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] text-ink-faint">Expertise</span>
                    <select
                      value={player.aiDifficulty}
                      onChange={(e) =>
                        updatePlayer(index, {
                          aiDifficulty: e.target.value as AiDifficulty,
                        })
                      }
                      className="rounded-xl border-0 bg-white/10 px-3 py-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-accent/50"
                    >
                      {AI_DIFFICULTIES.map((d) => (
                        <option key={d.value} value={d.value} className="bg-felt-dark">
                          {d.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={onStart}
        disabled={!canStart}
        className="btn-primary mt-10 w-full py-3.5 text-sm disabled:opacity-40"
      >
        Sit down &amp; deal
      </button>
    </div>
  )
}
