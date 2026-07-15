import {
  addToBook,
  canGoOut,
  commitStagedMelds,
  discardCard,
  drawCards,
  getCurrentPlayer,
  getTeam,
  startBook,
} from '../actions'
import type { GameState } from '../deal'
import { meldThreshold } from '../scoring'
import { teamHasCleanAndDirtyBooks } from '../books'
import { findAddToBookActions } from './decisions'
import {
  meldUrgency,
  pickBestStartWhenUnlocked,
  pickDiscardCard,
  planInitialMeld,
} from './strategy'

export function runAiTurn(state: GameState): GameState {
  const player = getCurrentPlayer(state)
  if (player.profile.isHuman) return state

  const difficulty = player.profile.aiDifficulty ?? 'medium'
  let current = state

  if (current.turnPhase === 'draw') {
    current = drawCards(current)
  }

  if (current.phase !== 'playing') return current

  const maxPlays = difficulty === 'difficult' ? 14 : difficulty === 'medium' ? 10 : 7

  for (let i = 0; i < maxPlays; i++) {
    if (current.turnPhase !== 'play') break
    if (canGoOut(current)) break

    const aiPlayer = getCurrentPlayer(current)
    const team = getTeam(current, aiPlayer.profile.teamId)
    const urgency = meldUrgency(team.score)
    const required = meldThreshold(team.score)

    let played = false

    if (!team.meldThresholdMet) {
      const plan = planInitialMeld(
        aiPlayer.hand,
        team.books,
        Math.max(0, required - current.meldPointsThisTurn),
        urgency,
      )

      if (plan && plan.length > 0) {
        const result = commitStagedMelds(current, plan)
        if (!result.error) {
          current = result.state
          played = true
        }
      }
    } else {
      const updated = getCurrentPlayer(current)
      const updatedTeam = getTeam(current, updated.profile.teamId)
      const addActions = findAddToBookActions(updated.hand, updatedTeam.books)

      if (addActions.length > 0) {
        const skipAdd = difficulty === 'easy' && Math.random() < 0.1
        if (!skipAdd) {
          const result = addToBook(
            current,
            addActions[0].bookId,
            addActions[0].cardIds,
          )
          if (!result.error) {
            current = result.state
            played = true
          }
        }
      }

      if (!played) {
        const updated2 = getCurrentPlayer(current)
        const updatedTeam2 = getTeam(current, updated2.profile.teamId)
        const startIds = pickBestStartWhenUnlocked(
          updated2.hand,
          updatedTeam2.books,
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

      if (!played && addActions.length > 1) {
        const result = addToBook(
          current,
          addActions[1].bookId,
          addActions[1].cardIds,
        )
        if (!result.error) {
          current = result.state
          played = true
        }
      }
    }

    if (!played) break

    if (difficulty === 'easy' && Math.random() < 0.12) break
  }

  if (current.turnPhase === 'play') {
    const updatedPlayer = getCurrentPlayer(current)
    const team = getTeam(current, updatedPlayer.profile.teamId)
    const goingOut =
      updatedPlayer.hand.length === 1 &&
      teamHasCleanAndDirtyBooks(team.books) &&
      team.meldThresholdMet

    const cardId = pickDiscardCard(
      updatedPlayer.hand,
      team.books,
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
