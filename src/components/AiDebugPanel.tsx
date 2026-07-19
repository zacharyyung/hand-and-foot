import { useMemo, useState } from 'react'
import type { GameState } from '../game/deal'
import type { ChatMessage } from '../game/chat'
import { cardLabel } from '../game/cards'
import {
  buildAiDebugSnapshot,
  formatAiDebugSnapshot,
  type AiDebugTurnTrace,
} from '../game/ai/debugTrace'

interface AiDebugPanelProps {
  game: GameState
  chatMessages: ChatMessage[]
  enabled: boolean
  aiThinking: boolean
  currentSeat: number
  lastTraces: Record<number, AiDebugTurnTrace>
}

export function AiDebugPanel({
  game,
  chatMessages,
  enabled,
  aiThinking,
  currentSeat,
  lastTraces,
}: AiDebugPanelProps) {
  const aiSeats = useMemo(
    () => game.players.filter((p) => !p.profile.isHuman).map((p) => p.profile.seatIndex),
    [game.players],
  )
  const [expanded, setExpanded] = useState(true)
  const [selectedSeat, setSelectedSeat] = useState<number | null>(null)
  const [showCards, setShowCards] = useState(false)

  const activeSeat = selectedSeat ?? aiSeats[0] ?? null

  const snapshot = useMemo(() => {
    if (!enabled || activeSeat === null) return null
    return buildAiDebugSnapshot(game, activeSeat, chatMessages)
  }, [activeSeat, chatMessages, enabled, game])

  const snapshotLines = useMemo(
    () => (snapshot ? formatAiDebugSnapshot(snapshot) : []),
    [snapshot],
  )

  const lastTrace = activeSeat !== null ? lastTraces[activeSeat] : undefined
  const isCurrentAiTurn =
    aiThinking && activeSeat !== null && currentSeat === activeSeat

  if (!enabled || game.phase !== 'playing' || aiSeats.length === 0) return null

  return (
    <div className="ai-debug-panel" aria-label="AI debugging features">
      <button
        type="button"
        className="ai-debug-panel-toggle"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        AI debug {expanded ? '▾' : '▸'}
      </button>

      {expanded && (
        <div className="ai-debug-panel-body">
          <div className="ai-debug-seat-row">
            {aiSeats.map((seat) => {
              const player = game.players[seat]
              const selected = seat === activeSeat
              const isTurn = currentSeat === seat
              return (
                <button
                  key={seat}
                  type="button"
                  className={`ai-debug-seat ${selected ? 'ai-debug-seat-active' : ''}`}
                  onClick={() => {
                    setSelectedSeat(seat)
                    setShowCards(false)
                  }}
                >
                  <span aria-hidden>{player.profile.avatar}</span>
                  <span className="truncate">{player.profile.name}</span>
                  {isTurn && <span className="ai-debug-badge">turn</span>}
                </button>
              )
            })}
          </div>

          {activeSeat !== null && (
            <>
              <div className="ai-debug-meta">
                {isCurrentAiTurn ? (
                  <span className="text-accent">Thinking…</span>
                ) : (
                  <span>Click a bot to inspect · last turn trace below</span>
                )}
              </div>

              <button
                type="button"
                className="ai-debug-cards-toggle"
                onClick={() => setShowCards((v) => !v)}
                aria-expanded={showCards}
              >
                {showCards ? 'Hide cards' : 'Show hand & foot'}
              </button>

              {showCards && snapshot && (
                <div className="ai-debug-cards">
                  <p>
                    <strong>Hand ({snapshot.hand.length}):</strong>{' '}
                    {snapshot.hand.map(cardLabel).join(' ') || '(empty)'}
                  </p>
                  <p>
                    <strong>Foot ({snapshot.foot.length}):</strong>{' '}
                    {snapshot.foot.map(cardLabel).join(' ') || '(empty)'}
                  </p>
                </div>
              )}

              <div className="ai-debug-section">
                <p className="ai-debug-section-title">Current analysis</p>
                <ul className="ai-debug-lines">
                  {snapshotLines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>

              {lastTrace && (
                <div className="ai-debug-section">
                  <p className="ai-debug-section-title">
                    Last turn (R{lastTrace.roundNumber})
                  </p>
                  <ol className="ai-debug-trace">
                    {lastTrace.steps.map((step, index) => (
                      <li key={`${step.phase}-${index}`}>
                        <span className="ai-debug-trace-phase">{step.phase}</span>
                        {step.detail}
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
