import type { GameState } from '../game/deal'
import { CardPile } from './CardPile'
import { PlayerArea } from './PlayerArea'

interface GameBoardProps {
  game: GameState
}

function getSeating(playerCount: number) {
  if (playerCount === 2) {
    return { bottom: 0, top: 1, left: null, right: null }
  }
  if (playerCount === 3) {
    return { bottom: 0, top: 1, left: 2, right: null }
  }
  return { bottom: 0, right: 1, top: 2, left: 3 }
}

export function GameBoard({ game }: GameBoardProps) {
  const { players, stock, discard, playerCount } = game
  const seat = getSeating(playerCount)

  const bottom = players[seat.bottom]
  const top = seat.top !== null ? players[seat.top] : null
  const left = seat.left !== null ? players[seat.left] : null
  const right = seat.right !== null ? players[seat.right] : null

  return (
    <div className="mx-auto w-full max-w-5xl">
      {/* Top player */}
      <div className="mb-6 flex justify-center">
        {top && <PlayerArea player={top} position="top" />}
      </div>

      <div className="flex items-center justify-between gap-4">
        {/* Left player (only for 4+ players) */}
        <div className="w-36 shrink-0">
          {left && <PlayerArea player={left} position="left" />}
        </div>

        {/* Center piles */}
        <div className="flex flex-1 items-center justify-center gap-12 rounded-2xl border border-white/10 bg-felt-dark/60 px-8 py-10">
          <CardPile cards={stock} label="Stock" faceDown />
          <CardPile cards={discard} label="Discard" showTopCard />
        </div>

        {/* Right player */}
        <div className="w-36 shrink-0">
          {right && <PlayerArea player={right} position="right" />}
        </div>
      </div>

      {/* Bottom player (you) */}
      <div className="mt-8 flex justify-center">
        <PlayerArea player={bottom} isCurrentUser position="bottom" />
      </div>
    </div>
  )
}
