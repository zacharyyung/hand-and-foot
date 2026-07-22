import { useEffect, useRef } from 'react'
import type { GameState } from '../game/deal'
import type { ChatMessage } from '../game/chat'
import { diffGameNarrationEvents } from './gameEvents'
import { narrationService } from './NarrationService'
import type { GameNarrationEvent } from './types'

export function useGameNarration(
  game: GameState | null,
  viewerSeat: number,
  chatMessages: ChatMessage[],
): void {
  const prevGameRef = useRef<GameState | null>(null)
  const prevChatCountRef = useRef(0)

  useEffect(() => {
    narrationService.setGameContext(game)
  }, [game])

  useEffect(() => {
    if (!game) {
      prevGameRef.current = null
      return
    }

    const prev = prevGameRef.current
    if (!prev) {
      const current = game.players[game.currentPlayerIndex]
      if (current.profile.isHuman) {
        narrationService.emit({
          type: 'turn_start',
          playerName: current.profile.name,
          isViewer: game.currentPlayerIndex === viewerSeat,
          isPlayingFoot: current.isPlayingFoot,
        })
      }
    } else {
      const events = diffGameNarrationEvents(prev, game, viewerSeat)
      for (const event of events) {
        narrationService.emit(event)
      }
    }

    prevGameRef.current = game
  }, [game, viewerSeat])

  useEffect(() => {
    if (!game || chatMessages.length <= prevChatCountRef.current) {
      prevChatCountRef.current = chatMessages.length
      return
    }

    const latest = chatMessages[chatMessages.length - 1]
    if (latest && game.players[latest.senderSeatIndex]?.profile.isHuman) {
      narrationService.emit({
        type: 'chat',
        senderName: latest.senderName,
        text: latest.text,
      })
    }
    prevChatCountRef.current = chatMessages.length
  }, [chatMessages, game])
}

export function narrateError(message: string): void {
  narrationService.emit({ type: 'error', message })
}

export function narrateAiThinking(playerName: string): void {
  narrationService.emit({ type: 'ai_thinking', playerName })
}

export function narrateManual(event: GameNarrationEvent): void {
  narrationService.emit(event)
}

export function resetGameNarrationSession(): void {
  narrationService.resetSession()
}
