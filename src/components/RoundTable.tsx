import type { GameState } from '../game/deal'
import type { CardMotionKind } from '../game/cardMotion'
import { getTeam } from '../game/actions'
import {
  getViewerSeat,
  seatCoordinates,
  seatOffset,
  seatRole,
} from '../game/tableLayout'
import { CardPile } from './CardPile'
import { SeatPanel } from './SeatPanel'
import { TableBookZone } from './TeamBooks'
import type { DirtyBookConsent } from './DirtyBookConsentPrompt'
import type { DirtyBookSelfWarning } from './DirtyBookWarningPrompt'
import type { PlayerCount } from '../game/teams'

interface RoundTableProps {
  game: GameState
  hideViewerSeat?: boolean
  onDraw?: () => void
  canDraw?: boolean
  mobile?: boolean
  getCardMotion?: (cardId: string) => CardMotionKind | undefined
  isCardInFlight?: (cardId: string) => boolean
  dirtyBookConsent?: DirtyBookConsent | null
  dirtyBookWarning?: DirtyBookSelfWarning | null
}

export function RoundTable({
  game,
  hideViewerSeat = false,
  onDraw,
  canDraw = false,
  mobile = false,
  getCardMotion,
  isCardInFlight,
  dirtyBookConsent = null,
  dirtyBookWarning = null,
}: RoundTableProps) {
  const viewerSeat = getViewerSeat(game.players)
  const myTeamId = game.players[viewerSeat].profile.teamId
  const playerCount = game.playerCount as PlayerCount

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden px-2 sm:px-3 lg:px-5">
      <div className="relative h-full w-full min-h-0 overflow-hidden px-0.5 pt-2 pb-1 sm:pt-3">
        {/*
          Felt board — books are children of this box so percentages are
          relative to the felt itself, and overflow clips anything that
          would spill across the brown rail.
        */}
        <div
          className="round-table-board table-rail table-surface felt-texture absolute overflow-hidden rounded-[1.75rem] sm:rounded-[2rem] md:rounded-[2.25rem] inset-[8%_5%] sm:inset-[7%_4.5%] md:inset-[6.5%_4%] lg:inset-[6%_3.5%]"
        >
          {/* Soft center light pool under stock/discard */}
          <div
            className="pointer-events-none absolute left-1/2 top-1/2 z-10 h-[min(36%,10rem)] w-[min(48%,14rem)] -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              background:
                'radial-gradient(ellipse, rgba(255,240,200,0.07) 0%, transparent 70%)',
            }}
            aria-hidden
          />

          {/*
            Books live in an inset clip frame so absolute % positions are
            measured from inside the felt — never on the brown rail.
            Board padding alone does not inset absolute children.
          */}
          <div className="round-table-books pointer-events-none absolute inset-[0.55rem] z-[15] overflow-hidden sm:inset-3 md:inset-3.5">
            {game.players.map((player, seatIndex) => {
              const offset = seatOffset(viewerSeat, seatIndex, playerCount)
              const { side } = seatCoordinates(offset, playerCount)
              const team = getTeam(game, player.profile.teamId)
              const playerBooks = team.books.filter(
                (b) => b.startedBySeatIndex === player.profile.seatIndex,
              )
              if (playerBooks.length === 0) return null

              return (
                <TableBookZone
                  key={`books-${seatIndex}`}
                  books={playerBooks}
                  teamId={team.id}
                  seatIndex={seatIndex}
                  side={side}
                  myTeamId={myTeamId}
                  mobile={mobile}
                  getCardMotion={getCardMotion}
                  isCardHidden={isCardInFlight}
                  dirtyBookConsent={dirtyBookConsent}
                  dirtyBookWarning={dirtyBookWarning}
                />
              )
            })}
          </div>
        </div>

        <div className={`absolute left-1/2 top-1/2 z-40 flex -translate-x-1/2 -translate-y-1/2 items-end ${mobile ? 'gap-2.5' : 'gap-4 sm:gap-7 md:gap-10 lg:gap-14'}`}>
          <CardPile
            cards={game.stock}
            label={mobile ? undefined : 'Stock'}
            faceDown
            small={!mobile}
            tiny={mobile}
            flightAnchor="stock"
            interactive={canDraw}
            highlight={canDraw}
            onClick={canDraw ? onDraw : undefined}
          />
          <CardPile
            cards={game.discard}
            label={mobile ? undefined : 'Discard'}
            showTopCard={game.discard.length > 0}
            small={!mobile}
            tiny={mobile}
            flightAnchor="discard"
            getCardMotion={getCardMotion}
            isCardHidden={isCardInFlight}
          />
        </div>

        {/* Seat plaques — outside the felt */}
        {game.players.map((player, seatIndex) => {
          const offset = seatOffset(viewerSeat, seatIndex, playerCount)
          const role = seatRole(viewerSeat, seatIndex, playerCount)
          if (hideViewerSeat && role === 'you') return null

          const { left, top, side } = seatCoordinates(offset, playerCount)
          const isActive = seatIndex === game.currentPlayerIndex

          return (
            <SeatPanel
              key={seatIndex}
              player={player}
              seatIndex={seatIndex}
              role={role}
              isActive={isActive}
              myTeamId={myTeamId}
              side={side}
              coords={{ left, top }}
              abbreviated={mobile}
            />
          )
        })}
      </div>
    </div>
  )
}
