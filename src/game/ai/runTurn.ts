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
import { cardLabel, isRedThree, isWildCard } from '../cards'
import {
  bookWildCount,
  canAddToBook,
  countWildsInCards,
  isCleanBook,
  wouldDestroyOnlyCompletedCleanBook,
  type Book,
} from '../books'
import {
  awaitingPartnerGoOutResponse,
  awaitingPartnerWildResponse,
  createReadyGoOutSignal,
  deniedWildBookIds,
  hasExplicitGoOutApproval,
  hasPartnerWildApprovalForBook,
  partnerAdvisedAgainstGoOut,
  partnerDeniedLatestWildAsk,
  shouldAiAttemptGoOut,
  wasPartnerWildDeniedForBook,
} from '../chat'
import { partnerSeat, type PlayerCount } from '../teams'
import {
  findAddToBookActions,
  canMeldDownToLastCard,
  pickNextMeldDownToLastCard,
} from './decisions'
import { AiDebugCollector } from './debugTrace'
import { buildAiPublicState } from './publicState'
import {
  maybeAiChatSignal,
  maybeAiWildRequest,
  needsHumanWildConsent,
  shouldAskBeforeWildAdd,
} from './chatSignals'
import {
  aiMeldPlayBudget,
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
 * After a human Yes, place the consented wild on that clean book before any other
 * meld or follow-up wild ask. Approved wilds become part of the strip baseline so
 * a later ask about another book does not yank them back off.
 */
function fulfillPartnerApprovedWildAdds(
  state: GameState,
  seatIndex: number,
  messages: ChatMessage[],
  partnerIdx: number,
  debug?: AiDebugCollector,
): GameState {
  let current = state
  const teamId = current.players[seatIndex].profile.teamId
  const approvedBookIds = getTeam(current, teamId)
    .books.filter(
      (book) =>
        isCleanBook(book) &&
        hasPartnerWildApprovalForBook(messages, seatIndex, partnerIdx, book.id),
    )
    .map((book) => book.id)

  for (const bookId of approvedBookIds) {
    const team = getTeam(current, teamId)
    const book = team.books.find((b) => b.id === bookId)
    if (!book || !isCleanBook(book)) continue
    if (current.booksWithWildAddedThisTurn.includes(book.id)) continue

    const hand = current.players[seatIndex].hand
    const wilds = hand
      .filter((c) => isWildCard(c) && !isRedThree(c))
      .sort((a, b) => {
        if (a.rank === 'Joker' && b.rank !== 'Joker') return -1
        if (b.rank === 'Joker' && a.rank !== 'Joker') return 1
        return 0
      })

    for (const wild of wilds) {
      if (wouldDestroyOnlyCompletedCleanBook(book, [wild], team.books)) continue
      const check = canAddToBook(book, [wild], {
        wildAlreadyAddedThisTurn: false,
      })
      if (!check.ok) continue
      const result = addToBook(current, book.id, [wild.id])
      if (!result.error) {
        debug?.step(
          'wild',
          `Placing approved wild on ${book.rank}s immediately (${cardLabel(wild)}).`,
        )
        current = result.state
      }
      break
    }
  }

  return current
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

/**
 * Ask the human partner while 2+ foot cards remain and a Yes could finish go-out
 * this turn. Never ask on the last card alone — discard would force go-out anyway.
 */
function shouldAskHumanPartnerBeforeGoOut(
  state: GameState,
  seatIndex: number,
  messages: ChatMessage[],
  turnStartedFromDraw: boolean,
): boolean {
  const player = state.players[seatIndex]
  const playerCount = state.playerCount as PlayerCount
  const partnerIdx = partnerSeat(seatIndex, playerCount)

  if (!player.isPlayingFoot || player.foot.length > 0 || player.footOnHold) return false
  if (player.hand.length < 2) return false

  const team = getTeam(state, player.profile.teamId)
  if (!canTeamGoOut(team.books, team.meldThresholdMet)) return false

  if (awaitingPartnerGoOutResponse(messages, seatIndex, partnerIdx)) return false
  if (
    !turnStartedFromDraw &&
    hasExplicitGoOutApproval(messages, seatIndex, playerCount)
  ) {
    return false
  }
  if (partnerAdvisedAgainstGoOut(messages, seatIndex, playerCount)) return false

  return canMeldDownToLastCard(
    player.hand,
    team.books,
    state.booksWithWildAddedThisTurn,
    team.meldThresholdMet,
  )
}

function pauseForPartnerGoOutAsk(
  state: GameState,
  seatIndex: number,
  debug?: AiDebugCollector,
): AiTurnResult {
  const player = state.players[seatIndex]
  const signal = createReadyGoOutSignal(
    seatIndex,
    player.profile.name,
    player.profile.avatar,
  )
  debug?.step('chat', 'Asking partner before closing foot (2+ cards remain).')
  return {
    state,
    chatMessage: signal,
    awaitingPartner: true,
    debugTrace: debug?.trace,
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
  const turnEnteredInPlayPhase = state.turnPhase === 'play'
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

  /*
   * Yes resume: put the consented wild down immediately, before other melds or
   * another wild ask. Then snapshot baseline so stripWildAddsSince keeps it.
   */
  if (partnerIsHuman && current.turnPhase === 'play') {
    current = fulfillPartnerApprovedWildAdds(
      current,
      seatIndex,
      messages,
      partnerIdx,
      debug,
    )
  }

  const turnStartedFromDraw = state.turnPhase === 'draw'

  /* Snapshot after draw (+ fulfilled Yes wilds) — later wilds strip if we pause to ask. */
  const baselineForWildAsk = current

  /*
   * Stay paused while the human answers a go-out Yes/No. The ask happens while
   * 2+ foot cards remain so No still leaves meaningful plays this turn.
   */
  if (partnerIsHuman && current.turnPhase === 'play') {
    if (awaitingPartnerGoOutResponse(messages, seatIndex, partnerIdx)) {
      debug?.step('chat', 'Waiting for partner go-out yes/no.')
      return {
        state: current,
        awaitingPartner: true,
        debugTrace: debug?.trace,
      }
    }
  }

  if (
    partnerIsHuman &&
    current.turnPhase === 'play' &&
    shouldAskHumanPartnerBeforeGoOut(current, seatIndex, messages, turnStartedFromDraw)
  ) {
    return pauseForPartnerGoOutAsk(current, seatIndex, debug)
  }

  /*
   * Budget must cover emptying the hand into foot (skip-and-run) and then
   * playing the foot in the same turn. A fixed 10/14 cap left playable foot
   * cards stranded until the next turn.
   */
  let maxPlays = aiMeldPlayBudget(
    player.hand.length,
    player.foot.length,
    player.isPlayingFoot,
  )
  debug?.step(
    'turn',
    `${player.profile.name} (${difficulty}) · hand ${player.hand.length} · max ${maxPlays} meld plays`,
  )

  /*
   * Mid-turn Yes resume only — a Yes from an earlier turn is stale and must be
   * re-asked. Standing "You should go out!" without a Yes-to-this-ask does not set this.
   */
  const goOutClearedThisResume =
    partnerIsHuman &&
    state.turnPhase === 'play' &&
    hasExplicitGoOutApproval(messages, seatIndex, playerCount)

  for (let i = 0; i < maxPlays; i++) {
    if (current.turnPhase !== 'play') break
    if (canPlayerGoOut(current, messages)) break

    if (
      partnerIsHuman &&
      shouldAskHumanPartnerBeforeGoOut(current, seatIndex, messages, turnStartedFromDraw)
    ) {
      return pauseForPartnerGoOutAsk(current, seatIndex, debug)
    }

    const pub = buildAiPublicState(current, current.currentPlayerIndex)
    const team = getTeam(current, pub.myTeamId)
    const urgency = meldPressure(pub)
    const addAttempts = urgency === 'high' ? 4 : urgency === 'medium' ? 3 : 2
    const teamReady = canTeamGoOut(team.books, team.meldThresholdMet)
    /*
     * Skip-and-run can inject a full foot mid-loop. Top up the remaining budget
     * so those new cards are not stuck behind the pre-foot play count.
     */
    if (pub.isPlayingFoot) {
      const needed = aiMeldPlayBudget(pub.myHand.length, 0, true)
      if (i + needed > maxPlays) {
        maxPlays = i + needed
      }
    }
    /*
     * Leave the last foot card for discard / go-out ask. Keep melding every
     * other playable card — do not sandbag extras while waiting on partner.
     */
    if (pub.isPlayingFoot && teamReady && pub.myHand.length === 1) {
      debug?.step(
        'meld',
        'Foot has 1 card and team can go out — skipping meld to discard.',
      )
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
      /*
       * In the foot, start stranded new books while a discard cushion remains.
       * Otherwise adds burn every spare card first and a 3-of-a-kind gets stuck
       * with nothing left to discard (illegal to meld the whole hand).
       */
      if (pub.isPlayingFoot && pub.myHand.length >= 4) {
        const footStartIds = pickBestStartWhenUnlocked(
          pub.myHand,
          pub.myTeamBooks,
          urgency,
          difficulty,
          true,
        )
        if (
          footStartIds &&
          pub.myHand.length - footStartIds.length >= 1
        ) {
          debug?.step(
            'start',
            `Starting book (foot): ${labelCards(pub.myHand, footStartIds)}`,
          )
          const result = startBook(current, footStartIds)
          if (!result.error) {
            current = result.state
            played = true
          } else {
            debug?.step('start', `Start failed: ${result.error}`)
          }
        }
      }

      if (!played) {
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
          if (
            shouldRandomlySkipMeld(
              difficulty,
              urgency,
              'add',
              pub.teamMeldThresholdMet,
              pub.isPlayingFoot,
            )
          ) {
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
                book,
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

    if (
      shouldRandomlySkipMeld(
        difficulty,
        urgency,
        'endTurn',
        pub.teamMeldThresholdMet,
        pub.isPlayingFoot,
      )
    ) {
      debug?.step('meld', 'Random end-turn skip (normal mode).')
      break
    }
  }

  /*
   * When the team can go out, force a greedy meltdown to the last discard card.
   * pickBestAddToBook can leave playable cards stranded; dumping first is safer
   * against opponents who are already light in the foot. Mid-turn Yes uses the
   * same path so discard can finish the round.
   */
  if (current.turnPhase === 'play') {
    const meltPlayer = getCurrentPlayer(current)
    const meltTeam = getTeam(current, meltPlayer.profile.teamId)
    const humanGoOutApproved =
      partnerIsHuman &&
      goOutClearedThisResume &&
      !partnerAdvisedAgainstGoOut(messages, seatIndex, playerCount)
    const shouldMeltdown =
      meltPlayer.isPlayingFoot &&
      canTeamGoOut(meltTeam.books, meltTeam.meldThresholdMet) &&
      (!partnerIsHuman || humanGoOutApproved) &&
      (goOutClearedThisResume || meltPlayer.hand.length > 1 || !partnerIsHuman)

    if (shouldMeltdown) {
      for (let guard = 0; guard < 24; guard++) {
        const goPlayer = getCurrentPlayer(current)
        const goTeam = getTeam(current, goPlayer.profile.teamId)
        if (!canTeamGoOut(goTeam.books, goTeam.meldThresholdMet)) break
        if (goPlayer.hand.length <= 1) break

        const step = pickNextMeldDownToLastCard(
          goPlayer.hand,
          goTeam.books,
          current.booksWithWildAddedThisTurn,
          goTeam.meldThresholdMet,
        )
        if (!step) break

        if (step.type === 'addToBook') {
          const book = goTeam.books.find((b) => b.id === step.bookId)
          if (!book) break
          const addCards = goPlayer.hand.filter((c) => step.cardIds.includes(c.id))
          if (
            partnerIsHuman &&
            shouldAskBeforeWildAdd(
              current,
              seatIndex,
              messages,
              book,
              step.cardIds,
              goPlayer.hand,
            )
          ) {
            if (
              !hasPartnerWildApprovalForBook(messages, seatIndex, partnerIdx, book.id)
            ) {
              if (stopFurtherWildAsks) break
              const wildReq = maybeAiWildRequest(
                current,
                seatIndex,
                messages,
                book.rank,
                book.id,
                book,
              )
              if (wildReq) {
                debug?.step(
                  'chat',
                  `Asking partner before go-out wild on ${book.rank}s.`,
                )
                return {
                  state: stripWildAddsSince(baselineForWildAsk, current, seatIndex),
                  chatMessage: wildReq,
                  awaitingPartner: true,
                  debugTrace: debug?.trace,
                }
              }
              break
            }
          }
          if (
            partnerIsHuman &&
            needsHumanWildConsent(book, addCards, partnerIdx) &&
            !hasPartnerWildApprovalForBook(messages, seatIndex, partnerIdx, book.id)
          ) {
            break
          }
          if (wouldDestroyOnlyCompletedCleanBook(book, addCards, goTeam.books)) {
            break
          }
          debug?.step(
            'add',
            `Go-out meltdown add to ${book.rank}s: ${labelCards(goPlayer.hand, step.cardIds)}`,
          )
          const result = addToBook(current, step.bookId, step.cardIds)
          if (result.error) break
          current = result.state
          continue
        }

        debug?.step(
          'start',
          `Go-out meltdown start: ${labelCards(goPlayer.hand, step.cardIds)}`,
        )
        const startResult = startBook(current, step.cardIds)
        if (startResult.error) break
        current = startResult.state
      }
    }
  }

  if (current.turnPhase === 'play') {
    const currentPlayer = getCurrentPlayer(current)
    const team = getTeam(current, currentPlayer.profile.teamId)

    /*
     * Human partner: on the last foot card, honor prior approval or hold —
     * never ask here because discard would force go-out anyway.
     */
    if (partnerIsHuman) {
      const lastFoot =
        isLastFootCard(currentPlayer) &&
        canTeamGoOut(team.books, team.meldThresholdMet)

      if (lastFoot) {
        if (awaitingPartnerGoOutResponse(messages, seatIndex, partnerIdx)) {
          debug?.step('chat', 'Waiting for partner go-out yes/no.')
          return {
            state: current,
            chatMessage,
            awaitingPartner: true,
            debugTrace: debug?.trace,
          }
        }

        if (
          shouldAiAttemptGoOut(current, seatIndex, messages, {
            turnEnteredInPlayPhase,
          })
        ) {
          debug?.step('discard', 'Partner cleared go-out — discarding last card.')
          /* Fall through to discard / go-out below. */
        } else {
          debug?.step(
            'discard',
            partnerAdvisedAgainstGoOut(messages, seatIndex, playerCount)
              ? 'Partner denied go-out — holding last card without re-asking.'
              : 'No partner clearance yet — holding last foot card.',
          )
          const pass = passTurnKeepingLastFootCard(current)
          return {
            state: pass.error ? current : pass.state,
            chatMessage,
            debugTrace: debug?.trace,
          }
        }
      }
    }

    /* Rival AI partners still broadcast early go-out intent in chat. */
    const goOutSignal = maybeAiChatSignal(current, current.currentPlayerIndex, messages)
    if (goOutSignal && !chatMessage && !partnerIsHuman) {
      debug?.step('chat', 'Signaling ready to go out.')
      chatMessage = goOutSignal
      messages = [...messages, goOutSignal]
    }

    const pub = buildAiPublicState(current, current.currentPlayerIndex)
    let goingOut = canPlayerGoOut(current, messages)
    if (goingOut) debug?.step('discard', 'Can go out this turn.')

    const approvedCleanBookIds = partnerIsHuman
      ? pub.myTeamBooks
          .filter(
            (b) =>
              isCleanBook(b) &&
              hasPartnerWildApprovalForBook(messages, seatIndex, partnerIdx, b.id),
          )
          .map((b) => b.id)
      : []

    const loneWild = pickLoneWildAdd(
      pub.myHand,
      pub.myTeamBooks.filter((b) => !deniedWildBooks.has(b.id)),
      current.booksWithWildAddedThisTurn,
      approvedCleanBookIds,
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
              book,
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
    const opponentRanks = discardPub.allTableBooks
      .filter((b) => b.teamId !== discardPub.myTeamId)
      .map((b) => b.rank)
    const discardId = pickDiscardCard(
      discardPub.myHand,
      discardPub.myTeamBooks,
      difficulty,
      goingOut,
      opponentRanks,
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
