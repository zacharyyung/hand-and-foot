import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { isWildCard, sameNaturalSelectClass, type Card } from '../game/cards'
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
  checkFootMeld,
  footMeldLeavesDiscard,
  isLastFootCard,
  startBook,
  validateStageBook,
  willSkipAndRun,
} from '../game/actions'
import { runAiTurn } from '../game/ai/runTurn'
import { AiDebugCollector, type AiDebugTurnTrace } from '../game/ai/debugTrace'
import { getViewerSeat } from '../game/tableLayout'
import { mergeHandOrder, sortCardIdsByHand } from '../game/handOrder'
import {
  canStartBook,
  canAddToBook,
  findAllBooksForSelectedCards,
  findBookForSelectedCards,
  getGoOutBlockReason,
  getWildPlayBlockReason,
  needsAddBookPicker,
  shouldWarnDiscardToBook,
  bookWildCount,
  cardsForBookFan,
  type Book,
} from '../game/books'
import { meldContributionFromCards, meldThreshold, sumCardPoints } from '../game/scoring'
import { playSound, unlockAudio } from '../game/audio'
import { usePartnerVoice } from '../partnerVoice'
import type { PartnerVoiceSettings } from '../partnerVoice'
import { useCardSettleMotion } from '../game/cardMotion'
import { useCardFlightSystem } from '../game/cardFlight'
import { handFlightAnchor, stagingBookAnchor, bookFlightAnchor } from '../game/flightAnchors'
import type { CardFlightRequest } from '../game/cardFlight'
import { CardFlightLayer } from './CardFlightLayer'
import { HandCards } from './HandCards'
import { StagingArea, type StagedBook } from './StagingArea'
import { RoundTable } from './RoundTable'
import { MeldTracker, CurrentRoundTracker } from './Scoreboard'
import { GameChat } from './GameChat'
import { PartnerVoiceOverlay } from './PartnerVoiceOverlay'
import { GameMessageBar } from './GameMessageBar'
import { GameSettingsPanel } from './GameSettingsPanel'
import { AiDebugPanel } from './AiDebugPanel'
import { useGameShellLayout } from './useGameShellLayout'
import { TEAM_COLORS, partnerSeat, type PlayerCount } from '../game/teams'
import type { ChatMessage } from '../game/chat'
import {
  createWildApproveSignal,
  createWildDenySignal,
  getPartnerGoOutHint,
  pendingPartnerGoOutRequest,
  pendingPartnerWildRequest,
  wildRequestTargetBook,
} from '../game/chat'
import { aiPartnerGoOutReplySeats, maybeAiPartnerGoOutResponse } from '../game/ai/chatSignals'
import { partnerVoiceService, speakPartnerAck } from '../partnerVoice'
import type { DirtyBookConsent } from './DirtyBookConsentPrompt'

