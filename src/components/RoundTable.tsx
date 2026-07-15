import type { GameState } from '../game/deal'
import { getTeam } from '../game/actions'
import {
  getViewerSeat,
  seatCoordinates,
  seatOffset,
  seatRole,
} from '../game/tableLayout'
import { CardPile } from './CardPile'
import { SeatPanel } from './SeatPanel'
import type { PlayerCount } from '../game/teams'

interface RoundTableProps {
  game: GameState
  hideViewerSeat?: boolean
  onDraw?: () => void
  canDraw?: boolean
}

export function RoundTable({
  game,
  hideViewerSeat = false,
  onDraw,
  canDraw = false,
}: RoundTableProps) {
  const viewerSeat = getViewerSeat(game.players)
  const viewerIsHuman = game.players[viewerSeat].profile.isHuman
  const myTeamId = game.players[viewerSeat].profile.teamId
  const playerCount = game.playerCount as PlayerCount

  return (
    <div className="flex h-full min-h-0 w-full overflow-x-hidden px-1 sm:px-3 lg:px-5">
      <div className="relative h-full w-full overflow-x-hidden overflow-y-visible px-1 pt-5 pb-1 sm:pt-6">
        {/* Table oval — wood rail + felt */}
        <div
          className="table-rail table-surface felt-texture absolute rounded-[50%] inset-[11%_7%] sm:inset-[9%_5%] md:inset-[7%_4%] lg:inset-[6%_3%] xl:inset-[5%_2.5%]"
          aria-hidden
        />

        {/* Soft center light pool under stock/discard */}
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 z-20 h-[min(28vh,9rem)] w-[min(36vw,12rem)] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            background:
              'radial-gradient(ellipse, rgba(255,240,200,0.07) 0%, transparent 70%)',
          }}
          aria-hidden
        />

        <div className="absolute left-1/2 top-1/2 z-40 flex -translate-x-1/2 -translate-y-1/2 items-end gap-4 sm:gap-7 md:gap-10 lg:gap-14">
          <CardPile
            cards={game.stock}
            label="Stock"
            faceDown
            small
            interactive={canDraw}
            highlight={canDraw}
            onClick={canDraw ? onDraw : undefined}
          />
          <CardPile
            cards={game.discard}
            label="Discard"
            showTopCard={game.discard.length > 0}
            small
          />
        </div>

        {game.players.map((player, seatIndex) => {
          const offset = seatOffset(viewerSeat, seatIndex, playerCount)
          const role = seatRole(viewerSeat, seatIndex, playerCount)
          if (hideViewerSeat && role === 'you') return null

          const { left, top, side } = seatCoordinates(offset, playerCount)
          const team = getTeam(game, player.profile.teamId)
          const isActive = seatIndex === game.currentPlayerIndex
          const hideBooks = viewerIsHuman && role === 'you'

          return (
            <SeatPanel
              key={seatIndex}
              player={player}
              books={team.books}
              role={role}
              isActive={isActive}
              myTeamId={myTeamId}
              side={side}
              hideBooks={hideBooks}
              style={{
                left: `${left}%`,
                top: `${top}%`,
              }}
            />
          )
        })}
      </div>
    </div>
  )
}
