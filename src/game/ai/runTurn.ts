import {
  addToBook,
  canPlayerGoOut,
  canTeamGoOut,
  commitStagedMelds,
  discardCard,
  drawCards,
  getCurrentPlayer,
  getTeam,
  isLastFootCard,
  passTurnKeepingLastFootCard,
  startBook,
} from '../actions'
import type { GameState } from '../deal'
import type { ChatMessage } from '../chat'
import type { Card } from '../cards'
import { cardLabel, isWildCard } from '../cards'
import {
  bookWildCount,
  countWildsInCards,
  wouldDestroyOnlyCompletedCleanBook,
  type Book,
} from '../books'
import {
  awaitingPartnerGoOutResponse,
  awaitingPartnerWildResponse,
  createReadyGoOutSignal,
  deniedWildBookIds,
  hasPartnerGoOutApproval,
  hasPartnerWildApprovalForBook,
  partnerAdvisedAgainstGoOut,
  partnerDeniedLatestWildAsk,
  wasPartnerWildDeniedForBook,
} from '../chat'
import { partnerSeat, type PlayerCount } from '../teams'
import { findAddToBookActions } from './decisions'
import { AiDebugCollector } from './debugTrace'
import { buildAiPublicState } from './publicState'
import {
  maybeAiChatSignal,
  maybeAiWildRequest,
  needsHumanWildConsent,
  shouldAskBeforeWildAdd,
} from './chatSignals'
import {
  initialMeldUrgency,
  meldPressure,
  pickBestAddToBook,
  pickBestStartWhenUnlocked,
  pickDiscardCard,
  pickLoneWildAdd,
  pickWildStartBook,
  planInitialMeld,
  shouldRandomlySkipMeld,
} from './strategy'

export interface AiTurnResult {
  state: GameState
  chatMessage?: ChatMessage
  /** Pause mid-turn until the human partner answers yes/no. */
  awaitingPartner?: boolean
  debugTrace?: AiDebugCollector['trace']
}

export interface AiTurnOptions {
  debug?: AiDebugCollector
}

function labelCards(hand: Card[], ids: string[]): string {
  return ids
    .map((id) => {
      const card = hand.find((c) => c.id === id)
      return card ? cardLabel(card) : id
    })
    .join(' ')
}

/**
 * When pausing for a wild Yes/No, strip any wilds placed during this AI turn so
 * the board does not show a wild already down while the prompt is up.
 * Natural adds and non-wild new books are kept; wild cards return to the AI hand.
 */
export function stripWildAddsSince(
  before: GameState,
  after: GameState,
  seatIndex: number,
): GameState {
  const teamId = after.players[seatIndex]?.profile.teamId
  if (teamId === undefined) return after

  const beforeTeam = getTeam(before, teamId)
  const afterTeam = getTeam(after, teamId)
  const beforeBooks = new Map(beforeTeam.books.map((b) => [b.id, b]))
  const returnedToHand: Card[] = []
  const nextBooks: Book[] = []

  for (const book of afterTeam.books) {
    const prior = beforeBooks.get(book.id)
    if (!prior) {
      const wilds = book.cards.filter(isWildCard)
      const naturals = book.cards.filter((c) => !isWildCard(c))
      if (wilds.length === 0) {
        nextBooks.push(book)
        continue
      }
      returnedToHand.push(...wilds)
      if (naturals.length >= 3) {
        nextBooks.push({ ...book, cards: naturals })
      } else {
        returnedToHand.push(...naturals)
      }
      continue
    }

    const priorIds = new Set(prior.cards.map((c) => c.id))
    const kept: Card[] = []
    for (const card of book.cards) {
      if (priorIds.has(card.id)) {
        kept.push(card)
        continue
      }
      if (isWildCard(card)) {
        returnedToHand.push(card)
        continue
      }
      kept.push(card)
    }
    nextBooks.push({ ...book, cards: kept })
  }

  if (returnedToHand.length === 0) return after

  const player = after.players[seatIndex]!

  return {
    ...after,
    players: after.players.map((p, i) =>
      i === seatIndex
        ? { ...player, hand: [...player.hand, ...returnedToHand] }
        : p,
    ),
    teams: after.teams.map((t) =>
      t.id === teamId
        ? {
            ...t,
            books: nextBooks,
            meldThresholdMet: beforeTeam.meldThresholdMet || t.meldThresholdMet,
          }
        : t,
    ),
    booksWithWildAddedThisTurn: after.booksWithWildAddedThisTurn.filter((id) => {
      const book = nextBooks.find((b) => b.id === id)
      const prior = beforeBooks.get(id)
      if (!book || !prior) return false
      return bookWildCount(book) > bookWildCount(prior)
    }),
  }
}

