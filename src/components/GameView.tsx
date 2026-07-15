import { useEffect, useMemo, useRef, useState } from 'react'
import type { GameState } from '../game/deal'
import { playerFootCount, playerHandCount } from '../game/deal'
import {
  addToBook,
  canGoOut,
  canGoToFoot,
  commitStagedMelds,
  discardCard,
  drawCards,
  getCurrentPlayer,
  getTeam,
  isLastFootCard,
  startBook,
  validateStageBook,
  willSkipAndRun,
} from '../game/actions'
import { runAiTurn } from '../game/ai/runTurn'
import { getViewerSeat } from '../game/tableLayout'
import { mergeHandOrder, sortCardIdsByHand } from '../game/handOrder'
import {
  findAllBooksForSelectedCards,
  findBookForSelectedCards,
  getGoOutBlockReason,
  shouldWarnDiscardToBook,
  selectionIncludesWild,
  bookWildCount,
} from '../game/books'
import { meldThreshold, sumCardPoints } from '../game/scoring'
import { playSound, unlockAudio } from '../game/audio'
import { HandCards } from './HandCards'
import { StagingArea, type StagedBook } from './StagingArea'
import { RoundTable } from './RoundTable'
import { Scoreboard, CurrentRoundTracker } from './Scoreboard'
import { GameChat } from './GameChat'
import { TeamBooks } from './TeamBooks'
import { SoundToggle } from './SoundToggle'
import { TEAM_COLORS } from '../game/teams'
import type { ChatMessage } from '../game/chat'

interface GameViewProps {
  game: GameState
  onGameChange: (game: GameState) => void
  chatMessages: ChatMessage[]
  onChatSend: (message: ChatMessage) => void
  onShowInstructions: () => void
}

const AI_TURN_DELAY_MS = 900

function shortStatus(opts: {
  aiThinking: boolean
  currentName: string
  currentAvatar: string
  isMyTurn: boolean
  turnPhase: string
  isPlayingFoot: boolean
  goingOut: boolean
  goOutBlockReason: string | null
  hasFoot: boolean
}): string {
  if (opts.aiThinking) return `${opts.currentName}…`
  if (!opts.isMyTurn) return `${opts.currentAvatar} ${opts.currentName}`
  if (opts.turnPhase === 'draw') {
    return opts.isPlayingFoot ? 'Draw for your foot' : 'Draw two'
  }
  if (opts.goingOut) return 'Discard to go out'
  if (opts.goOutBlockReason) return opts.goOutBlockReason
  if (opts.isPlayingFoot) return 'Playing foot'
  if (opts.hasFoot) return 'Meld or discard'
  return 'Your turn'
}

