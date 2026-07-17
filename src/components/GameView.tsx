import { useEffect, useMemo, useRef, useState } from 'react'
import type { GameState } from '../game/deal'
import { playerFootCount, playerHandCount } from '../game/deal'
import {
  addToBook,
  canGoToFoot,
  canPlayerGoOut,
  commitStagedMelds,
  discardCard,
  drawCards,
  getCurrentPlayer,
  getTeam,
  footMeldLeavesDiscard,
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
  getWildPlayBlockReason,
  needsAddBookPicker,
  shouldWarnDiscardToBook,
  bookWildCount,
} from '../game/books'
import { meldContributionFromCards, meldThreshold, sumCardPoints } from '../game/scoring'
import { playSound, unlockAudio } from '../game/audio'
import { HandCards } from './HandCards'
import { StagingArea, type StagedBook } from './StagingArea'
import { RoundTable } from './RoundTable'
import { MeldTracker, CurrentRoundTracker } from './Scoreboard'
import { GameChat } from './GameChat'
import { GameMessageBar } from './GameMessageBar'
import { TEAM_COLORS, partnerSeat, type PlayerCount } from '../game/teams'
import type { ChatMessage } from '../game/chat'
import { getPartnerGoOutHint, pendingPartnerGoOutRequest } from '../game/chat'
import { aiPartnerGoOutReplySeats, maybeAiPartnerGoOutResponse } from '../game/ai/chatSignals'

interface GameViewProps {
  game: GameState
  onGameChange: (game: GameState, options?: { recordHistory?: boolean }) => void
  chatMessages: ChatMessage[]
  onChatSend: (message: ChatMessage, validationState?: GameState) => void
  autoSort?: boolean
}

const AI_TURN_DELAY_MS = 900
const AI_PARTNER_REPLY_DELAY_MS = 900

function shortStatus(opts: {
  aiThinking: boolean
  currentName: string
  currentAvatar: string
  isMyTurn: boolean
  turnPhase: string
  isPlayingFoot: boolean
  goingOut: boolean
  hasFoot: boolean
}): string {
  if (opts.aiThinking) return `${opts.currentName}…`
  if (!opts.isMyTurn) return `${opts.currentAvatar} ${opts.currentName}`
  if (opts.turnPhase === 'draw') {
    return opts.isPlayingFoot ? 'Draw for your foot' : 'Draw two'
  }
  if (opts.goingOut) return 'Discard to go out'
  if (opts.isPlayingFoot) return 'Playing foot'
  if (opts.hasFoot) return 'Meld or discard'
  return 'Your turn'
}

