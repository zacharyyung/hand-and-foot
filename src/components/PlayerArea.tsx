import type { PlayerState } from '../game/deal'
import { Card } from './Card'
import { CardPile } from './CardPile'

interface PlayerAreaProps {
  player: PlayerState
  isCurrentUser?: boolean
  position: 'top' | 'left' | 'right' | 'bottom'
}

export function PlayerArea({ player, isCurrentUser = false, position }: PlayerAreaProps) {
  const positionStyles: Record<PlayerAreaProps['position'], string> = {
    top: 'items-center',
    bottom: 'items-center',
    left: 'items-start',
    right: 'items-end',
  }

  return (
    <div className={`flex flex-col gap-3 ${positionStyles[position]}`}>
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-white/10 px-3 py-1 text-sm font-semibold text-white">
          {player.profile.name}
        </span>
        {isCurrentUser && (
          <span className="rounded-full bg-amber-500/80 px-2 py-0.5 text-xs font-medium text-amber-950">
            You
          </span>
        )}
        {player.isPlayingFoot && (
          <span className="text-xs text-amber-200">Playing foot</span>
        )}
      </div>

      <div className={`flex gap-6 ${position === 'bottom' ? 'flex-col items-center' : 'items-end'}`}>
        <div className="flex flex-col items-center gap-1">
          <span className="text-xs text-white/60">Foot</span>
          <CardPile cards={player.foot} label="" faceDown />
        </div>

        <div className="flex flex-col items-center gap-1">
          <span className="text-xs text-white/60">Hand</span>
          {isCurrentUser ? (
            <div className="flex flex-wrap justify-center gap-1 max-w-xl">
              {player.hand.map((card) => (
                <Card key={card.id} card={card} small />
              ))}
            </div>
          ) : (
            <CardPile cards={player.hand} label="" faceDown />
          )}
        </div>
      </div>
    </div>
  )
}