interface GameViewProps {
  game: GameState
  onGameChange: (game: GameState, options?: { recordHistory?: boolean }) => void
  chatMessages: ChatMessage[]
  onChatSend: (message: ChatMessage, validationState?: GameState) => void
  autoSort?: boolean
  onAutoSortChange?: (enabled: boolean) => void
  onShowInstructions?: () => void
  startOverVotes?: number[]
  onStartOverVote?: (seatIndex: number) => void
  canRequestUndo?: boolean
  undoPending?: boolean
  onRequestUndo?: () => void
  aiDebugEnabled?: boolean
  onAiDebugChange?: (enabled: boolean) => void
  partnerVoiceSettings: PartnerVoiceSettings
  onPartnerVoiceChange: (settings: PartnerVoiceSettings) => void
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
  onAutoSortChange,
  onShowInstructions,
  startOverVotes = [],
  onStartOverVote,
  canRequestUndo = false,
  undoPending = false,
  onRequestUndo,
  aiDebugEnabled = false,
  onAiDebugChange,
  partnerVoiceSettings,
  onPartnerVoiceChange,
}: GameViewProps) {
  const shellRef = useRef<HTMLDivElement>(null)
  const shellLayout = useGameShellLayout(shellRef)
  const mobileLayout = shellLayout === 'mobile'
  const compactHeader = shellLayout !== 'comfortable'
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [aiDebugTraces, setAiDebugTraces] = useState<Record<number, AiDebugTurnTrace>>({})
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
  const chatRef = useRef(chatMessages)
  chatRef.current = chatMessages
  const handledGoOutReplyKeys = useRef(new Set<string>())
  const stagingFlightIdsRef = useRef<Set<string>>(new Set())
  const stagingBookIdByCardRef = useRef<Map<string, string>>(new Map())
  const meldFlightPendingRef = useRef(false)
  const handFlightRetainRef = useRef<Map<string, Card>>(new Map())
  const prevBooksGameRef = useRef<GameState | null>(null)

  const viewerSeat = useMemo(() => getViewerSeat(game.players), [game.players])
  usePartnerVoice(game, chatMessages)
  const viewer = game.players[viewerSeat]
  const isHumanViewer = viewer.profile.isHuman
  const stagedCardIds = useMemo(
    () => new Set(stagedBooks.flatMap((b) => b.cardIds)),
    [stagedBooks],
  )
  const { getMotion: getCardMotion, markMotion } = useCardSettleMotion()
  const { flights, settleFlight, isCardInFlight, queueLocalFlights } =
    useCardFlightSystem(game, viewerSeat, {
      isHumanViewer,
      stagedCardIds,
      stagingFlightIdsRef,
      stagingBookIdByCardRef,
    })
  const flightsRef = useRef(flights)
  flightsRef.current = flights

  function retainHandCardsForFlight(cards: Card[]) {
    for (const card of cards) handFlightRetainRef.current.set(card.id, card)
  }

  function releaseHandCardsForFlight(cardIds: string[]) {
    for (const id of cardIds) handFlightRetainRef.current.delete(id)
  }

  function clearStagingFlightTracking(cardIds: string[]) {
    for (const id of cardIds) {
      stagingFlightIdsRef.current.delete(id)
      stagingBookIdByCardRef.current.delete(id)
    }
    if (meldFlightPendingRef.current) {
      setStagedBooks((prev) =>
        prev.filter((book) => book.cardIds.some((id) => stagingFlightIdsRef.current.has(id))),
      )
      if (stagingFlightIdsRef.current.size === 0) {
        meldFlightPendingRef.current = false
      }
    }
  }

  function handleSettleFlight(flightId: string) {
    const flight = flightsRef.current.find((f) => f.flightId === flightId)
    settleFlight(flightId)
    if (!flight) return
    releaseHandCardsForFlight(flight.cards.map((c) => c.id))
    clearStagingFlightTracking(flight.cards.map((c) => c.id))
  }

  function queueHandToTargetFlight(
    cards: Card[],
    to: CardFlightRequest['to'],
    bookLayout?: CardFlightRequest['bookLayout'],
  ) {
    if (cards.length === 0) return
    retainHandCardsForFlight(cards)
    const sourceCard = cards[Math.floor((cards.length - 1) / 2)]
    queueLocalFlights([
      {
        cards,
        from: handFlightAnchor(sourceCard.id),
        to,
        kind: 'place',
        bookLayout,
      },
    ])
  }

  function queueDiscardFlight(card: Card) {
    retainHandCardsForFlight([card])
    queueLocalFlights([
      {
        cards: [card],
        from: handFlightAnchor(card.id),
        to: 'discard',
        kind: 'discard',
      },
    ])
  }
  const current = getCurrentPlayer(game)
  const isMyTurn = game.currentPlayerIndex === viewerSeat
  const team = getTeam(game, viewer.profile.teamId)
  const partnerIdx = partnerSeat(viewerSeat, game.playerCount as PlayerCount)
  const partner = game.players[partnerIdx]
  const wildRequest =
    viewer.profile.isHuman && !partner.profile.isHuman
      ? pendingPartnerWildRequest(chatMessages, viewerSeat, partnerIdx)
      : null
  const wildTargetBook = wildRequest ? wildRequestTargetBook(wildRequest, team.books) : null

  function respondWildConsent(approve: boolean) {
    unlockAudio()
    partnerVoiceService.unlock()
    playSound('chat')
    onChatSend(
      approve
        ? createWildApproveSignal(viewerSeat, viewer.profile.name, viewer.profile.avatar)
        : createWildDenySignal(viewerSeat, viewer.profile.name, viewer.profile.avatar),
      game,
    )
    speakPartnerAck(approve)
  }

  const dirtyBookConsent: DirtyBookConsent | null =
    wildRequest && wildTargetBook
      ? {
          bookId: wildTargetBook.id,
          partnerName: partner.profile.name,
          partnerAvatar: partner.profile.avatar,
          onApprove: () => respondWildConsent(true),
          onDeny: () => respondWildConsent(false),
        }
      : null

  const requiredMeld = meldThreshold(team.score)
  const needsStagedMeld = !team.meldThresholdMet
  const handKey = viewer.hand.map((c) => c.id).sort().join(',')

  const handForDisplay = useMemo(() => {
    const handIds = new Set(viewer.hand.map((c) => c.id))
    const visibleHand = viewer.hand.filter(
      (c) => !stagedCardIds.has(c.id) || isCardInFlight(c.id),
    )
    const retained = [...handFlightRetainRef.current.values()].filter(
      (c) => !handIds.has(c.id) && isCardInFlight(c.id),
    )
    return [...visibleHand, ...retained]
  }, [viewer.hand, stagedCardIds, isCardInFlight])

  const stagedPoints = useMemo(
    () => stagedBooks.reduce((sum, b) => sum + meldContributionFromCards(b.cards), 0),
    [stagedBooks],
  )

  const matchingStagedBook = useMemo(() => {
    if (selectedIds.length === 0 || stagedBooks.length === 0) return null
    const cards = viewer.hand.filter((c) => selectedIds.includes(c.id))
    if (cards.length === 0) return null
    const naturals = cards.filter((c) => !isWildCard(c))
    const staged =
      naturals.length > 0
        ? stagedBooks.find((b) => b.rank === naturals[0].rank)
        : null
    if (!staged) return null
    const stagedAsBook: Book = {
      id: staged.id,
      rank: staged.rank,
      cards: staged.cards,
      teamId: team.id,
      startedBySeatIndex: viewerSeat,
    }
    return canAddToBook(stagedAsBook, cards).ok ? staged : null
  }, [selectedIds, stagedBooks, viewer.hand, team.id, viewerSeat])

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
  const footMeldBlockReason = useMemo((): string | null => {
    if (!viewer.isPlayingFoot || !isMyTurn || game.turnPhase !== 'play') return null
    if (isLastFootCard(viewer)) return null

    const tryCheck = (cardIds: string[], books: Book[], thresholdMet: boolean) => {
      if (cardIds.length === 0) return null
      const result = checkFootMeld(viewer, cardIds, books, thresholdMet)
      return result.ok ? null : result.error
    }

    const stagedIds = stagedBooks.flatMap((b) => b.cardIds)

    if (selectedIds.length > 0 && !footMeldLeavesDiscard(viewer, selectedIds)) {
      return 'Keep at least one card to discard — you cannot meld your whole foot.'
    }

    if (stagedIds.length > 0 && !footMeldLeavesDiscard(viewer, stagedIds)) {
      return 'Keep at least one card to discard — you cannot meld your whole foot.'
    }

    const stagedAndSelected = [...new Set([...stagedIds, ...selectedIds])]
    if (
      stagedAndSelected.length > 0 &&
      !footMeldLeavesDiscard(viewer, stagedAndSelected)
    ) {
      return 'Keep at least one card to discard — you cannot meld your whole foot.'
    }

    if (stagedIds.length > 0) {
      let virtualBooks: Book[] = [...team.books]
      for (const staged of stagedBooks) {
        virtualBooks = [
          ...virtualBooks,
          {
            id: staged.id,
            rank: staged.rank,
            cards: staged.cards,
            teamId: team.id,
            startedBySeatIndex: viewerSeat,
          },
        ]
      }
      const stagedReason = tryCheck(stagedIds, virtualBooks, true)
      if (stagedReason) return stagedReason
    }

    if (needsStagedMeld && matchingStagedBook && selectedIds.length > 0) {
      const cards = viewer.hand.filter((c) => selectedIds.includes(c.id))
      let virtualBooks: Book[] = [...team.books]
      for (const staged of stagedBooks) {
        const nextCards =
          staged.id === matchingStagedBook.id
            ? [...staged.cards, ...cards]
            : staged.cards
        virtualBooks = [
          ...virtualBooks,
          {
            id: staged.id,
            rank: staged.rank,
            cards: nextCards,
            teamId: team.id,
            startedBySeatIndex: viewerSeat,
          },
        ]
      }
      const addStageReason = tryCheck(stagedAndSelected, virtualBooks, true)
      if (addStageReason) return addStageReason
    } else if (needsStagedMeld && selectedIds.length >= 3) {
      const cards = viewer.hand.filter((c) => selectedIds.includes(c.id))
      const stageCheck = validateStageBook(
        viewer.hand,
        selectedIds,
        team.books,
        stagedBooks.map((b) => b.rank),
      )
      if (stageCheck.ok) {
        let virtualBooks: Book[] = [...team.books]
        for (const staged of stagedBooks) {
          virtualBooks = [
            ...virtualBooks,
            {
              id: staged.id,
              rank: staged.rank,
              cards: staged.cards,
              teamId: team.id,
              startedBySeatIndex: viewerSeat,
            },
          ]
        }
        virtualBooks = [
          ...virtualBooks,
          {
            id: 'preview-stage',
            rank: stageCheck.rank,
            cards,
            teamId: team.id,
            startedBySeatIndex: viewerSeat,
          },
        ]
        const stageReason = tryCheck(stagedAndSelected, virtualBooks, true)
        if (stageReason) return stageReason
      }
    }

    if (team.meldThresholdMet && matchedAddBook && selectedIds.length > 0) {
      const selected = viewer.hand.filter((c) => selectedIds.includes(c.id))
      const addCheck = canAddToBook(matchedAddBook, selected, {
        wildAlreadyAddedThisTurn: game.booksWithWildAddedThisTurn.includes(
          matchedAddBook.id,
        ),
      })
      if (addCheck.ok) {
        const updatedBook = {
          ...matchedAddBook,
          cards: [...matchedAddBook.cards, ...selected],
        }
        const books = team.books.map((b) =>
          b.id === matchedAddBook.id ? updatedBook : b,
        )
        const addReason = tryCheck(selectedIds, books, team.meldThresholdMet)
        if (addReason) return addReason
      }
    }

    if (selectedIds.length >= 3 && team.meldThresholdMet) {
      const selected = viewer.hand.filter((c) => selectedIds.includes(c.id))
      const startCheck = canStartBook(selected, team.books)
      if (startCheck.ok) {
        const projectedBook: Book = {
          id: 'preview-start',
          rank: startCheck.rank,
          cards: selected,
          teamId: team.id,
          startedBySeatIndex: viewerSeat,
        }
        const startReason = tryCheck(
          selectedIds,
          [...team.books, projectedBook],
          team.meldThresholdMet,
        )
        if (startReason) return startReason
      }
    }

    return null
  }, [
    viewer,
    isMyTurn,
    game.turnPhase,
    game.booksWithWildAddedThisTurn,
    stagedBooks,
    selectedIds,
    team.books,
    team.id,
    team.meldThresholdMet,
    viewerSeat,
    needsStagedMeld,
    matchedAddBook,
    matchingStagedBook,
  ])
  const footMeldBlocked = footMeldBlockReason !== null
  const footMeldHint = useMemo(() => {
    if (!footMeldBlocked || goingOut || isLastFootCard(viewer)) return null
    return footMeldBlockReason
  }, [footMeldBlocked, footMeldBlockReason, goingOut, viewer])
  const playerHint = error ? null : wildBlockReason ?? footMeldHint ?? goOutBlockReason
  const goToFootDiscard =
    isMyTurn &&
    canGoToFoot(viewer) &&
    selectedIds.length === 1 &&
    addBookOptions.length === 0
  const skipAndRunSelected =
    isMyTurn && willSkipAndRun(viewer, selectedIds)
  const skipAndRunMeld =
    isMyTurn && willSkipAndRun(viewer, stagedBooks.flatMap((b) => b.cardIds))
  const skipAndRunActive = skipAndRunMeld || skipAndRunSelected
  const skipAndRunDisabled = skipAndRunMeld
    ? stagedBooks.length === 0 ||
      (needsStagedMeld && stagedPoints < requiredMeld) ||
      footMeldBlocked
    : addBookOptions.length > 0 && skipAndRunSelected
      ? selectedIds.length === 0 || !matchedAddBook
      : selectedIds.length < 3
  const hasLeftoverStaging = !needsStagedMeld && stagedBooks.length > 0
  const teamColor = TEAM_COLORS[viewer.profile.teamId]

  useLayoutEffect(() => {
    setHandOrder((prev) => {
      const merged = mergeHandOrder(prev, viewer.hand)
      if (autoSort && isHumanViewer) {
        const display = viewer.hand.filter((c) => !stagedCardIds.has(c.id))
        const staged = merged.filter((id) => stagedCardIds.has(id))
        return [...sortCardIdsByHand(display), ...staged]
      }
      return merged
    })
  }, [handKey, viewer.hand, autoSort, isHumanViewer, stagedCardIds])

  /* Staging persists across turns; only reset on a new round / leaving play. */
  useEffect(() => {
    setStagedBooks([])
    stagingFlightIdsRef.current.clear()
    stagingBookIdByCardRef.current.clear()
    meldFlightPendingRef.current = false
  }, [game.roundNumber, game.phase])

  /* Drop staged groups whose cards are no longer in hand (e.g. after undo). */
  useEffect(() => {
    if (meldFlightPendingRef.current) return
    const handIds = new Set(viewer.hand.map((c) => c.id))
    setStagedBooks((prev) => {
      let changed = false
      const next = prev
        .map((book) => {
          const cardIds = book.cardIds.filter((id) => handIds.has(id))
          const cards = book.cards.filter((c) => handIds.has(c.id))
          if (cardIds.length === book.cardIds.length) return book
          changed = true
          if (cardIds.length < 3) return null
          return { ...book, cardIds, cards }
        })
        .filter((book): book is StagedBook => book != null)
      return changed ? next : prev
    })
  }, [viewer.hand])

  useEffect(() => {
    setSelectedIds([])
    setError(null)
    setDiscardWarning(null)
    setSelectedAddBookId(null)
  }, [game.currentPlayerIndex, game.turnPhase])

  // Drop the discard-to-book prompt once the warned card is no longer the sole selection.
  useEffect(() => {
    setDiscardWarning((current) => {
      if (!current) return null
      if (selectedIds.length === 1 && selectedIds[0] === current.cardId) return current
      return null
    })
  }, [selectedIds])

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

  /* Book closed — play after the last card flight lands. */
  useEffect(() => {
    const prev = prevBooksGameRef.current
    prevBooksGameRef.current = game
    if (!prev || game.phase !== 'playing') return

    let completions = 0
    for (const team of game.teams) {
      for (const book of team.books) {
        if (book.cards.length < 7) continue
        const prevBook = prev.teams.flatMap((t) => t.books).find((b) => b.id === book.id)
        if ((prevBook?.cards.length ?? 0) < 7) completions++
      }
    }

    if (completions === 0) return

    const timers: ReturnType<typeof setTimeout>[] = []
    for (let i = 0; i < completions; i++) {
      timers.push(
        window.setTimeout(() => playSound('bookComplete'), 320 + i * 150),
      )
    }
    return () => timers.forEach((id) => window.clearTimeout(id))
  }, [game])

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
      const debugCollector = aiDebugEnabled
        ? new AiDebugCollector(
            current.profile.seatIndex,
            current.profile.name,
            current.profile.aiDifficulty ?? 'normal',
            game.roundNumber,
            current.hand,
            current.foot,
          )
        : undefined
      const result = runAiTurn(game, chatRef.current, { debug: debugCollector })
      if (result.debugTrace) {
        setAiDebugTraces((prev) => ({
          ...prev,
          [result.debugTrace!.seatIndex]: result.debugTrace!,
        }))
      }
      if (result.chatMessage) {
        onChatSend(result.chatMessage, result.state)
      }
      onGameChange(result.state)
      setAiThinking(false)
    }, resumeDelay)

    return () => clearTimeout(timer)
  }, [game, chatMessages, current.profile.isHuman, onGameChange, onChatSend, aiDebugEnabled])

  function toggleCard(cardId: string) {
    if (!isMyTurn || game.turnPhase === 'draw') return
    setError(null)
    setDiscardWarning(null)
    setSelectedIds((prev) =>
      prev.includes(cardId) ? prev.filter((id) => id !== cardId) : [...prev, cardId],
    )
  }

  /**
   * Long-press: select every natural card of that class (wilds stay individual).
   * Hold again on an already-selected card to clear the whole selection.
   * Red threes are their own class, separate from black threes.
   */
  function selectAllOfRank(cardId: string) {
    if (!isMyTurn || game.turnPhase === 'draw') return
    setError(null)
    setDiscardWarning(null)
    const card = handForDisplay.find((c) => c.id === cardId)
    if (!card) return

    // Press-and-hold on a selected card unselects everything.
    if (selectedIds.includes(cardId)) {
      setSelectedIds([])
      return
    }

    if (isWildCard(card)) {
      setSelectedIds((prev) => [...prev, cardId])
      return
    }

    const sameClassIds = handForDisplay
      .filter((c) => sameNaturalSelectClass(card, c))
      .map((c) => c.id)

    setSelectedIds((prev) => {
      const keptWilds = prev.filter((id) => {
        const c = handForDisplay.find((handCard) => handCard.id === id)
        return c != null && isWildCard(c)
      })
      return [...new Set([...keptWilds, ...sameClassIds])]
    })
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
  }

  function handleStartBook() {
    unlockAudio()
    const cards = viewer.hand.filter((c) => selectedIds.includes(c.id))
    const prevBookIds = new Set(team.books.map((b) => b.id))
    const result = startBook(game, selectedIds)
    if (result.error) {
      setError(result.error)
      playSound('invalid')
      return
    }
    const newBook = getTeam(result.state, team.id).books.find((b) => !prevBookIds.has(b.id))
    if (newBook) {
      queueHandToTargetFlight(cardsForBookFan(cards), bookFlightAnchor(newBook.id))
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
    const cards = viewer.hand.filter((c) => selectedIds.includes(c.id))
    const fanCards = cardsForBookFan(cards)
    const result = addToBook(game, matchedAddBook.id, selectedIds)
    if (result.error) {
      setError(result.error)
      playSound('invalid')
      return
    }
    const updatedBook = getTeam(result.state, team.id).books.find(
      (b) => b.id === matchedAddBook.id,
    )
    queueHandToTargetFlight(
      fanCards,
      bookFlightAnchor(matchedAddBook.id),
      updatedBook
        ? {
            totalCards: updatedBook.cards.length,
            incomingCards: fanCards.length,
            stacked: updatedBook.cards.length >= 7,
          }
        : undefined,
    )
    setSelectedIds([])
    setSelectedAddBookId(null)
    setError(null)
    playSound('place')
    onGameChange(result.state, { recordHistory: true })
  }

  function performDiscard(cardId: string) {
    const card = viewer.hand.find((c) => c.id === cardId)
    const result = discardCard(game, cardId, chatMessages)
    if (result.error) {
      setError(result.error)
      playSound('invalid')
      return
    }
    if (card) {
      queueDiscardFlight(card)
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
    const cards = viewer.hand.filter((c) => selectedIds.includes(c.id))
    if (cards.length === 0) {
      setError('Select cards to stage.')
      playSound('invalid')
      return
    }

    const naturals = cards.filter((c) => !isWildCard(c))
    const matchingStaged =
      naturals.length > 0
        ? stagedBooks.find((b) => b.rank === naturals[0].rank)
        : stagedBooks.find((b) =>
            cards.every((c) => isWildCard(c) || c.rank === b.rank),
          )

    /* Add onto an existing staged book — same rules as adding to table books. */
    if (matchingStaged) {
      const stagedAsBook: Book = {
        id: matchingStaged.id,
        rank: matchingStaged.rank,
        cards: matchingStaged.cards,
        teamId: team.id,
        startedBySeatIndex: viewerSeat,
      }
      const addCheck = canAddToBook(stagedAsBook, cards)
      if (!addCheck.ok) {
        setError(addCheck.reason)
        playSound('invalid')
        return
      }

      let virtualBooks: Book[] = [...team.books]
      for (const staged of stagedBooks) {
        const nextCards =
          staged.id === matchingStaged.id ? [...staged.cards, ...cards] : staged.cards
        virtualBooks = [
          ...virtualBooks,
          {
            id: staged.id,
            rank: staged.rank,
            cards: nextCards,
            teamId: team.id,
            startedBySeatIndex: viewerSeat,
          },
        ]
      }
      const stagedAndSelected = [
        ...new Set([...stagedBooks.flatMap((b) => b.cardIds), ...selectedIds]),
      ]
      const footCheck = checkFootMeld(viewer, stagedAndSelected, virtualBooks, true)
      if (!footCheck.ok) {
        setError(footCheck.error)
        playSound('invalid')
        return
      }

      const fanCards = cardsForBookFan(cards)
      setStagedBooks((prev) =>
        prev.map((book) =>
          book.id === matchingStaged.id
            ? {
                ...book,
                cardIds: [...book.cardIds, ...selectedIds],
                cards: [...book.cards, ...cards],
              }
            : book,
        ),
      )
      queueHandToTargetFlight(fanCards, stagingBookAnchor(matchingStaged.id))
      setSelectedIds([])
      setError(null)
      playSound('place')
      return
    }

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
    let virtualBooks: Book[] = [...team.books]
    for (const staged of stagedBooks) {
      virtualBooks = [
        ...virtualBooks,
        {
          id: staged.id,
          rank: staged.rank,
          cards: staged.cards,
          teamId: team.id,
          startedBySeatIndex: viewerSeat,
        },
      ]
    }
    virtualBooks = [
      ...virtualBooks,
      {
        id: 'preview-stage',
        rank: check.rank,
        cards,
        teamId: team.id,
        startedBySeatIndex: viewerSeat,
      },
    ]
    const stagedAndSelected = [
      ...new Set([...stagedBooks.flatMap((b) => b.cardIds), ...selectedIds]),
    ]
    const footCheck = checkFootMeld(viewer, stagedAndSelected, virtualBooks, true)
    if (!footCheck.ok) {
      setError(footCheck.error)
      playSound('invalid')
      return
    }
    const fanCards = cardsForBookFan(cards)
    const bookId = `staged-${Date.now()}-${Math.random()}`
    setStagedBooks((prev) => [
      ...prev,
      {
        id: bookId,
        cardIds: [...selectedIds],
        rank: check.rank,
        cards,
      },
    ])
    queueHandToTargetFlight(fanCards, stagingBookAnchor(bookId))
    setSelectedIds([])
    setError(null)
    playSound('place')
  }

  function handleMeld() {
    unlockAudio()
    const snapshot = [...stagedBooks]
    const prevBookIds = new Set(team.books.map((b) => b.id))
    const result = commitStagedMelds(
      game,
      snapshot.map((b) => b.cardIds),
    )
    if (result.error) {
      setError(result.error)
      playSound('invalid')
      return
    }

    const newBooks = getTeam(result.state, team.id).books.filter((b) => !prevBookIds.has(b.id))
    const meldFlights: CardFlightRequest[] = []
    for (const staged of snapshot) {
      const stagedIds = new Set(staged.cardIds)
      const matched = newBooks.find(
        (book) =>
          book.cards.length === staged.cardIds.length &&
          book.cards.every((card) => stagedIds.has(card.id)),
      )
      if (!matched) continue
      meldFlights.push({
        cards: cardsForBookFan(staged.cards),
        from: stagingBookAnchor(staged.id),
        to: bookFlightAnchor(matched.id),
        kind: 'place',
      })
    }

    if (meldFlights.length > 0) {
      meldFlightPendingRef.current = true
      stagingFlightIdsRef.current = new Set(snapshot.flatMap((book) => book.cardIds))
      for (const staged of snapshot) {
        for (const cardId of staged.cardIds) {
          stagingBookIdByCardRef.current.set(cardId, staged.id)
        }
      }
      queueLocalFlights(meldFlights)
    } else {
      setStagedBooks([])
    }

    setSelectedIds([])
    setError(null)
    playSound('place')
    onGameChange(result.state, { recordHistory: true })
  }

  /**
   * After the team has already met the meld threshold (e.g. partner melded),
   * leftover staged groups are laid as normal books — not via commitStagedMelds.
   */
  function putDownStagedGroups(groups: StagedBook[]) {
    if (groups.length === 0) return
    unlockAudio()

    let current = game
    const flights: CardFlightRequest[] = []
    const laidIds = new Set<string>()

    for (const staged of groups) {
      const prevBookIds = new Set(getTeam(current, team.id).books.map((b) => b.id))
      const result = startBook(current, staged.cardIds)
      if (result.error) {
        setError(result.error)
        playSound('invalid')
        if (flights.length > 0) {
          meldFlightPendingRef.current = true
          stagingFlightIdsRef.current = new Set(
            [...laidIds].flatMap((id) => {
              const book = groups.find((g) => g.id === id)
              return book?.cardIds ?? []
            }),
          )
          for (const id of laidIds) {
            const book = groups.find((g) => g.id === id)
            if (!book) continue
            for (const cardId of book.cardIds) {
              stagingBookIdByCardRef.current.set(cardId, book.id)
            }
          }
          queueLocalFlights(flights)
          setStagedBooks((prev) => prev.filter((b) => !laidIds.has(b.id)))
          onGameChange(current, { recordHistory: true })
        }
        return
      }

      const newBook = getTeam(result.state, team.id).books.find((b) => !prevBookIds.has(b.id))
      if (newBook) {
        flights.push({
          cards: cardsForBookFan(staged.cards),
          from: stagingBookAnchor(staged.id),
          to: bookFlightAnchor(newBook.id),
          kind: 'place',
        })
      }
      laidIds.add(staged.id)
      current = result.state
    }

    if (flights.length > 0) {
      meldFlightPendingRef.current = true
      stagingFlightIdsRef.current = new Set(groups.flatMap((book) => book.cardIds))
      for (const staged of groups) {
        for (const cardId of staged.cardIds) {
          stagingBookIdByCardRef.current.set(cardId, staged.id)
        }
      }
      queueLocalFlights(flights)
    }

    setStagedBooks((prev) => prev.filter((b) => !laidIds.has(b.id)))
    setSelectedIds([])
    setError(null)
    playSound('place')
    onGameChange(current, { recordHistory: true })
  }

  function handlePutDownStaged(id?: string) {
    const groups = id
      ? stagedBooks.filter((b) => b.id === id)
      : [...stagedBooks]
    putDownStagedGroups(groups)
  }

  function handleSkipAndRun() {
    unlockAudio()
    if (skipAndRunMeld) {
      if (needsStagedMeld) handleMeld()
      else handlePutDownStaged()
    } else if (addBookOptions.length > 0 && matchedAddBook) {
      handleAddToBook()
    } else {
      handleStartBook()
    }
  }

  function handleClearStaged() {
    stagingBookIdByCardRef.current.clear()
    setStagedBooks([])
  }

  function handleRemoveStaged(id: string) {
    setStagedBooks((prev) => {
      const removed = prev.find((b) => b.id === id)
      if (removed) {
        for (const cardId of removed.cardIds) {
          stagingBookIdByCardRef.current.delete(cardId)
        }
      }
      return prev.filter((b) => b.id !== id)
    })
    setError(null)
    playSound('deselect')
  }

  const displayHandOrder = useMemo(() => {
    const unstagedIds = handOrder.filter((id) => !stagedCardIds.has(id))
    const unstagedCards = unstagedIds
      .map((id) => handForDisplay.find((c) => c.id === id))
      .filter((c): c is (typeof handForDisplay)[number] => c !== undefined)
    const orphans = handForDisplay.filter((c) => !unstagedIds.includes(c.id))
    const allDisplay = [...unstagedCards, ...orphans]

    if (autoSort && isHumanViewer && allDisplay.length >= 2) {
      return sortCardIdsByHand(allDisplay)
    }
    return allDisplay.map((c) => c.id)
  }, [handOrder, handForDisplay, stagedCardIds, autoSort, isHumanViewer])

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
  const showStageHint =
    isMyTurn &&
    game.turnPhase === 'play' &&
    needsStagedMeld &&
    stagedBooks.length === 0
  const showStagedBooks = stagedBooks.length > 0

  useEffect(() => {
    const html = document.documentElement
    const body = document.body
    html.dataset.gamePlaying = 'true'
    body.dataset.gamePlaying = 'true'
    return () => {
      delete html.dataset.gamePlaying
      delete body.dataset.gamePlaying
    }
  }, [])

  return (
    <div
      ref={shellRef}
      className="game-play-shell flex min-h-0 flex-col overflow-hidden"
    >
      {/* Slim top rail — scores & status only */}
      <header className="game-play-header relative z-20 shrink-0 px-3 py-2 sm:px-5">
        <div className="flex items-center justify-between gap-2 sm:gap-3">
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <h1 className="font-display text-sm font-semibold tracking-tight text-ink sm:text-lg">
                {mobileLayout ? 'H&F' : 'Hand & Foot'}
              </h1>
              <span className="font-sans text-[10px] tabular-nums text-ink-faint">
                R{game.roundNumber}
              </span>
            </div>
            {!compactHeader && (
              <p
                className={`mt-0.5 truncate text-[11px] ${
                  isMyTurn && !aiThinking ? 'text-accent' : 'text-ink-muted'
                }`}
              >
                {statusText}
              </p>
            )}
          </div>

          <div className="absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 md:block">
            <CurrentRoundTracker teams={game.teams} compact={compactHeader} />
          </div>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
            <MeldTracker teams={game.teams} compact={mobileLayout} />
          </div>
        </div>
        <div className={`mt-1 flex justify-center ${compactHeader ? 'md:hidden' : 'sm:hidden'}`}>
          <CurrentRoundTracker teams={game.teams} compact={compactHeader} />
        </div>
        {compactHeader && (
          <p
            className={`mt-0.5 truncate text-center text-[10px] ${
              isMyTurn && !aiThinking ? 'text-accent' : 'text-ink-muted'
            }`}
          >
            {statusText}
          </p>
        )}
      </header>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="relative min-h-0 flex-1">
          <RoundTable
            game={game}
            onDraw={handleDraw}
            canDraw={canDraw}
            mobile={mobileLayout}
            getCardMotion={getCardMotion}
            isCardInFlight={isCardInFlight}
            dirtyBookConsent={dirtyBookConsent}
          />
          <CardFlightLayer flights={flights} onSettle={handleSettleFlight} mobile={mobileLayout} />
        </div>

        {isHumanViewer && (
          <div
            className={`south-player-dock relative z-20 flex min-h-0 shrink-0 flex-col overflow-hidden ${
              mobileLayout ? 'south-player-dock-mobile' : ''
            }`}
            style={{
              background:
                'linear-gradient(to top, rgba(6,20,14,0.92) 0%, rgba(8,28,18,0.78) 70%, rgba(8,28,18,0.45) 100%)',
              boxShadow: `inset 0 1px 0 ${teamColor}33`,
            }}
          >
            <div className="south-dock-body flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className="south-dock-hand-meta flex shrink-0 items-center gap-x-2 gap-y-1 px-3 py-1 sm:gap-x-3 sm:px-4 sm:py-1.5">
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
                  {showStageHint && (
                    <p className="truncate text-center text-[10px] leading-snug text-accent/85 sm:text-[11px]">
                      Stage private melds · need{' '}
                      <span className="font-semibold tabular-nums text-accent">
                        {requiredMeld}+
                      </span>
                    </p>
                  )}
                  {showStagedBooks && (
                    <StagingArea
                      stagedBooks={stagedBooks}
                      requiredPoints={requiredMeld}
                      onRemove={handleRemoveStaged}
                      onClear={handleClearStaged}
                      onPutDown={
                        hasLeftoverStaging ? (id) => handlePutDownStaged(id) : undefined
                      }
                      resolveMode={hasLeftoverStaging}
                      canInteract={isMyTurn && game.turnPhase === 'play'}
                      compact
                      ribbon
                      embedded
                      mobile={mobileLayout}
                      getCardMotion={getCardMotion}
                      isCardHidden={isCardInFlight}
                    />
                  )}
                </div>
              </div>

              <div
                className={`south-dock-hand-scroll theme-scroll relative min-h-0 px-2 py-0.5 sm:px-4 sm:py-1 ${
                  mobileLayout
                    ? 'south-dock-hand-scroll-mobile shrink-0 overflow-visible'
                    : 'flex-1 overflow-hidden'
                }`}
                data-flight-anchor="hand"
              >
                <HandCards
                  hand={handForDisplay}
                  handOrder={displayHandOrder}
                  onReorder={handleHandReorder}
                  selectedIds={selectedIds}
                  onToggle={toggleCard}
                  onSelectRank={selectAllOfRank}
                  canSelect={isMyTurn && game.turnPhase === 'play'}
                  canDrag
                  spread
                  mobile={mobileLayout}
                  getCardMotion={getCardMotion}
                  onPlaceMotion={(cardId) => markMotion([cardId], 'place')}
                  isCardHidden={isCardInFlight}
                />
              </div>

              {!autoSort && (
                <div className="south-dock-sort flex shrink-0 justify-center px-3 py-0.5 sm:px-4 sm:py-1">
                  <button
                    type="button"
                    onClick={handleAutoSort}
                    disabled={viewer.hand.length < 2}
                    className="rounded-md border border-white/20 bg-white/10 px-3 py-1.5 text-[11px] font-semibold tracking-wide text-ink-soft shadow-sm transition hover:border-white/30 hover:bg-white/18 hover:text-ink active:translate-y-px disabled:opacity-30"
                  >
                    Sort
                  </button>
                </div>
              )}

              <GameMessageBar
                error={error}
                hint={playerHint}
                discardWarning={!error ? discardWarning : null}
                onDismissDiscardWarning={() => setDiscardWarning(null)}
                onConfirmDiscard={handleConfirmDiscard}
              />

              <div className="south-dock-bottom-bar shrink-0">
                {!mobileLayout && (
                  <div className="south-dock-bottom-side">
                    <GameChat
                      game={game}
                      viewerSeat={viewerSeat}
                      messages={chatMessages}
                      onSend={onChatSend}
                      dockInline
                      compact={shellLayout === 'tight'}
                    />
                  </div>
                )}

                <div
                  className="game-action-slot flex min-w-0 flex-1 flex-nowrap items-center justify-center gap-1 overflow-x-auto px-1 py-1 sm:gap-2 sm:py-1.5"
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
                                    footMeldBlocked ||
                                    (matchingStagedBook
                                      ? selectedIds.length === 0
                                      : selectedIds.length < 3)
                                  }
                                  className="btn-secondary disabled:opacity-35"
                                >
                                  {matchingStagedBook
                                    ? `Add to staged ${matchingStagedBook.rank}s`
                                    : 'Stage'}
                                </button>
                                <button
                                  onClick={handleMeld}
                                  disabled={
                                    stagedBooks.length === 0 ||
                                    stagedPoints < requiredMeld ||
                                    footMeldBlocked
                                  }
                                  className="btn-primary disabled:opacity-35"
                                >
                                  {mobileLayout
                                    ? `${stagedPoints}/${requiredMeld}`
                                    : `Meld ${stagedPoints}/${requiredMeld}`}
                                </button>
                              </>
                            )
                          ) : (
                            !mustDiscardLastFoot && (
                              <>
                                {hasLeftoverStaging && (
                                  <button
                                    onClick={() => handlePutDownStaged()}
                                    disabled={footMeldBlocked}
                                    className="btn-primary disabled:opacity-35"
                                  >
                                    {mobileLayout ? 'Put down' : 'Put down staged'}
                                  </button>
                                )}
                                <button
                                  onClick={handleStartBook}
                                  disabled={
                                    selectedIds.length < 3 || footMeldBlocked
                                  }
                                  className="btn-secondary disabled:opacity-35"
                                >
                                  Start book
                                </button>
                              </>
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
                                  className="field-control field-control--compact max-w-[9rem] sm:max-w-[11rem]"
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
                                        {book.rank}s · {book.cards.length}
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
                                  footMeldBlocked
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
                              {mobileLayout ? 'Skip' : 'Skip & run'}
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
                                ? mobileLayout
                                  ? 'Out'
                                  : 'Go out'
                                : lastFootCard
                                  ? mobileLayout
                                    ? 'Out'
                                    : 'Discard to go out'
                                  : goToFootDiscard
                                    ? mobileLayout
                                      ? 'Foot'
                                      : 'Go to foot'
                                    : 'Discard'}
                            </button>
                          )}
                        </>
                      )}
                    </>
                  )}
                </div>

                {!mobileLayout && (
                  <div className="south-dock-bottom-side south-dock-bottom-side-right">
                    <GameSettingsPanel
                      game={game}
                      open={settingsOpen}
                      onToggle={() => setSettingsOpen((open) => !open)}
                      onClose={() => setSettingsOpen(false)}
                      onShowInstructions={onShowInstructions ?? (() => {})}
                      startOverVotes={startOverVotes}
                      onStartOverVote={onStartOverVote ?? (() => {})}
                      canRequestUndo={canRequestUndo}
                      undoPending={undoPending}
                      onRequestUndo={onRequestUndo ?? (() => {})}
                      autoSort={autoSort}
                      onAutoSortChange={onAutoSortChange ?? (() => {})}
                      aiDebugEnabled={aiDebugEnabled}
                      onAiDebugChange={onAiDebugChange ?? (() => {})}
                      partnerVoiceSettings={partnerVoiceSettings}
                      onPartnerVoiceChange={onPartnerVoiceChange}
                      dockInline
                      compact={shellLayout === 'tight'}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {mobileLayout && isHumanViewer && (
          <>
            <GameChat
              game={game}
              viewerSeat={viewerSeat}
              messages={chatMessages}
              onSend={onChatSend}
              compact
            />
            <GameSettingsPanel
              game={game}
              open={settingsOpen}
              onToggle={() => setSettingsOpen((open) => !open)}
              onClose={() => setSettingsOpen(false)}
              onShowInstructions={onShowInstructions ?? (() => {})}
              startOverVotes={startOverVotes}
              onStartOverVote={onStartOverVote ?? (() => {})}
              canRequestUndo={canRequestUndo}
              undoPending={undoPending}
              onRequestUndo={onRequestUndo ?? (() => {})}
              autoSort={autoSort}
              onAutoSortChange={onAutoSortChange ?? (() => {})}
              aiDebugEnabled={aiDebugEnabled}
              onAiDebugChange={onAiDebugChange ?? (() => {})}
              partnerVoiceSettings={partnerVoiceSettings}
              onPartnerVoiceChange={onPartnerVoiceChange}
              compact
            />
          </>
        )}

        {isHumanViewer && (
          <PartnerVoiceOverlay
            game={game}
            viewerSeat={viewerSeat}
            messages={chatMessages}
            onSend={onChatSend}
          />
        )}

        <AiDebugPanel
          game={game}
          chatMessages={chatMessages}
          enabled={aiDebugEnabled}
          aiThinking={aiThinking}
          currentSeat={game.currentPlayerIndex}
          lastTraces={aiDebugTraces}
        />

        {!isHumanViewer && (
          <p className="shrink-0 py-3 text-center text-xs text-ink-faint">Spectating</p>
        )}
      </div>
    </div>
  )
}
