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
}

export function RoundTable({ game }: RoundTableProps) {
  const viewerSeat = getViewerSeat(game.players)
  const myTeamId = game.players[viewerSeat].profile.teamId
  const playerCount = game.playerCount as PlayerCount

  return (
    <div className="relative mx-auto w-full max-w-3xl px-2">
      <div className="relative aspect-[4/5] w-full min-h-[22rem] sm:aspect-square sm:min-h-0">
        {/* Table surface */}
        <div
          className="absolute left-[14%] top-[18%] h-[58%] w-[72%] rounded-[50%] border-[5px] border-amber-950/50 bg-gradient-to-br from-felt-dark to-felt shadow-inner"
          style={{
            boxShadow: 'inset 0 0 50px rgba(0,0,0,0.35), 0 6px 24px rgba(0,0,0,0.35)',
          }}
        />

        {/* Center piles */}
        <div className="absolute left-1/2 top-[47%] z-20 flex -translate-x-1/2 -translate-y-1/2 gap-5 sm:gap-8">
          <CardPile cards={game.stock} label="Stock" faceDown />
          <CardPile
            cards={game.discard}
            label="Discard"
            showTopCard={game.discard.length > 0}
          />
        </div>

        {/* All seats including viewer (south) */}
        {game.players.map((player, seatIndex) => {
          const offset = seatOffset(viewerSeat, seatIndex, playerCount)
          const { left, top, side } = seatCoordinates(offset, playerCount)
          const team = getTeam(game, player.profile.teamId)
          const role = seatRole(viewerSeat, seatIndex, playerCount)
          const isActive = seatIndex === game.currentPlayerIndex

          return (
            <SeatPanel
              key={seatIndex}
              player={player}
              books={team.books}
              role={role}
              isActive={isActive}
              myTeamId={myTeamId}
              side={side}
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
