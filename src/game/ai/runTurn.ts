import {
  addToBook,
  canPlayerGoOut,
  canTeamGoOut,
  commitStagedMelds,
  discardCard,
  drawCards,
  getCurrentPlayer,
  getTeam,
  startBook,
} from '../actions'
import type { GameState } from '../deal'
import type { ChatMessage, DirtyBookProposal } from '../chat'
import {
  createAskDirtyBookSignal,
  dirtyBookAskText,
  hasPartnerDirtyBookApproval,
  isAwaitingDirtyBookConfirmation,
  wasDirtyProposalDenied,
} from '../chat'
import type { Card } from '../cards'
import { cardLabel } from '../cards'
import { findAddToBookActions } from './decisions'
import { AiDebugCollector } from './debugTrace'
import { buildAiPublicState } from './publicState'
import { maybeAiChatSignal } from './chatSignals'
import type { PlayerCount } from '../teams'
import { partnerSeat } from '../teams'
import { countWildsInCards } from '../books'
import {
  actionDirtiesCleanBook,
  dirtyActionKey,
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
  /** True when the AI paused mid-turn waiting for a human partner dirty-book reply. */
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

function deniedDirtyKeysFromChat(
  messages: ChatMessage[],
  seatIndex: number,
  playerCount: PlayerCount,
): Set<string> {
  const denied = new Set<string>()
  for (const msg of messages) {
    if (msg.type !== 'ask_dirty_book' || msg.senderSeatIndex !== seatIndex) continue
    const proposal = msg.dirtyProposal
    if (!proposal) continue
    if (wasDirtyProposalDenied(messages, seatIndex, playerCount, proposal)) {
      denied.add(dirtyActionKey(proposal.bookId, proposal.cardIds))
    }
  }
  return denied
}

function needsHumanDirtyConsent(
  state: GameState,
  seatIndex: number,
): boolean {
  const partnerIdx = partnerSeat(seatIndex, state.playerCount as PlayerCount)
  return state.players[partnerIdx]?.profile.isHuman === true
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
  let current = state
  let chatMessage: ChatMessage | undefined
  let messages = chatMessages
  const seatIndex = current.currentPlayerIndex
  const playerCount = current.playerCount as PlayerCount

  if (isAwaitingDirtyBookConfirmation(current, seatIndex, messages)) {
    debug?.step('chat', 'Waiting for partner to approve dirtying a clean book.')
    return { state: current, awaitingPartner: true, debugTrace: debug?.trace }
  }

  if (current.turnPhase === 'draw') {
    debug?.step('draw', 'Drawing 2 from stock.')
    current = drawCards(current)
  }

  if (current.phase !== 'playing') {
    return { state: current, chatMessage, debugTrace: debug?.trace }
  }

  const maxPlays = difficulty === 'expert' ? 14 : 10
  debug?.step(
    'turn',
    `${player.profile.name} (${difficulty}) · hand ${player.hand.length} · max ${maxPlays} meld plays`,
  )

  const deniedDirtyKeys = deniedDirtyKeysFromChat(messages, seatIndex, playerCount)
  const askHumanBeforeDirty = needsHumanDirtyConsent(current, seatIndex)

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
      )
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
          deniedDirtyKeys,
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
        const dirtiesClean = actionDirtiesCleanBook(bestAdd, pub.myTeamBooks, pub.myHand)

        if (dirtiesClean && askHumanBeforeDirty && book) {
          const proposal: DirtyBookProposal = {
            bookId: bestAdd.bookId,
            rank: book.rank,
            cardIds: bestAdd.cardIds,
          }
          const approved = hasPartnerDirtyBookApproval(
            messages,
            seatIndex,
            playerCount,
            proposal,
          )

          if (!approved) {
            const cardLabels = labelCards(pub.myHand, bestAdd.cardIds)
            debug?.step(
              'chat',
              `Asking partner before dirtying ${book.rank}s with ${cardLabels}.`,
            )
            chatMessage = createAskDirtyBookSignal(
              seatIndex,
              player.profile.name,
              player.profile.avatar,
              proposal,
              dirtyBookAskText(book.rank, cardLabels),
            )
            return {
              state: current,
              chatMessage,
              awaitingPartner: true,
              debugTrace: debug?.trace,
            }
          }
        }

        debug?.step(
          'add',
          `Adding to ${book?.rank ?? '?'} book: ${labelCards(pub.myHand, bestAdd.cardIds)}${
            dirtiesClean ? ' (dirtying clean book)' : ''
          }`,
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
    const goOutSignal = maybeAiChatSignal(current, current.currentPlayerIndex, messages)
    if (goOutSignal && !chatMessage) {
      debug?.step('chat', 'Signaling ready to go out.')
      chatMessage = goOutSignal
      messages = [...messages, goOutSignal]
    }

    const pub = buildAiPublicState(current, current.currentPlayerIndex)
    const goingOut = canPlayerGoOut(current, messages)
    if (goingOut) debug?.step('discard', 'Can go out this turn.')

    const loneWild = pickLoneWildAdd(
      pub.myHand,
      pub.myTeamBooks,
      current.booksWithWildAddedThisTurn,
    )
    if (loneWild && !goingOut) {
      debug?.step('wild', `Adding lone wild to book ${loneWild.bookId.slice(0, 8)}…`)
      const wildResult = addToBook(current, loneWild.bookId, [loneWild.cardId])
      if (!wildResult.error) {
        current = wildResult.state
      }
    } else if (!goingOut) {
      const refreshed = buildAiPublicState(current, current.currentPlayerIndex)
      if (refreshed.teamMeldThresholdMet) {
        const wildStart = pickWildStartBook(
          refreshed.myHand,
          refreshed.myTeamBooks,
          refreshed.isPlayingFoot,
          meldPressure(refreshed),
        )
        if (wildStart) {
          const startsDirty = wildStart.some((id) => {
            const card = refreshed.myHand.find((c) => c.id === id)
            return card && countWildsInCards([card]) > 0
          })
          debug?.step(
            'wild',
            `Starting book with wild${startsDirty ? ' (dirty start)' : ''}: ${wildStart
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
    }
  }

  return { state: current, chatMessage, debugTrace: debug?.trace }
}

export function isAiPlayer(state: GameState): boolean {
  return !getCurrentPlayer(state).profile.isHuman
}
