import type { CSSProperties } from 'react'
import type { Book } from '../game/books'
import type { PlayerState } from '../game/deal'
import { playerFootCount, playerHandCount } from '../game/deal'
import type { CompassSide, SeatRole } from '../game/tableLayout'
import { booksGrowClasses, seatPanelLayout } from '../game/tableLayout'
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
  /** Human viewer — chip stays on table; books render in the hand dock. */
  hideBooks?: boolean
}

export function SeatPanel({
  player,
  books,
  role,
  isActive,
  myTeamId,
  side,
  style,
  hideBooks = false,
}: SeatPanelProps) {
  const color = TEAM_COLORS[player.profile.teamId]
  const isMyTeam = player.profile.teamId === myTeamId
  const playerBooks = books.filter((b) => b.startedBySeatIndex === player.profile.seatIndex)

  const roleLabel =
    role === 'you' ? 'You' : role === 'partner' ? 'Partner' : 'Opp.'

  const booksRow =
    !hideBooks && playerBooks.length > 0 ? (
      <TeamBooks
        books={playerBooks}
        teamId={player.profile.teamId}
        highlightTeamId={myTeamId}
        compact
      />
    ) : null

  const isSouthSeat = side === 'south'

  const booksSlot = booksRow ? (
    <div className={`${booksGrowClasses(side)} ${side === 'north' ? 'pt-0.5' : ''}`}>{booksRow}</div>
  ) : null

  const handCount = playerHandCount(player)
  const footCount = playerFootCount(player)

  const chip = (
    <div
      className={`seat-plaque relative shrink-0 ${isActive ? 'seat-plaque-active animate-soft-pulse' : ''}`}
      style={
        !isActive && isMyTeam
          ? { borderColor: `${color}55`, boxShadow: `0 0 0 1px ${color}22` }
          : undefined
      }
    >
      <div className="flex items-center gap-1.5">
        <span className="shrink-0 text-base leading-none" aria-hidden>
          {player.profile.avatar}
        </span>
        <div className="min-w-0">
          <p className="truncate font-sans text-[11px] font-semibold leading-tight text-ink">
            {player.profile.name}
          </p>
          <p className="flex items-center gap-1.5 whitespace-nowrap text-[9px] text-ink-muted">
            <span style={{ color }}>{roleLabel}</span>
            <span className="tabular-nums text-ink-faint">
              {handCount}
              <span className="mx-0.5 opacity-40">·</span>
              {footCount}
            </span>
            {player.isPlayingFoot && (
              <span className="text-accent">Foot</span>
            )}
            {player.footOnHold && (
              <span className="text-sky-300/90">Hold</span>
            )}
          </p>
        </div>
      </div>
    </div>
  )

  const layout = seatPanelLayout(side)

  const positionStyle: CSSProperties = isSouthSeat
    ? { left: '50%', bottom: '0%', top: 'auto' }
    : style

  const anchorClass = isSouthSeat
    ? '-translate-x-1/2'
    : side === 'west'
      ? 'translate-x-0 -translate-y-1/2'
      : side === 'east'
        ? '-translate-x-full -translate-y-1/2'
        : side === 'north'
          ? '-translate-x-1/2'
          : side === 'nw'
            ? 'translate-x-0 translate-y-0'
            : side === 'ne'
              ? '-translate-x-full translate-y-0'
              : side === 'sw'
                ? 'translate-x-0 -translate-y-full'
                : '-translate-x-full -translate-y-full'

  return (
    <div className={`absolute z-10 ${anchorClass}`} style={positionStyle}>
      <div className={`flex shrink-0 gap-1 sm:gap-1.5 ${layout}`}>
        {isSouthSeat || side === 'north' ? (
          <>
            {side === 'north' ? (
              <>
                {chip}
                {booksSlot}
              </>
            ) : (
              <>
                {booksSlot}
                {chip}
              </>
            )}
          </>
        ) : (
          <>
            {chip}
            {booksSlot}
          </>
        )}
      </div>
    </div>
  )
}

export function ViewerFootPile({
  footCount,
  showFootPile,
  footCards,
  compact = false,
  inline = false,
}: {
  footCount: number
  showFootPile: boolean
  footCards: PlayerState['foot']
  compact?: boolean
  /** Text-only in the hand toolbar — keeps the ribbon short. */
  inline?: boolean
}) {
  if (footCount === 0) return null

  if (inline) {
    return (
      <span className="text-[11px] text-ink-muted">
        Foot {footCount}
        {showFootPile ? '' : ' · playing'}
      </span>
    )
  }

  return (
    <div className={`flex items-center gap-1.5 ${compact ? '' : 'mb-3 justify-center'}`}>
      <span className="text-[10px] text-ink-muted">Foot {footCount}</span>
      {showFootPile ? (
        <CardPile cards={footCards} label="" faceDown small />
      ) : (
        <div className="flex h-12 w-8 items-center justify-center rounded-lg border border-white/15 bg-blue-950/40 text-[10px] text-ink-muted">
          {footCount}
        </div>
      )}
    </div>
  )
}