export function GameView({
  game,
  onGameChange,
  chatMessages,
  onChatSend,
  autoSort = false,
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
  const chatRef = useRef(chatMessages)
  chatRef.current = chatMessages
  const handledGoOutReplyKeys = useRef(new Set<string>())

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
    () => stagedBooks.reduce((sum, b) => sum + meldContributionFromCards(b.cards), 0),
    [stagedBooks],
  )

  const selectedCards = handForDisplay.filter((c) => selectedIds.includes(c.id))
  const selectedPoints = needsStagedMeld
    ? meldContributionFromCards(selectedCards)
    : sumCardPoints(selectedCards)
  const addBookOptions = useMemo(
    () =>
      team.meldThresholdMet && !isLastFootCard(viewer)
        ? findAllBooksForSelectedCards(
            viewer.hand,
            selectedIds,
            team.books,
            game.booksWithWildAddedThisTurn,
          )
        : [],
    [
      team.meldThresholdMet,
      team.books,
      viewer,
      selectedIds,
      game.booksWithWildAddedThisTurn,
    ],
  )
  const showAddBookPicker = useMemo(
    () =>
      needsAddBookPicker(
        viewer.hand,
        selectedIds,
        team.books,
        game.booksWithWildAddedThisTurn,
      ),
    [viewer.hand, selectedIds, team.books, game.booksWithWildAddedThisTurn],
  )
  const matchedAddBook = useMemo(() => {
    if (addBookOptions.length === 0) return null
    if (showAddBookPicker) {
      return addBookOptions.find((b) => b.id === selectedAddBookId) ?? null
    }
    return findBookForSelectedCards(
      viewer.hand,
      selectedIds,
      team.books,
      game.booksWithWildAddedThisTurn,
    )
  }, [
    addBookOptions,
    showAddBookPicker,
    selectedAddBookId,
    viewer.hand,
    selectedIds,
    team.books,
    game.booksWithWildAddedThisTurn,
  ])

  const wildBlockReason = useMemo(() => {
    if (!isMyTurn || game.turnPhase !== 'play') return null
    const mode = needsStagedMeld ? 'stage' : team.meldThresholdMet ? 'add' : 'start'
    return getWildPlayBlockReason(
      viewer.hand,
      selectedIds,
      team.books,
      mode,
      game.booksWithWildAddedThisTurn,
    )
  }, [
    isMyTurn,
    game.turnPhase,
    game.booksWithWildAddedThisTurn,
    needsStagedMeld,
    team.meldThresholdMet,
    viewer.hand,
    selectedIds,
    team.books,
  ])
  const goingOut = isMyTurn && canPlayerGoOut(game, chatMessages)
  const lastFootCard = isMyTurn && isLastFootCard(viewer) && game.turnPhase === 'play'
  const goOutBlockReason = useMemo(() => {
    if (!lastFootCard || goingOut) return null
    const bookReason = getGoOutBlockReason(team.books, team.meldThresholdMet)
    if (bookReason) return bookReason
    return getPartnerGoOutHint(game, viewerSeat, chatMessages)
  }, [
    lastFootCard,
    goingOut,
    team.books,
    team.meldThresholdMet,
    game,
    viewerSeat,
    chatMessages,
  ])
  const mustDiscardLastFoot = lastFootCard
  const footMeldUsesAllCards = useMemo(() => {
    if (!viewer.isPlayingFoot || !isMyTurn || game.turnPhase !== 'play') return false
    if (isLastFootCard(viewer)) return true

    const stagedIds = stagedBooks.flatMap((b) => b.cardIds)
    if (stagedIds.length > 0 && !footMeldLeavesDiscard(viewer, stagedIds)) {
      return true
    }

    if (selectedIds.length > 0 && !footMeldLeavesDiscard(viewer, selectedIds)) {
      return true
    }

    const stagedAndSelected = [...new Set([...stagedIds, ...selectedIds])]
    return (
      stagedAndSelected.length > 0 &&
      !footMeldLeavesDiscard(viewer, stagedAndSelected)
    )
  }, [
    viewer,
    isMyTurn,
    game.turnPhase,
    stagedBooks,
    selectedIds,
  ])
  const footMeldHint = useMemo(() => {
    if (!footMeldUsesAllCards || goingOut) return null
    if (isLastFootCard(viewer)) return null
    return 'Keep at least one card to discard — you cannot meld your whole foot.'
  }, [footMeldUsesAllCards, goingOut, viewer])
  const playerHint = error ? null : wildBlockReason ?? footMeldHint ?? goOutBlockReason
  const goToFootDiscard =
    isMyTurn && canGoToFoot(viewer) && selectedIds.length === 1
  const skipAndRunSelected =
    isMyTurn && willSkipAndRun(viewer, selectedIds)
  const skipAndRunMeld =
    isMyTurn && willSkipAndRun(viewer, stagedBooks.flatMap((b) => b.cardIds))
  const skipAndRunActive = skipAndRunMeld || skipAndRunSelected
  const skipAndRunDisabled = skipAndRunMeld
    ? stagedBooks.length === 0 || stagedPoints < requiredMeld
    : addBookOptions.length > 0 && skipAndRunSelected
      ? selectedIds.length === 0 || !matchedAddBook
      : selectedIds.length < 3
  const teamColor = TEAM_COLORS[viewer.profile.teamId]

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
    if (!showAddBookPicker) {
      setSelectedAddBookId(null)
      return
    }
    setSelectedAddBookId((prev) =>
      prev && addBookOptions.some((b) => b.id === prev) ? prev : addBookOptions[0]?.id ?? null,
    )
  }, [showAddBookPicker, addBookOptions, selectedIds])

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

  /* Any AI partner replies when a teammate asks to go out (all teams, not just viewer). */
  useEffect(() => {
    if (game.phase !== 'playing') return

    const playerCount = game.playerCount as PlayerCount
    const timers: ReturnType<typeof setTimeout>[] = []

    for (const responderSeat of aiPartnerGoOutReplySeats(game, chatMessages)) {
      const partnerIdx = partnerSeat(responderSeat, playerCount)
      const pending = pendingPartnerGoOutRequest(chatMessages, responderSeat, partnerIdx)
      if (!pending) continue

      const replyKey = `${pending.id}:${responderSeat}`
      if (handledGoOutReplyKeys.current.has(replyKey)) continue

      const requestId = pending.id
      timers.push(
        setTimeout(() => {
          const stillPending = pendingPartnerGoOutRequest(
            chatRef.current,
            responderSeat,
            partnerIdx,
          )
          if (!stillPending || stillPending.id !== requestId) return
          if (handledGoOutReplyKeys.current.has(replyKey)) return

          const response = maybeAiPartnerGoOutResponse(
            game,
            responderSeat,
            chatRef.current,
          )
          if (!response) return

          handledGoOutReplyKeys.current.add(replyKey)
          onChatSend(response, game)
        }, AI_PARTNER_REPLY_DELAY_MS),
      )
    }

    return () => timers.forEach(clearTimeout)
  }, [chatMessages, game, onChatSend])

  useEffect(() => {
    if (game.phase !== 'playing' || current.profile.isHuman) {
      setAiThinking(false)
      return
    }

    const resumeDelay = canPlayerGoOut(game, chatMessages) ? 0 : AI_TURN_DELAY_MS
    setAiThinking(true)
    const timer = setTimeout(() => {
      const result = runAiTurn(game, chatRef.current)
      if (result.chatMessage) {
        onChatSend(result.chatMessage, result.state)
      }
      onGameChange(result.state)
      setAiThinking(false)
    }, resumeDelay)

    return () => clearTimeout(timer)
  }, [game, chatMessages, current.profile.isHuman, onGameChange, onChatSend])

  function toggleCard(cardId: string) {
    if (!isMyTurn || game.turnPhase === 'draw') return
    setError(null)
    setSelectedIds((prev) =>
      prev.includes(cardId) ? prev.filter((id) => id !== cardId) : [...prev, cardId],
    )
  }

  function applyHandSort(cards: typeof viewer.hand, playSoundEffect = true) {
    const display = cards.filter((c) => !stagedCardIds.has(c.id))
    const staged = handOrder.filter((id) => stagedCardIds.has(id))
    setHandOrder([...sortCardIdsByHand(display), ...staged])
    if (playSoundEffect) playSound('sort')
  }

  function handleAutoSort() {
    unlockAudio()
    applyHandSort(handForDisplay)
  }

  function handleDraw() {
    unlockAudio()
    setError(null)
    playSound('draw')
    const result = drawCards(game)
    onGameChange(result, { recordHistory: true })
    if (autoSort) {
      const newHand = result.players[viewerSeat].hand
      applyHandSort(newHand, false)
    }
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
    onGameChange(result.state, { recordHistory: true })
  }

  function handleAddToBook() {
    unlockAudio()
    if (!matchedAddBook) {
      setError(
        showAddBookPicker ? 'Choose which book to add to.' : 'Selected cards cannot be added to any book.',
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
    onGameChange(result.state, { recordHistory: true })
  }

  function performDiscard(cardId: string) {
    const result = discardCard(game, cardId, chatMessages)
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
    onGameChange(result.state, { recordHistory: true })
  }

  function handleDiscard() {
    unlockAudio()
    if (selectedIds.length !== 1) {
      setError('Select exactly one card to discard.')
      playSound('invalid')
      return
    }

    const cardId = selectedIds[0]

    if (isLastFootCard(viewer)) {
      const blockReason = getGoOutBlockReason(team.books, team.meldThresholdMet)
      if (blockReason) {
        setError(blockReason)
        playSound('invalid')
        return
      }
    }

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
    onGameChange(result.state, { recordHistory: true })
  }

  function handleSkipAndRun() {
    unlockAudio()
    if (skipAndRunMeld) {
      handleMeld()
    } else if (addBookOptions.length > 0 && matchedAddBook) {
      handleAddToBook()
    } else {
      handleStartBook()
    }
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
    hasFoot: viewer.foot.length > 0,
  })

  const canDraw = isMyTurn && game.turnPhase === 'draw'
  const showStagingRibbon =
    isMyTurn && needsStagedMeld && game.turnPhase === 'play'

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
            <MeldTracker teams={game.teams} />
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
            className="south-player-dock relative z-20 flex max-h-[min(34vh,340px)] shrink-0 flex-col overflow-hidden sm:max-h-[min(32vh,360px)]"
            style={{
              background:
                'linear-gradient(to top, rgba(6,20,14,0.92) 0%, rgba(8,28,18,0.78) 70%, rgba(8,28,18,0.45) 100%)',
              boxShadow: `inset 0 1px 0 ${teamColor}33`,
            }}
          >
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden pb-0.5">
              <div className="south-dock-hand-meta flex shrink-0 items-center gap-x-2.5 gap-y-1 px-3 py-1.5 sm:gap-x-3 sm:px-4 sm:py-2">
                <span className="flex shrink-0 items-center gap-1.5 text-[10px] tabular-nums text-ink-faint">
                  {(!viewer.isPlayingFoot || playerHandCount(viewer) > 0) && (
                    <span className="seat-chip-pile" title="Hand cards">
                      <span className="seat-chip-pile-label">H</span>
                      <span className="seat-chip-pile-count">{playerHandCount(viewer)}</span>
                    </span>
                  )}
                  <span
                    className={[
                      'seat-chip-pile',
                      viewer.isPlayingFoot ? 'seat-chip-pile-foot-active' : '',
                      viewer.footOnHold ? 'seat-chip-pile-foot-hold' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    title={
                      viewer.isPlayingFoot
                        ? 'Playing foot'
                        : viewer.footOnHold
                          ? 'Foot on hold'
                          : 'Foot cards'
                    }
                  >
                    <span className="seat-chip-pile-label">F</span>
                    <span className="seat-chip-pile-count">{playerFootCount(viewer)}</span>
                  </span>
                  {selectedIds.length > 0 && (
                    <span className="text-ink-muted">{selectedPoints} pts</span>
                  )}
                </span>

                <div className="flex min-h-[1.125rem] min-w-0 flex-1 items-center justify-center px-0.5">
                  {showStagingRibbon && stagedBooks.length === 0 && (
                    <p className="truncate text-center text-[10px] leading-snug text-accent/85 sm:text-[11px]">
                      Stage private melds · need{' '}
                      <span className="font-semibold tabular-nums text-accent">
                        {requiredMeld}+
                      </span>
                    </p>
                  )}
                  {showStagingRibbon && stagedBooks.length > 0 && (
                    <StagingArea
                      stagedBooks={stagedBooks}
                      requiredPoints={requiredMeld}
                      onRemove={handleRemoveStaged}
                      onClear={() => setStagedBooks([])}
                      compact
                      ribbon
                      embedded
                    />
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleAutoSort}
                  disabled={viewer.hand.length < 2}
                  className="shrink-0 rounded-md border border-white/20 bg-white/10 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-ink-soft shadow-sm transition hover:border-white/30 hover:bg-white/18 hover:text-ink active:translate-y-px disabled:opacity-30"
                >
                  Sort
                </button>
              </div>

              <div className="theme-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-1 sm:px-4 sm:py-1.5">
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
              </div>

              <GameMessageBar
                error={error}
                hint={playerHint}
                discardWarning={!error ? discardWarning : null}
                onDismissDiscardWarning={() => setDiscardWarning(null)}
                onConfirmDiscard={handleConfirmDiscard}
              />

              <div
                className="game-action-slot flex min-h-[3.25rem] shrink-0 flex-wrap items-center justify-center gap-2 px-3 py-2 sm:px-4"
                aria-hidden={!isMyTurn}
              >
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
                                disabled={
                                  selectedIds.length < 3 ||
                                  footMeldUsesAllCards
                                }
                                className="btn-secondary disabled:opacity-35"
                              >
                                Stage
                              </button>
                              <button
                                onClick={handleMeld}
                                disabled={
                                  stagedBooks.length === 0 ||
                                  stagedPoints < requiredMeld ||
                                  footMeldUsesAllCards
                                }
                                className="btn-primary disabled:opacity-35"
                              >
                                Meld {stagedPoints}/{requiredMeld}
                              </button>
                            </>
                          )
                        ) : (
                          !mustDiscardLastFoot && (
                            <button
                              onClick={handleStartBook}
                              disabled={
                                selectedIds.length < 3 || footMeldUsesAllCards
                              }
                              className="btn-secondary disabled:opacity-35"
                            >
                              Start book
                            </button>
                          )
                        )}

                        {addBookOptions.length > 0 && (
                          <>
                            {showAddBookPicker && (
                              <select
                                value={selectedAddBookId ?? ''}
                                onChange={(e) =>
                                  setSelectedAddBookId(e.target.value || null)
                                }
                                className="field-control field-control--compact max-w-[11rem]"
                                aria-label="Choose book to add to"
                              >
                                {addBookOptions.map((book) => {
                                  const wilds = bookWildCount(book)
                                  return (
                                    <option
                                      key={book.id}
                                      value={book.id}
                                      className="bg-felt-dark"
                                    >
                                      {book.rank}s · {book.cards.length} cards
                                      {wilds === 0 ? ' · clean' : ` · ${wilds} wild`}
                                    </option>
                                  )
                                })}
                              </select>
                            )}
                            <button
                              onClick={handleAddToBook}
                              disabled={
                                selectedIds.length === 0 ||
                                !matchedAddBook ||
                                footMeldUsesAllCards
                              }
                              className="btn-secondary disabled:opacity-35"
                            >
                              {matchedAddBook
                                ? `Add to ${matchedAddBook.rank}s`
                                : 'Add to book'}
                            </button>
                          </>
                        )}

                        {skipAndRunActive ? (
                          <button
                            onClick={handleSkipAndRun}
                            disabled={skipAndRunDisabled}
                            className="btn-foot disabled:opacity-35"
                          >
                            Skip &amp; run
                          </button>
                        ) : (
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
                            {goingOut
                              ? 'Go out'
                              : lastFootCard
                                ? 'Discard to go out'
                                : goToFootDiscard
                                  ? 'Go to foot'
                                  : 'Discard'}
                          </button>
                        )}
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

      {game.phase === 'playing' && (
        <GameChat
          game={game}
          viewerSeat={viewerSeat}
          messages={chatMessages}
          onSend={onChatSend}
        />
      )}
    </div>
  )
}
