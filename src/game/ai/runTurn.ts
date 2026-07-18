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
import type { ChatMessage } from '../chat'
import { findAddToBookActions } from './decisions'
import { buildAiPublicState } from './publicState'
import { maybeAiChatSignal } from './chatSignals'
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
}

export function runAiTurn(
  state: GameState,
  chatMessages: ChatMessage[] = [],
): AiTurnResult {
  const player = getCurrentPlayer(state)
  if (player.profile.isHuman) return { state }

  const difficulty = player.profile.aiDifficulty ?? 'normal'
  let current = state
  let chatMessage: ChatMessage | undefined
  let messages = chatMessages

  if (current.turnPhase === 'draw') {
    current = drawCards(current)
  }

  if (current.phase !== 'playing') return { state: current, chatMessage }

  const maxPlays = difficulty === 'expert' ? 14 : 10

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
      break
    }

    let played = false

    if (!pub.teamMeldThresholdMet) {
      const required = Math.max(0, pub.requiredMeld - pub.meldPointsThisTurn)
      const openUrgency = initialMeldUrgency(pub.requiredMeld, urgency)
      let plan = planInitialMeld(
        pub.myHand,
        pub.myTeamBooks,
        required,
        openUrgency,
        difficulty,
        pub.isPlayingFoot,
      )
      if (!plan && openUrgency !== 'high') {
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
        const result = commitStagedMelds(current, plan)
        if (!result.error) {
          current = result.state
          played = true
        }
      }
    } else {
      const addActions = findAddToBookActions(
        pub.myHand,
        pub.myTeamBooks,
        pub.isPlayingFoot,
        current.booksWithWildAddedThisTurn,
        team.meldThresholdMet,
      )
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
        if (!bestAdd) break

        triedAdds.add(`${bestAdd.bookId}:${bestAdd.cardIds.join(',')}`)
        if (shouldRandomlySkipMeld(difficulty, urgency, 'add', pub.teamMeldThresholdMet)) continue

        const result = addToBook(current, bestAdd.bookId, bestAdd.cardIds)
        if (!result.error) {
          current = result.state
          played = true
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
          const result = startBook(current, startIds)
          if (!result.error) {
            current = result.state
            played = true
          }
        }
      }
    }

    if (!played) break

    if (shouldRandomlySkipMeld(difficulty, urgency, 'endTurn', pub.teamMeldThresholdMet)) break
  }

  if (current.turnPhase === 'play') {
    const goOutSignal = maybeAiChatSignal(current, current.currentPlayerIndex, messages)
    if (goOutSignal && !chatMessage) {
      chatMessage = goOutSignal
      messages = [...messages, goOutSignal]
    }

    const pub = buildAiPublicState(current, current.currentPlayerIndex)
    const goingOut = canPlayerGoOut(current, messages)

    const loneWild = pickLoneWildAdd(
      pub.myHand,
      pub.myTeamBooks,
      current.booksWithWildAddedThisTurn,
    )
    if (loneWild && !goingOut) {
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
        )
        if (wildStart) {
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
    const result = discardCard(current, discardId, messages)
    if (!result.error) {
      current = result.state
    }
  }

  return { state: current, chatMessage }
}

export function isAiPlayer(state: GameState): boolean {
  return !getCurrentPlayer(state).profile.isHuman
}
