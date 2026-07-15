import type { GameState } from '../game/deal'
import { TEAM_COLORS } from '../game/teams'

interface PlayerTableProps {
  game: GameState
}

export function PlayerTable({ game }: PlayerTableProps) {
  return (
    <div className="mx-auto mb-6 grid max-w-5xl gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {game.players.map((player, index) => {
        const isActive = index === game.currentPlayerIndex
        const color = TEAM_COLORS[player.profile.teamId]

        return (
          <div
            key={player.profile.seatIndex}
            className={`rounded-lg border px-3 py-2 ${
              isActive ? 'border-amber-400/60 bg-amber-500/10' : 'border-white/10 bg-black/15'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="text-lg">{player.profile.avatar}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white">
                  {player.profile.name}
                  {isActive && (
                    <span className="ml-1 text-xs text-amber-300">· turn</span>
                  )}
                </p>
                <p className="text-xs text-white/50">
                  <span style={{ color }}>Team {player.profile.teamId + 1}</span>
                  {!player.profile.isHuman && (
                    <span className="text-violet-300">
                      {' '}
                      · AI ({player.profile.aiDifficulty})
                    </span>
                  )}
                  {' · '}
                  Hand {player.hand.length}
                  {player.foot.length > 0 && ` · Foot ${player.foot.length}`}
                  {player.isPlayingFoot && ' · in foot'}
                  {player.footOnHold && ' · foot waiting'}
                </p>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
