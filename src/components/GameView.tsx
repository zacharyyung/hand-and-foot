import { useEffect, useMemo, useState } from 'react'
import type { GameState } from '../game/deal'
import {
  addToBook,
  canGoOut,
  commitStagedMelds,
  discardCard,
  drawCards,
  getCurrentPlayer,
  getTeam,
  startBook,
  validateStageBook,
} from '../game/actions'
import { runAiTurn } from '../game/ai/runTurn'
import { getViewerSeat } from '../game/tableLayout'
import { mergeHandOrder, sortCardIdsByHand } from '../game/handOrder'
import { meldThreshold, sumCardPoints } from '../game/scoring'
import { HandCards } from './HandCards'
import { StagingArea, type StagedBook } from './StagingArea'
import { RoundTable } from './RoundTable'
import { Scoreboard } from './Scoreboard'
import { ViewerFootPile } from './SeatPanel'
import { TEAM_COLORS } from '../game/teams'

interface GameViewProps {
  game: GameState
  onGameChange: (game: GameState) => void
}

const AI_TURN_DELAY_MS = 900

export function GameView({ game, onGameChange }: GameViewProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [targetBookId, setTargetBookId] = useState<string | null>(null)
  const [aiThinking, setAiThinking] = useState(false)
  const [handOrder, setHandOrder] = useState<string[]>([])
  const [stagedBooks, setStagedBooks] = useState<StagedBook[]>([])

  const viewerSeat = useMemo(() => getViewerSeat(game.players), [game.players])
  const viewer = game.players[viewerSeat]
  const current = getCurrentPlayer(game)
  const isMyTurn = game.currentPlayerIndex === viewerSeat
  const isHumanViewer = viewer.profile.isHuman
  const team = getTeam(game, viewer.profile.teamId)
  const requiredMeld = meldThreshold(team.score)
  const needsStagedMeld = !team.meldThresholdMet
  const handKey = viewer.hand.map((c) => c.id).sort().join(',')
  const stagedCardIds = useMemo(
    () => new Set(stagedBooks.flatMap((b) => b.cardIds)),
    [stagedBooks],
  )

  const handForDisplay = useMemo(
    () => viewer.hand.filter((c) => !stagedCardIds.has(c.id)),
    [viewer.hand, stagedCardIds],
  )

  const stagedPoints = useMemo(
    () => stagedBooks.reduce((sum, b) => sum + sumCardPoints(b.cards), 0),
    [stagedBooks],
  )

  const selectedCards = handForDisplay.filter((c) => selectedIds.includes(c.id))
  const selectedPoints = sumCardPoints(selectedCards)
  const goingOut = isMyTurn && canGoOut(game)
  const teamColor = TEAM_COLORS[viewer.profile.teamId]

  useEffect(() => {
    setHandOrder((prev) => mergeHandOrder(prev, viewer.hand))
  }, [handKey, viewer.hand])

  useEffect(() => {
    setStagedBooks([])
  }, [game.currentPlayerIndex])

  useEffect(() => {
    setSelectedIds([])
    setError(null)
    setTargetBookId(null)
  }, [game.currentPlayerIndex, game.turnPhase])

  useEffect(() => {
    if (game.phase !== 'playing' || current.profile.isHuman) {
      setAiThinking(false)
      return
    }

    setAiThinking(true)
    const timer = setTimeout(() => {
      onGameChange(runAiTurn(game))
      setAiThinking(false)
    }, AI_TURN_DELAY_MS)

    return () => clearTimeout(timer)
  }, [game, current.profile.isHuman, onGameChange])

  function toggleCard(cardId: string) {
    if (!isMyTurn || game.turnPhase === 'draw') return
    setError(null)
    setSelectedIds((prev) =>
      prev.includes(cardId) ? prev.filter((id) => id !== cardId) : [...prev, cardId],
    )
  }

  function handleDraw() {
    setError(null)
    onGameChange(drawCards(game))
  }

  function handleStartBook() {
    const result = startBook(game, selectedIds)
    if (result.error) {
      setError(result.error)
      return
    }
    setSelectedIds([])
    setError(null)
    onGameChange(result.state)
  }

  function handleAddToBook() {
    if (!targetBookId) {
      setError('Select a book to add to.')
      return
    }
    const result = addToBook(game, targetBookId, selectedIds)
    if (result.error) {
      setError(result.error)
      return
    }
    setSelectedIds([])
    setError(null)
    onGameChange(result.state)
  }

  function handleDiscard() {
    if (selectedIds.length !== 1) {
      setError('Select exactly one card to discard.')
      return
    }
    const result = discardCard(game, selectedIds[0])
    if (result.error) {
      setError(result.error)
      return
    }
    setSelectedIds([])
    setError(null)
    onGameChange(result.state)
  }

  function handleAutoSort() {
    const sorted = sortCardIdsByHand(handForDisplay)
    const staged = handOrder.filter((id) => stagedCardIds.has(id))
    setHandOrder([...sorted, ...staged])
  }

  function handleStage() {
    const check = validateStageBook(
      viewer.hand,
      selectedIds,
      team.books,
      stagedBooks.map((b) => b.rank),
    )
    if (!check.ok) {
      setError(check.reason)
      return
    }
    const cards = viewer.hand.filter((c) => selectedIds.includes(c.id))
    setStagedBooks((prev) => [
      ...prev,
      {
        id: `staged-${Date.now()}-${Math.random()}`,
        cardIds: [...selectedIds],
        rank: check.rank,
        cards,
      },
    ])
    setSelectedIds([])
    setError(null)
  }

  function handleMeld() {
    const result = commitStagedMelds(
      game,
      stagedBooks.map((b) => b.cardIds),
    )
    if (result.error) {
      setError(result.error)
      return
    }
    setStagedBooks([])
    setSelectedIds([])
    setError(null)
    onGameChange(result.state)
  }

  function handleRemoveStaged(id: string) {
    setStagedBooks((prev) => prev.filter((b) => b.id !== id))
    setError(null)
  }

  const displayHandOrder = handOrder.filter((id) => !stagedCardIds.has(id))

  function handleHandReorder(newDisplayOrder: string[]) {
    const staged = handOrder.filter((id) => stagedCardIds.has(id))
    setHandOrder([...newDisplayOrder, ...staged])
  }

  const statusText = aiThinking
    ? `${current.profile.name} is thinking…`
    : isMyTurn
      ? game.turnPhase === 'draw'
        ? 'Your turn — draw 2 cards'
        : goingOut
          ? 'Your turn — discard to go out'
          : 'Your turn — play cards, then discard 1'
      : `${current.profile.avatar} ${current.profile.name} is playing`

  return (
    <div className="px-3 py-4 sm:px-4 sm:py-6">
      <header className="mx-auto mb-4 max-w-4xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-white sm:text-xl">Hand and Foot</h1>
            <p className="text-sm text-white/50">Round {game.roundNumber}</p>
          </div>
          <Scoreboard teams={game.teams} />
        </div>
        <p className="text-sm text-white/60">{statusText}</p>
      </header>

      <RoundTable game={game} />

      {isHumanViewer && (
        <div
          className="mx-auto mt-4 max-w-4xl rounded-2xl border bg-black/30 p-4 sm:p-6"
          style={{ borderColor: `${teamColor}55` }}
        >
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-xl">{viewer.profile.avatar}</span>
            <span className="font-semibold text-white">Your hand</span>
            {viewer.isPlayingFoot && (
              <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs text-amber-200">
                Playing foot
              </span>
            )}
            {viewer.footOnHold && (
              <span className="rounded-full bg-sky-500/20 px-2 py-0.5 text-xs text-sky-200">
                Foot on hold
              </span>
            )}
            {!isMyTurn && (
              <span className="text-xs text-white/40">Waiting for your turn</span>
            )}
          </div>

          <ViewerFootPile
            footCount={viewer.foot.length}
            showFootPile
            footCards={viewer.foot}
          />

          <div className="mb-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-white/60">
                {viewer.hand.length} cards
                {selectedIds.length > 0 && ` · Selected: ${selectedPoints} pts`}
                {' · Drag to rearrange'}
              </p>
              <button
                type="button"
                onClick={handleAutoSort}
                disabled={viewer.hand.length < 2}
                className="rounded-lg bg-white/10 px-3 py-1 text-xs font-medium text-white hover:bg-white/20 disabled:opacity-40"
              >
                Auto-organize
              </button>
            </div>
            <HandCards
              hand={handForDisplay}
              handOrder={displayHandOrder}
              onReorder={handleHandReorder}
              selectedIds={selectedIds}
              onToggle={toggleCard}
              canSelect={isMyTurn && game.turnPhase === 'play'}
              canDrag
            />
          </div>

          {isMyTurn && needsStagedMeld && game.turnPhase === 'play' && (
            <StagingArea
              stagedBooks={stagedBooks}
              requiredPoints={requiredMeld}
              onRemove={handleRemoveStaged}
              onClear={() => setStagedBooks([])}
            />
          )}

          {isMyTurn && needsStagedMeld && game.turnPhase === 'play' && (
            <p className="mb-3 text-sm text-amber-200">
              Stage books totaling {requiredMeld}+ points, then click Meld to reveal them on
              the table.
            </p>
          )}

          {error && (
            <p className="mb-3 rounded-lg bg-red-500/20 px-3 py-2 text-sm text-red-200">
              {error}
            </p>
          )}

          {isMyTurn && (
            <div className="flex flex-wrap gap-2">
              {game.turnPhase === 'draw' && (
                <button
                  onClick={handleDraw}
                  className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-amber-950 hover:bg-amber-400"
                >
                  Draw 2 Cards
                </button>
              )}

              {game.turnPhase === 'play' && (
                <>
                  {needsStagedMeld ? (
                    <>
                      <button
                        onClick={handleStage}
                        disabled={selectedIds.length < 3}
                        className="rounded-lg bg-amber-500/20 px-4 py-2 text-sm font-medium text-amber-100 hover:bg-amber-500/30 disabled:opacity-40"
                      >
                        Stage Book
                      </button>
                      <button
                        onClick={handleMeld}
                        disabled={stagedBooks.length === 0 || stagedPoints < requiredMeld}
                        className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-amber-950 hover:bg-amber-400 disabled:opacity-40"
                      >
                        Meld ({stagedPoints}/{requiredMeld} pts)
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={handleStartBook}
                      disabled={selectedIds.length < 3}
                      className="rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/20 disabled:opacity-40"
                    >
                      Start Book
                    </button>
                  )}

                  {team.meldThresholdMet && team.books.length > 0 && (
                    <>
                      <select
                        value={targetBookId ?? ''}
                        onChange={(e) => setTargetBookId(e.target.value || null)}
                        className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white"
                      >
                        <option value="" className="bg-felt-dark">
                          Add to book…
                        </option>
                        {team.books.map((book) => (
                          <option key={book.id} value={book.id} className="bg-felt-dark">
                            {book.rank}s ({book.cards.length})
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={handleAddToBook}
                        disabled={!targetBookId || selectedIds.length === 0}
                        className="rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/20 disabled:opacity-40"
                      >
                        Add to Book
                      </button>
                    </>
                  )}

                  <button
                    onClick={handleDiscard}
                    disabled={selectedIds.length !== 1}
                    className={`rounded-lg px-4 py-2 text-sm font-semibold ${
                      goingOut
                        ? 'bg-green-500 text-green-950 hover:bg-green-400'
                        : 'bg-red-500/80 text-white hover:bg-red-500'
                    } disabled:opacity-40`}
                  >
                    {goingOut ? 'Discard & Go Out' : 'Discard'}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {!isHumanViewer && (
        <p className="mx-auto mt-4 max-w-4xl text-center text-sm text-white/50">
          Spectating — all AI game
        </p>
      )}
    </div>
  )
}
