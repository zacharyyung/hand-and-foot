import {
  addToBook,
  canGoOut,
  commitStagedMelds,
  discardCard,
  drawCards,
  getCurrentPlayer,
  startBook,
} from '../actions'
import type { GameState } from '../deal'
import { findAddToBookActions } from './decisions'
import { buildAiPublicState } from './publicState'
import {
  meldUrgency,
  pickBestAddToBook,
  pickBestStartWhenUnlocked,
  pickDiscardCard,
  planInitialMeld,
} from './strategy'

export function runAiTurn(state: GameState): GameState {
  const player = getCurrentPlayer(state)
  if (player.profile.isHuman) return state

  const difficulty = player.profile.aiDifficulty ?? 'normal'
  let current = state

  if (current.turnPhase === 'draw') {
    current = drawCards(current)
  }

  if (current.phase !== 'playing') return current

  const maxPlays = difficulty === 'expert' ? 14 : 10

  for (let i = 0; i < maxPlays; i++) {
    if (current.turnPhase !== 'play') break
    if (canGoOut(current)) break

    const pub = buildAiPublicState(current, current.currentPlayerIndex)
    const urgency = meldUrgency(pub.teamScore)

    let played = false

    if (!pub.teamMeldThresholdMet) {
      const plan = planInitialMeld(
        pub.myHand,
        pub.myTeamBooks,
        Math.max(0, pub.requiredMeld - pub.meldPointsThisTurn),
        urgency,
        difficulty,
      )

      if (plan && plan.length > 0) {
        const result = commitStagedMelds(current, plan)
        if (!result.error) {
          current = result.state
          played = true
        }
      }
    } else {
      const addActions = findAddToBookActions(pub.myHand, pub.myTeamBooks, pub.isPlayingFoot)
      const triedAdds = new Set<string>()

      for (let attempt = 0; attempt < 2 && !played; attempt++) {
        const remaining = addActions.filter(
          (a) => !triedAdds.has(`${a.bookId}:${a.cardIds.join(',')}`),
        )
        const bestAdd = pickBestAddToBook(
          remaining,
          pub.myHand,
          pub.myTeamBooks,
          difficulty,
        )
        if (!bestAdd) break

        triedAdds.add(`${bestAdd.bookId}:${bestAdd.cardIds.join(',')}`)
        const skipAdd = difficulty === 'normal' && Math.random() < 0.08
        if (skipAdd) continue

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

    if (difficulty === 'normal' && Math.random() < 0.1) break
  }

  if (current.turnPhase === 'play') {
    const pub = buildAiPublicState(current, current.currentPlayerIndex)
    const goingOut = canGoOut(current)

    const cardId = pickDiscardCard(
      pub.myHand,
      pub.myTeamBooks,
      difficulty,
      goingOut,
    )
    const result = discardCard(current, cardId)
    if (!result.error) {
      current = result.state
    }
  }

  return current
}

export function isAiPlayer(state: GameState): boolean {
  return !getCurrentPlayer(state).profile.isHuman
}