export function GameView({
  game,
  onGameChange,
  chatMessages,
  onChatSend,
  onShowInstructions,
}: GameViewProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [aiThinking, setAiThinking] = useState(false)
  const [handOrder, setHandOrder] = useState<string[]>([])
  const [stagedBooks, setStagedBooks] = useState<StagedBook[]>([])
  const [discardWarning, setDiscardWarning] = useState<{
    cardId: string
    cardName: string
    bookRank: string
  } | null>(null)
  const [selectedAddBookId, setSelectedAddBookId] = useState<string | null>(null)

  const prevTurn = useRef(game.currentPlayerIndex)
  const prevViewerBooks = useRef(0)

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
  const addBookOptions = useMemo(
    () =>
      team.meldThresholdMet && !isLastFootCard(viewer)
        ? findAllBooksForSelectedCards(viewer.hand, selectedIds, team.books)
        : [],
    [team.meldThresholdMet, team.books, viewer, selectedIds],
  )
  const wildAddChoice = useMemo(
    () =>
      addBookOptions.length > 1 && selectionIncludesWild(viewer.hand, selectedIds),
    [addBookOptions.length, viewer.hand, selectedIds],
  )
  const matchedAddBook = useMemo(() => {
    if (addBookOptions.length === 0) return null
    if (wildAddChoice) {
      return addBookOptions.find((b) => b.id === selectedAddBookId) ?? null
    }
    return findBookForSelectedCards(viewer.hand, selectedIds, team.books)
  }, [addBookOptions, wildAddChoice, selectedAddBookId, viewer.hand, selectedIds, team.books])
  const goingOut = isMyTurn && canGoOut(game)
  const lastFootCard = isMyTurn && isLastFootCard(viewer) && game.turnPhase === 'play'
  const goOutBlockReason =
    lastFootCard && !goingOut ? getGoOutBlockReason(team.books, team.meldThresholdMet) : null
  const mustDiscardLastFoot = lastFootCard
  const goToFootDiscard =
    isMyTurn && canGoToFoot(viewer) && selectedIds.length === 1
  const skipAndRunSelected =
    isMyTurn && willSkipAndRun(viewer, selectedIds)
  const skipAndRunMeld =
    isMyTurn && willSkipAndRun(viewer, stagedBooks.flatMap((b) => b.cardIds))
  const teamColor = TEAM_COLORS[viewer.profile.teamId]
  const viewerBooks = useMemo(
    () => team.books.filter((b) => b.startedBySeatIndex === viewerSeat),
    [team.books, viewerSeat],
  )

  const humanPlayers = useMemo(
    () => game.players.filter((p) => p.profile.isHuman),
    [game.players],
  )
  const showChat = humanPlayers.length >= 2
  const chatSenderSeat = current.profile.isHuman
    ? current.profile.seatIndex
    : humanPlayers[0]?.profile.seatIndex

  const completedBooks = team.books.filter((b) => b.cards.length >= 7).length

  useEffect(() => {
    setHandOrder((prev) => mergeHandOrder(prev, viewer.hand))
  }, [handKey, viewer.hand])

  useEffect(() => {
    setStagedBooks([])
  }, [game.currentPlayerIndex])

  useEffect(() => {
    setSelectedIds([])
    setError(null)
    setDiscardWarning(null)
    setSelectedAddBookId(null)
  }, [game.currentPlayerIndex, game.turnPhase])

  useEffect(() => {
    if (!wildAddChoice) {
      setSelectedAddBookId(null)
      return
    }
    setSelectedAddBookId((prev) =>
      prev && addBookOptions.some((b) => b.id === prev) ? prev : addBookOptions[0]?.id ?? null,
    )
  }, [wildAddChoice, addBookOptions, selectedIds])

  /* Turn-change / your-turn cues */
  useEffect(() => {
    if (prevTurn.current === game.currentPlayerIndex) return
    prevTurn.current = game.currentPlayerIndex
    if (game.currentPlayerIndex === viewerSeat && viewer.profile.isHuman) {
      playSound('yourTurn')
    } else {
      playSound('turnChange')
    }
  }, [game.currentPlayerIndex, viewerSeat, viewer.profile.isHuman])

  /* Book completion celebration */
  useEffect(() => {
    if (completedBooks > prevViewerBooks.current) {
      playSound('bookComplete')
    }
    prevViewerBooks.current = completedBooks
  }, [completedBooks])

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
    unlockAudio()
    setError(null)
    playSound('draw')
    onGameChange(drawCards(game))
  }

  function handleStartBook() {
    unlockAudio()
    const result = startBook(game, selectedIds)
    if (result.error) {
      setError(result.error)
      playSound('invalid')
      return
    }
    setSelectedIds([])
    setError(null)
    playSound('place')
    onGameChange(result.state)
  }

  function handleAddToBook() {
    unlockAudio()
    if (!matchedAddBook) {
      setError(
        wildAddChoice ? 'Choose which book to add to.' : 'Selected cards cannot be added to any book.',
      )
      playSound('invalid')
      return
    }
    const result = addToBook(game, matchedAddBook.id, selectedIds)
    if (result.error) {
      setError(result.error)
      playSound('invalid')
      return
    }
    setSelectedIds([])
    setSelectedAddBookId(null)
    setError(null)
    playSound('place')
    onGameChange(result.state)
  }

  function performDiscard(cardId: string) {
    const result = discardCard(game, cardId)
    if (result.error) {
      setError(result.error)
      playSound('invalid')
      return
    }
    setSelectedIds([])
    setError(null)
    setDiscardWarning(null)
    if (goingOut) playSound('goOut')
    else if (goToFootDiscard) playSound('goToFoot')
    else playSound('discard')
    onGameChange(result.state)
  }

  function handleDiscard() {
    unlockAudio()
    if (selectedIds.length !== 1) {
      setError('Select exactly one card to discard.')
      playSound('invalid')
      return
    }

    const cardId = selectedIds[0]

    if (!goingOut && !isLastFootCard(viewer) && team.books.length > 0) {
      const warning = shouldWarnDiscardToBook(viewer.hand, cardId, team.books)
      if (warning) {
        setDiscardWarning({
          cardId,
          cardName: warning.cardName,
          bookRank: warning.bookRank,
        })
        setError(null)
        return
      }
    }

    performDiscard(cardId)
  }

  function handleConfirmDiscard() {
    if (!discardWarning) return
    performDiscard(discardWarning.cardId)
  }

  function handleAutoSort() {
    unlockAudio()
    const sorted = sortCardIdsByHand(handForDisplay)
    const staged = handOrder.filter((id) => stagedCardIds.has(id))
    setHandOrder([...sorted, ...staged])
    playSound('sort')
  }

  function handleStage() {
    unlockAudio()
    const check = validateStageBook(
      viewer.hand,
      selectedIds,
      team.books,
      stagedBooks.map((b) => b.rank),
    )
    if (!check.ok) {
      setError(check.reason)
      playSound('invalid')
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
    playSound('place')
  }

  function handleMeld() {
    unlockAudio()
    const result = commitStagedMelds(
      game,
      stagedBooks.map((b) => b.cardIds),
    )
    if (result.error) {
      setError(result.error)
      playSound('invalid')
      return
    }
    setStagedBooks([])
    setSelectedIds([])
    setError(null)
    playSound('threshold')
    onGameChange(result.state)
  }

  function handleRemoveStaged(id: string) {
    setStagedBooks((prev) => prev.filter((b) => b.id !== id))
    setError(null)
    playSound('deselect')
  }

  const displayHandOrder = handOrder.filter((id) => !stagedCardIds.has(id))

  function handleHandReorder(newDisplayOrder: string[]) {
    const staged = handOrder.filter((id) => stagedCardIds.has(id))
    setHandOrder([...newDisplayOrder, ...staged])
  }

  const statusText = shortStatus({
    aiThinking,
    currentName: current.profile.name,
    currentAvatar: current.profile.avatar,
    isMyTurn,
    turnPhase: game.turnPhase,
    isPlayingFoot: viewer.isPlayingFoot,
    goingOut,
    goOutBlockReason,
    hasFoot: viewer.foot.length > 0,
  })

  const canDraw = isMyTurn && game.turnPhase === 'draw'

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      {/* Slim top rail — scores & status only */}
      <header className="relative z-20 shrink-0 px-3 py-2 sm:px-5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <h1 className="font-display text-base font-semibold tracking-tight text-ink sm:text-lg">
                Hand &amp; Foot
              </h1>
              <span className="font-sans text-[10px] tabular-nums text-ink-faint">
                R{game.roundNumber}
              </span>
            </div>
            <p
              className={`mt-0.5 truncate text-[11px] ${
                isMyTurn && !aiThinking ? 'text-accent' : 'text-ink-muted'
              }`}
            >
              {statusText}
            </p>
          </div>

          <div className="absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 sm:block">
            <CurrentRoundTracker teams={game.teams} />
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <SoundToggle />
            <button
              type="button"
              onClick={onShowInstructions}
              className="rounded-lg px-2 py-1 text-[11px] font-medium text-ink-muted hover:bg-white/10 hover:text-ink"
              aria-label="Instructions"
            >
              ?
            </button>
            <Scoreboard teams={game.teams} compact />
          </div>
        </div>
        <div className="mt-1.5 flex justify-center sm:hidden">
          <CurrentRoundTracker teams={game.teams} />
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="relative min-h-0 flex-1">
          <RoundTable game={game} onDraw={handleDraw} canDraw={canDraw} />
        </div>

        {isHumanViewer && (
          <div
            className="relative z-20 flex max-h-[min(32vh,320px)] shrink-0 flex-col overflow-hidden sm:max-h-[min(30vh,340px)]"
            style={{
              background:
                'linear-gradient(to top, rgba(6,20,14,0.92) 0%, rgba(8,28,18,0.78) 70%, rgba(8,28,18,0.45) 100%)',
              boxShadow: `inset 0 1px 0 ${teamColor}33`,
            }}
          >
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {isMyTurn && needsStagedMeld && game.turnPhase === 'play' && (
                <StagingArea
                  stagedBooks={stagedBooks}
                  requiredPoints={requiredMeld}
                  onRemove={handleRemoveStaged}
                  onClear={() => setStagedBooks([])}
                  compact
                  ribbon
                />
              )}

              {viewerBooks.length > 0 && (
                <div className="flex shrink-0 justify-center gap-1 overflow-x-auto px-2 py-1">
                  <TeamBooks
                    books={viewerBooks}
                    teamId={team.id}
                    highlightTeamId={team.id}
                    compact
                  />
                </div>
              )}

              <div className="flex shrink-0 flex-wrap items-center justify-center gap-x-3 gap-y-0.5 px-3 py-0.5 sm:px-4">
                <span className="text-[10px] tabular-nums text-ink-faint">
                  {playerHandCount(viewer)}
                  <span className="mx-1 opacity-30">·</span>
                  {playerFootCount(viewer)}
                  {viewer.isPlayingFoot && (
                    <span className="ml-1.5 text-accent">Foot</span>
                  )}
                  {selectedIds.length > 0 && (
                    <span className="ml-1.5 text-ink-muted">{selectedPoints} pts</span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={handleAutoSort}
                  disabled={viewer.hand.length < 2}
                  className="rounded-md border border-white/20 bg-white/10 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-ink-soft shadow-sm transition hover:border-white/30 hover:bg-white/18 hover:text-ink active:translate-y-px disabled:opacity-30"
                >
                  Sort
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-2 py-1 sm:px-4">
                <HandCards
                  hand={handForDisplay}
                  handOrder={displayHandOrder}
                  onReorder={handleHandReorder}
                  selectedIds={selectedIds}
                  onToggle={toggleCard}
                  canSelect={isMyTurn && game.turnPhase === 'play'}
                  canDrag
                  spread
                />

                {discardWarning && (
                  <div className="animate-fade-up mx-auto mt-2 max-w-md rounded-xl bg-black/50 px-3 py-2.5 text-center backdrop-blur-sm">
                    <p className="text-xs text-ink-soft">
                      Discard{' '}
                      <span className="font-semibold text-accent">{discardWarning.cardName}</span>?
                      It fits your {discardWarning.bookRank}s book.
                    </p>
                    <div className="mt-2 flex justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => setDiscardWarning(null)}
                        className="btn-secondary"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleConfirmDiscard}
                        className="btn-danger"
                      >
                        Discard anyway
                      </button>
                    </div>
                  </div>
                )}

                {error && (
                  <p className="animate-fade-up mx-auto mt-1.5 max-w-md rounded-lg bg-red-950/50 px-3 py-1.5 text-center text-xs text-red-200">
                    {error}
                  </p>
                )}
              </div>

              <div className="flex min-h-[2.85rem] shrink-0 flex-wrap items-center justify-center gap-2 px-3 py-2 sm:px-4">
                {isMyTurn && (
                  <>
                    {game.turnPhase === 'draw' && (
                      <button onClick={handleDraw} className="btn-primary animate-soft-pulse">
                        Draw 2
                      </button>
                    )}

                    {game.turnPhase === 'play' && (
                      <>
                        {needsStagedMeld ? (
                          !mustDiscardLastFoot && (
                            <>
                              <button
                                onClick={handleStage}
                                disabled={selectedIds.length < 3}
                                className="btn-secondary disabled:opacity-35"
                              >
                                Stage
                              </button>
                              <button
                                onClick={handleMeld}
                                disabled={
                                  stagedBooks.length === 0 || stagedPoints < requiredMeld
                                }
                                className="btn-primary disabled:opacity-35"
                              >
                                {skipAndRunMeld
                                  ? 'Skip & run'
                                  : `Meld ${stagedPoints}/${requiredMeld}`}
                              </button>
                            </>
                          )
                        ) : (
                          !mustDiscardLastFoot && (
                            <button
                              onClick={handleStartBook}
                              disabled={selectedIds.length < 3}
                              className="btn-secondary disabled:opacity-35"
                            >
                              {skipAndRunSelected ? 'Skip & run' : 'Start book'}
                            </button>
                          )
                        )}

                        {addBookOptions.length > 0 && (
                          <>
                            {wildAddChoice && (
                              <select
                                value={selectedAddBookId ?? ''}
                                onChange={(e) =>
                                  setSelectedAddBookId(e.target.value || null)
                                }
                                className="max-w-[9rem] rounded-lg border border-white/15 bg-black/40 px-2 py-2 text-xs text-ink"
                              >
                                {addBookOptions.map((book) => (
                                  <option
                                    key={book.id}
                                    value={book.id}
                                    className="bg-felt-dark"
                                  >
                                    {book.rank}s ({book.cards.length}
                                    {bookWildCount(book) > 0
                                      ? `, ${bookWildCount(book)} wild`
                                      : ''}
                                    )
                                  </option>
                                ))}
                              </select>
                            )}
                            <button
                              onClick={handleAddToBook}
                              disabled={selectedIds.length === 0 || !matchedAddBook}
                              className="btn-secondary disabled:opacity-35"
                            >
                              {skipAndRunSelected
                                ? 'Skip & run'
                                : matchedAddBook
                                  ? `Add to ${matchedAddBook.rank}s`
                                  : 'Add to book'}
                            </button>
                          </>
                        )}

                        <button
                          onClick={handleDiscard}
                          disabled={selectedIds.length !== 1}
                          className={`disabled:opacity-35 ${
                            goingOut
                              ? 'btn-success'
                              : goToFootDiscard
                                ? 'btn-foot'
                                : 'btn-danger'
                          }`}
                        >
                          {goingOut ? 'Go out' : goToFootDiscard ? 'Go to foot' : 'Discard'}
                        </button>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {!isHumanViewer && (
          <p className="shrink-0 py-3 text-center text-xs text-ink-faint">Spectating</p>
        )}
      </div>

      {showChat && (
        <GameChat
          humanPlayers={humanPlayers}
          messages={chatMessages}
          onSend={onChatSend}
          defaultSenderSeat={chatSenderSeat}
          dockedAboveHand={isHumanViewer}
        />
      )}
    </div>
  )
}