export function runAiTurn(
  state: GameState,
  chatMessages: ChatMessage[] = [],
  options?: AiTurnOptions,
): AiTurnResult {
  const player = getCurrentPlayer(state)
  if (player.profile.isHuman) return { state }

  const difficulty = player.profile.aiDifficulty ?? 'normal'
  const debug = options?.debug
  const seatIndex = state.currentPlayerIndex
  const playerCount = state.playerCount as PlayerCount
  const partnerIdx = partnerSeat(seatIndex, playerCount)
  const partnerIsHuman = state.players[partnerIdx]?.profile.isHuman === true
  let current = state
  let chatMessage: ChatMessage | undefined
  let messages = chatMessages

  if (current.turnPhase === 'draw') {
    debug?.step('draw', 'Drawing 2 from stock.')
    current = drawCards(current)
  }

  if (current.phase !== 'playing') {
    return { state: current, chatMessage, debugTrace: debug?.trace }
  }

  /* Still waiting on a prior wild ask — do not advance the turn. */
  if (partnerIsHuman && awaitingPartnerWildResponse(messages, seatIndex, partnerIdx)) {
    debug?.step('chat', 'Waiting for partner wild yes/no.')
    return {
      state: current,
      awaitingPartner: true,
      debugTrace: debug?.trace,
    }
  }

  const deniedWildBooks = partnerIsHuman
    ? deniedWildBookIds(messages, seatIndex, partnerIdx)
    : new Set<string>()
  /*
   * Mid-turn resume after No: stop asking about other books this turn.
   * New turns start in `draw`, so the AI can ask again next turn (except
   * books already denied, which stay blocked).
   */
  const stopFurtherWildAsks =
    partnerIsHuman &&
    state.turnPhase === 'play' &&
    partnerDeniedLatestWildAsk(messages, seatIndex, partnerIdx)

  /* Snapshot after draw — wilds placed later this turn are stripped if we pause to ask. */
  const baselineForWildAsk = current

  const maxPlays = difficulty === 'expert' ? 14 : 10
  debug?.step(
    'turn',
    `${player.profile.name} (${difficulty}) · hand ${player.hand.length} · max ${maxPlays} meld plays`,
  )

  for (let i = 0; i < maxPlays; i++) {
    if (current.turnPhase !== 'play') break
    if (canPlayerGoOut(current, messages)) break

    const pub = buildAiPublicState(current, current.currentPlayerIndex)
    const team = getTeam(current, pub.myTeamId)
    const urgency = meldPressure(pub)
    const addAttempts = urgency === 'high' ? 4 : urgency === 'medium' ? 3 : 2
    if (
      pub.isPlayingFoot &&
      pub.myHand.length === 1 &&
      canTeamGoOut(team.books, team.meldThresholdMet)
    ) {
      debug?.step('meld', 'Foot has 1 card and team can go out — skipping meld to discard.')
      break
    }

    let played = false

    if (!pub.teamMeldThresholdMet) {
      const required = Math.max(0, pub.requiredMeld - pub.meldPointsThisTurn)
      const openUrgency = initialMeldUrgency(pub.requiredMeld, urgency)
      debug?.step(
        'initial',
        `Need ${required} pts (urgency ${openUrgency}, meld pressure ${urgency}).`,
      )
      let plan = planInitialMeld(
        pub.myHand,
        pub.myTeamBooks,
        required,
        openUrgency,
        difficulty,
        pub.isPlayingFoot,
      )
      if (!plan && openUrgency !== 'high') {
        debug?.step('initial', 'No plan at current urgency — retrying at high.')
        plan = planInitialMeld(
          pub.myHand,
          pub.myTeamBooks,
          required,
          'high',
          difficulty,
          pub.isPlayingFoot,
        )
      }

      if (plan && plan.length > 0) {
        debug?.step(
          'initial',
          `Committing ${plan.length} book(s): ${plan.map((book) => labelCards(pub.myHand, book)).join(' | ')}`,
        )
        const result = commitStagedMelds(current, plan)
        if (!result.error) {
          current = result.state
          played = true
        } else {
          debug?.step('initial', `Commit failed: ${result.error}`)
        }
      } else {
        debug?.step('initial', 'No initial meld plan — stopping meld loop.')
      }
    } else {
      const addActions = findAddToBookActions(
        pub.myHand,
        pub.myTeamBooks,
        pub.isPlayingFoot,
        current.booksWithWildAddedThisTurn,
        team.meldThresholdMet,
      ).filter((a) => {
        if (!deniedWildBooks.has(a.bookId)) return true
        /* Denial blocks wilds only — naturals onto that book are fine. */
        const cards = pub.myHand.filter((c) => a.cardIds.includes(c.id))
        return countWildsInCards(cards) === 0
      })
      debug?.step('add', `${addActions.length} add action(s) available.`)
      const triedAdds = new Set<string>()

      for (let attempt = 0; attempt < addAttempts && !played; attempt++) {
        const remaining = addActions.filter(
          (a) => !triedAdds.has(`${a.bookId}:${a.cardIds.join(',')}`),
        )
        const bestAdd = pickBestAddToBook(
          remaining,
          pub,
          current.booksWithWildAddedThisTurn,
          difficulty,
          messages,
          current,
        )
        if (!bestAdd) {
          debug?.step('add', 'No scored add action left.')
          break
        }

        triedAdds.add(`${bestAdd.bookId}:${bestAdd.cardIds.join(',')}`)
        if (shouldRandomlySkipMeld(difficulty, urgency, 'add', pub.teamMeldThresholdMet)) {
          debug?.step(
            'add',
            `Random skip (normal): ${labelCards(pub.myHand, bestAdd.cardIds)}`,
          )
          continue
        }

        const book = pub.myTeamBooks.find((b) => b.id === bestAdd.bookId)
        if (!book) continue

        const addCards = pub.myHand.filter((c) => bestAdd.cardIds.includes(c.id))
        const addHasWilds = countWildsInCards(addCards) > 0
        if (
          partnerIsHuman &&
          addHasWilds &&
          wasPartnerWildDeniedForBook(messages, seatIndex, partnerIdx, book.id)
        ) {
          debug?.step('add', `Skip wild on ${book.rank}s — partner already said no.`)
          continue
        }

        /*
         * With a human partner, do not place wilds on already-dirty books in the
         * same meld pass where we might pause to ask about dirtying a clean book.
         * Dirty-book wilds still happen later via the lone-wild step after consent.
         */
        if (
          partnerIsHuman &&
          addHasWilds &&
          !needsHumanWildConsent(book, addCards, partnerIdx)
        ) {
          debug?.step(
            'add',
            `Defer dirty-book wild on ${book.rank}s until after consent checks.`,
          )
          continue
        }

        if (
          partnerIsHuman &&
          shouldAskBeforeWildAdd(
            current,
            seatIndex,
            messages,
            book,
            bestAdd.cardIds,
            pub.myHand,
          )
        ) {
          if (
            hasPartnerWildApprovalForBook(messages, seatIndex, partnerIdx, book.id)
          ) {
            /* Approved — fall through and play. */
          } else if (stopFurtherWildAsks) {
            debug?.step(
              'add',
              `Skip wild ask on ${book.rank}s — partner said no earlier this turn.`,
            )
            continue
          } else {
            const wildReq = maybeAiWildRequest(
              current,
              seatIndex,
              messages,
              book.rank,
              book.id,
            )
            if (wildReq) {
              debug?.step(
                'chat',
                `Asking partner before wild on ${book.rank}s (${labelCards(pub.myHand, bestAdd.cardIds)}).`,
              )
              /* Wild stays in hand / off the book until Yes — also strip any other
               * wilds placed earlier this turn so the prompt is not shown next to
               * a board that already looks dirtied. */
              return {
                state: stripWildAddsSince(baselineForWildAsk, current, seatIndex),
                chatMessage: wildReq,
                awaitingPartner: true,
                debugTrace: debug?.trace,
              }
            }
            if (awaitingPartnerWildResponse(messages, seatIndex, partnerIdx)) {
              return {
                state: current,
                awaitingPartner: true,
                debugTrace: debug?.trace,
              }
            }
            /* Denied or unable to ask — skip this add. */
            continue
          }
        }

        /*
         * Hard stop: never dirty a clean book without an explicit Yes.
         * Covers any hole where shouldAskBeforeWildAdd returned false incorrectly.
         */
        if (
          partnerIsHuman &&
          needsHumanWildConsent(book, addCards, partnerIdx) &&
          !hasPartnerWildApprovalForBook(messages, seatIndex, partnerIdx, book.id)
        ) {
          debug?.step(
            'add',
            `Blocked wild on ${book.rank}s — no partner Yes yet.`,
          )
          continue
        }

        /*
         * Never destroy the only completed clean book — that removes go-out
         * eligibility (need 1 clean + 1 dirty completed). Partner Yes cannot
         * override this; dump wilds elsewhere or discard instead.
         */
        if (
          wouldDestroyOnlyCompletedCleanBook(book, addCards, pub.myTeamBooks)
        ) {
          debug?.step(
            'add',
            `Skip wild on ${book.rank}s — only completed clean book.`,
          )
          continue
        }

        debug?.step(
          'add',
          `Adding to ${book.rank} book: ${labelCards(pub.myHand, bestAdd.cardIds)}`,
        )
        const result = addToBook(current, bestAdd.bookId, bestAdd.cardIds)
        if (!result.error) {
          current = result.state
          played = true
        } else {
          debug?.step('add', `Add failed: ${result.error}`)
        }
      }

      if (!played) {
        const refreshed = buildAiPublicState(current, current.currentPlayerIndex)
        const startIds = pickBestStartWhenUnlocked(
          refreshed.myHand,
          refreshed.myTeamBooks,
          urgency,
          difficulty,
          refreshed.isPlayingFoot,
        )
        if (startIds) {
          debug?.step('start', `Starting book: ${labelCards(refreshed.myHand, startIds)}`)
          const result = startBook(current, startIds)
          if (!result.error) {
            current = result.state
            played = true
          } else {
            debug?.step('start', `Start failed: ${result.error}`)
          }
        } else {
          debug?.step('start', 'No new book to start.')
        }
      }
    }

    if (!played) {
      debug?.step('meld', 'Nothing played this iteration — ending meld loop.')
      break
    }

    if (shouldRandomlySkipMeld(difficulty, urgency, 'endTurn', pub.teamMeldThresholdMet)) {
      debug?.step('meld', 'Random end-turn skip (normal mode).')
      break
    }
  }

  if (current.turnPhase === 'play') {
    const currentPlayer = getCurrentPlayer(current)
    const team = getTeam(current, currentPlayer.profile.teamId)
    const lastFoot =
      isLastFootCard(currentPlayer) &&
      canTeamGoOut(team.books, team.meldThresholdMet)

    /* Ask human partner before going out — pause until yes/no. */
    if (partnerIsHuman && lastFoot) {
      if (awaitingPartnerGoOutResponse(messages, seatIndex, partnerIdx)) {
        debug?.step('chat', 'Waiting for partner go-out yes/no.')
        return {
          state: current,
          awaitingPartner: true,
          debugTrace: debug?.trace,
        }
      }

      if (!hasPartnerGoOutApproval(current, seatIndex, messages)) {
        if (partnerAdvisedAgainstGoOut(messages, seatIndex, playerCount)) {
          debug?.step('discard', 'Partner said no to go-out — holding last card.')
          const pass = passTurnKeepingLastFootCard(current)
          return {
            state: pass.error ? current : pass.state,
            debugTrace: debug?.trace,
          }
        }

        const signal = createReadyGoOutSignal(
          seatIndex,
          currentPlayer.profile.name,
          currentPlayer.profile.avatar,
        )
        debug?.step('chat', 'Asking partner before going out.')
        return {
          state: current,
          chatMessage: signal,
          awaitingPartner: true,
          debugTrace: debug?.trace,
        }
      }
    }

    /* Rival AI partners still broadcast early go-out intent; human partners are asked on last card above. */
    const goOutSignal = maybeAiChatSignal(current, current.currentPlayerIndex, messages)
    if (goOutSignal && !chatMessage && !partnerIsHuman) {
      debug?.step('chat', 'Signaling ready to go out.')
      chatMessage = goOutSignal
      messages = [...messages, goOutSignal]
    }

    const pub = buildAiPublicState(current, current.currentPlayerIndex)
    let goingOut = canPlayerGoOut(current, messages)
    if (goingOut) debug?.step('discard', 'Can go out this turn.')

    const loneWild = pickLoneWildAdd(
      pub.myHand,
      pub.myTeamBooks.filter((b) => !deniedWildBooks.has(b.id)),
      current.booksWithWildAddedThisTurn,
    )
    if (loneWild && !goingOut) {
      const book = getTeam(current, currentPlayer.profile.teamId).books.find(
        (b) => b.id === loneWild.bookId,
      )
      if (book && partnerIsHuman) {
        const cards = pub.myHand.filter((c) => c.id === loneWild.cardId)
        if (
          wasPartnerWildDeniedForBook(messages, seatIndex, partnerIdx, book.id)
        ) {
          debug?.step('wild', `Skip lone wild on ${book.rank}s — partner said no.`)
        } else if (needsHumanWildConsent(book, cards, partnerIdx)) {
          if (hasPartnerWildApprovalForBook(messages, seatIndex, partnerIdx, book.id)) {
            debug?.step('wild', `Adding wild to ${book.rank}s (partner approved).`)
            const wildResult = addToBook(current, loneWild.bookId, [loneWild.cardId])
            if (!wildResult.error) current = wildResult.state
          } else if (stopFurtherWildAsks) {
            debug?.step(
              'wild',
              `Skip lone wild ask on ${book.rank}s — partner said no earlier this turn.`,
            )
          } else {
            const wildReq = maybeAiWildRequest(
              current,
              seatIndex,
              messages,
              book.rank,
              book.id,
            )
            if (wildReq) {
              debug?.step('chat', 'Asking partner before lone wild add.')
              return {
                state: stripWildAddsSince(baselineForWildAsk, current, seatIndex),
                chatMessage: wildReq,
                awaitingPartner: true,
                debugTrace: debug?.trace,
              }
            }
          }
        } else {
          debug?.step('wild', `Adding lone wild to book ${loneWild.bookId.slice(0, 8)}…`)
          const wildResult = addToBook(current, loneWild.bookId, [loneWild.cardId])
          if (!wildResult.error) current = wildResult.state
        }
      } else {
        debug?.step('wild', `Adding lone wild to book ${loneWild.bookId.slice(0, 8)}…`)
        const wildResult = addToBook(current, loneWild.bookId, [loneWild.cardId])
        if (!wildResult.error) current = wildResult.state
      }
    } else if (!goingOut) {
      const refreshed = buildAiPublicState(current, current.currentPlayerIndex)
      if (refreshed.teamMeldThresholdMet) {
        const wildStart = pickWildStartBook(
          refreshed.myHand,
          refreshed.myTeamBooks,
          refreshed.isPlayingFoot,
        )
        if (wildStart) {
          debug?.step(
            'wild',
            `Starting book with wild: ${wildStart
              .map((id) => {
                const card = refreshed.myHand.find((c) => c.id === id)
                return card ? cardLabel(card) : id
              })
              .join(' ')}`,
          )
          const startResult = startBook(current, wildStart)
          if (!startResult.error) {
            current = startResult.state
          }
        }
      }
    }

    /* Re-check go-out after possible wild play. */
    goingOut = canPlayerGoOut(current, messages)
    const endPlayer = getCurrentPlayer(current)
    const endTeam = getTeam(current, endPlayer.profile.teamId)
    const endCanTeamGoOut = canTeamGoOut(endTeam.books, endTeam.meldThresholdMet)

    if (
      partnerIsHuman &&
      isLastFootCard(endPlayer) &&
      endCanTeamGoOut &&
      !goingOut &&
      partnerAdvisedAgainstGoOut(messages, seatIndex, playerCount)
    ) {
      debug?.step('discard', 'Partner denied go-out — ending turn with last card.')
      const pass = passTurnKeepingLastFootCard(current)
      return {
        state: pass.error ? current : pass.state,
        chatMessage,
        debugTrace: debug?.trace,
      }
    }

    /*
     * Last foot card but books no longer qualify (e.g. only clean was dirtied
     * earlier) — pass instead of soft-locking on a failed go-out discard.
     */
    if (isLastFootCard(endPlayer) && !endCanTeamGoOut) {
      debug?.step(
        'discard',
        'Cannot go out — missing clean/dirty books; holding last card.',
      )
      const pass = passTurnKeepingLastFootCard(current)
      return {
        state: pass.error ? current : pass.state,
        chatMessage,
        debugTrace: debug?.trace,
      }
    }

    const discardPub = buildAiPublicState(current, current.currentPlayerIndex)
    const discardId = pickDiscardCard(
      discardPub.myHand,
      discardPub.myTeamBooks,
      difficulty,
      goingOut,
    )
    const cardToDiscard = discardPub.myHand.find((c) => c.id === discardId)
    debug?.step(
      'discard',
      cardToDiscard ? `Discarding ${cardLabel(cardToDiscard)}` : `Discarding ${discardId}`,
    )
    const result = discardCard(current, discardId, messages)
    if (!result.error) {
      current = result.state
    } else {
      debug?.step('discard', `Discard failed: ${result.error}`)
      if (isLastFootCard(getCurrentPlayer(current))) {
        const pass = passTurnKeepingLastFootCard(current)
        if (!pass.error) current = pass.state
      }
    }
  }

  return { state: current, chatMessage, debugTrace: debug?.trace }
}

export function isAiPlayer(state: GameState): boolean {
  return !getCurrentPlayer(state).profile.isHuman
}
