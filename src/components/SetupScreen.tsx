import type { AiDifficulty } from '../game/deal'
import {
  partnerSeat,
  PLAYER_COUNT_OPTIONS,
  teamIdForSeat,
  type PlayerCount,
} from '../game/teams'

export const AVATARS = ['🐶', '🐱', '🐻', '🦊', '🐼', '🐨', '🦁', '🐯', '🐸', '🐙', '🦄', '🐲'] as const

export type Avatar = (typeof AVATARS)[number]

export const AI_DIFFICULTIES: { value: AiDifficulty; label: string }[] = [
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'difficult', label: 'Difficult' },
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
    avatar: AVATARS[i % AVATARS.length],
    isHuman: i < humans,
    aiDifficulty: 'medium' as AiDifficulty,
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
    onHumanCountChange(count)
    const next = players.map((p, i) => {
      const isHuman = i < count
      return {
        ...p,
        isHuman,
        name: isHuman ? (p.isHuman ? p.name : '') : `AI ${i + 1}`,
        age: isHuman ? (p.isHuman ? p.age : 0) : 0,
      }
    })
    onPlayersChange(next)
  }

  function toggleHuman(index: number) {
    const isHuman = !players[index].isHuman
    updatePlayer(index, {
      isHuman,
      name: isHuman ? '' : `AI ${index + 1}`,
      age: isHuman ? 0 : 0,
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
    <div className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="mb-8 text-3xl font-bold text-white">Hand and Foot</h1>

      <div className="mb-6">
        <label className="mb-2 block text-sm font-medium text-white/80">Total players</label>
        <div className="flex flex-wrap gap-3">
          {PLAYER_COUNT_OPTIONS.map((count) => (
            <button
              key={count}
              onClick={() => onPlayerCountChange(count)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                playerCount === count
                  ? 'bg-amber-500 text-amber-950'
                  : 'bg-white/10 text-white hover:bg-white/20'
              }`}
            >
              {count} ({count / 2} teams)
            </button>
          ))}
        </div>
      </div>

      <div className="mb-8">
        <label className="mb-2 block text-sm font-medium text-white/80">
          Human players ({humanCount} of {playerCount})
        </label>
        <input
          type="range"
          min={0}
          max={playerCount}
          value={humanCount}
          onChange={(e) => setHumanCount(Number(e.target.value))}
          className="w-full accent-amber-500"
        />
        <div className="mt-1 flex justify-between text-xs text-white/50">
          <span>All AI</span>
          <span>All human</span>
        </div>
      </div>

      <div className="space-y-4">
        {players.map((player, index) => (
          <div
            key={index}
            className="rounded-xl border border-white/10 bg-black/20 p-4"
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-white">
                Seat {index + 1}
                <span className="ml-2 text-xs font-normal text-white/50">
                  team {teamIdForSeat(index, playerCount) + 1} · partner seat{' '}
                  {partnerSeat(index, playerCount) + 1}
                </span>
              </p>
              <button
                onClick={() => toggleHuman(index)}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  player.isHuman
                    ? 'bg-sky-500/30 text-sky-200'
                    : 'bg-violet-500/30 text-violet-200'
                }`}
              >
                {player.isHuman ? 'Human' : 'AI'}
              </button>
            </div>

            <div className="flex flex-wrap items-end gap-4">
              <div className="flex flex-col gap-1">
                <span className="text-xs text-white/60">Avatar</span>
                <div className="flex flex-wrap gap-1">
                  {AVATARS.map((avatar) => (
                    <button
                      key={avatar}
                      onClick={() => updatePlayer(index, { avatar })}
                      className={`rounded-lg px-2 py-1 text-xl ${
                        player.avatar === avatar
                          ? 'bg-amber-500/30 ring-2 ring-amber-400'
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
                    <span className="text-xs text-white/60">Name</span>
                    <input
                      value={player.name}
                      onChange={(e) => updatePlayer(index, { name: e.target.value })}
                      placeholder={`Player ${index + 1}`}
                      className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white placeholder:text-white/30"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-white/60">Age</span>
                    <input
                      type="number"
                      min={1}
                      max={120}
                      value={player.age || ''}
                      onChange={(e) => updatePlayer(index, { age: Number(e.target.value) })}
                      className="w-20 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white"
                    />
                  </label>
                </>
              ) : (
                <>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-white/60">AI name</span>
                    <input
                      value={player.name}
                      onChange={(e) => updatePlayer(index, { name: e.target.value })}
                      className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-white/60">Expertise</span>
                    <select
                      value={player.aiDifficulty}
                      onChange={(e) =>
                        updatePlayer(index, {
                          aiDifficulty: e.target.value as AiDifficulty,
                        })
                      }
                      className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white"
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
        className="mt-8 w-full rounded-lg bg-amber-500 px-4 py-3 text-sm font-semibold text-amber-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Start Game
      </button>
    </div>
  )
}
