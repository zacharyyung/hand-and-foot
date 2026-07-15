import type { Book } from '../game/books'
import type { PlayerState } from '../game/deal'
import type { CompassSide, SeatRole } from '../game/tableLayout'
import { CardPile } from './CardPile'
import { TeamBooks } from './TeamBooks'
import { TEAM_COLORS } from '../game/teams'

interface SeatPanelProps {
  player: PlayerState
  books: Book[]
  role: SeatRole
  isActive: boolean
  myTeamId: number
  side: CompassSide
  style: { left: string; top: string }
}

export function SeatPanel({
  player,
  books,
  role,
  isActive,
  myTeamId,
  side,
  style,
}: SeatPanelProps) {
  const color = TEAM_COLORS[player.profile.teamId]
  const isMyTeam = player.profile.teamId === myTeamId
  const playerBooks = books.filter((b) => b.startedBySeatIndex === player.profile.seatIndex)

  const roleLabel =
    role === 'you' ? 'You' : role === 'partner' ? 'Partner' : 'Opponent'

  const booksTowardTable = side === 'south' || side === 'sw' || side === 'se'

  const booksRow =
    playerBooks.length > 0 ? (
      <TeamBooks
        books={playerBooks}
        teamId={player.profile.teamId}
        highlightTeamId={myTeamId}
        compact
      />
    ) : null

  return (
    <div
      className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
      style={style}
    >
      <div className="flex flex-col items-center gap-1">
        {booksTowardTable && booksRow}

        <div
          className={`rounded-xl border px-3 py-2 ${
            isActive
              ? 'border-amber-400/70 bg-amber-500/15 shadow-lg shadow-amber-500/10'
              : 'border-white/15 bg-black/40'
          }`}
          style={!isActive && isMyTeam ? { borderColor: `${color}55` } : undefined}
        >
          <div className="flex items-center gap-2">
            <span className="text-xl sm:text-2xl">{player.profile.avatar}</span>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-white sm:text-sm">
                {player.profile.name}
              </p>
              <p className="text-[10px] text-white/50">
                <span style={{ color }}>{roleLabel}</span>
                {!player.profile.isHuman && (
                  <span className="text-violet-300"> · {player.profile.aiDifficulty}</span>
                )}
              </p>
            </div>
          </div>

          <div className="mt-1.5 flex flex-wrap justify-center gap-x-2 gap-y-0.5 text-[10px] text-white/60">
            <span>Hand: {player.hand.length}</span>
            <span>Foot: {player.foot.length}</span>
            {player.isPlayingFoot && <span className="text-amber-300">In foot</span>}
            {player.footOnHold && <span className="text-sky-300">Foot waiting</span>}
            {isActive && <span className="text-amber-300">Turn</span>}
          </div>
        </div>

        {!booksTowardTable && booksRow}
      </div>
    </div>
  )
}

export function ViewerFootPile({
  footCount,
  showFootPile,
  footCards,
}: {
  footCount: number
  showFootPile: boolean
  footCards: PlayerState['foot']
}) {
  if (footCount === 0) return null
  return (
    <div className="mb-3 flex items-center justify-center gap-2">
      <span className="text-xs text-white/60">Your foot ({footCount})</span>
      {showFootPile ? (
        <CardPile cards={footCards} label="" faceDown small />
      ) : (
        <div className="flex h-16 w-11 items-center justify-center rounded-lg border-2 border-white/20 bg-blue-900/40 text-xs text-white/50">
          {footCount}
        </div>
      )}
    </div>
  )
}
