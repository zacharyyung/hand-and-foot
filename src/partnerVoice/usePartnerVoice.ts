import { useEffect, useRef } from 'react'
import type { ChatMessage } from '../game/chat'
import type { GameState } from '../game/deal'
import { partnerSeat, type PlayerCount } from '../game/teams'
import { getViewerSeat } from '../game/tableLayout'
import { partnerVoiceService } from './PartnerVoiceService'

const PARTNER_SPEECH_TYPES = new Set(['approve_go_out', 'deny_go_out'])

/** Speak AI partner chat lines directed at the human viewer. */
export function usePartnerVoice(game: GameState | null, chatMessages: ChatMessage[]): void {
  const prevCountRef = useRef(0)

  useEffect(() => {
    if (!game) {
      prevCountRef.current = 0
      return
    }

    if (chatMessages.length <= prevCountRef.current) {
      prevCountRef.current = chatMessages.length
      return
    }

    const viewerSeat = getViewerSeat(game.players)
    const partnerIdx = partnerSeat(viewerSeat, game.playerCount as PlayerCount)
    const partner = game.players[partnerIdx]
    if (partner.profile.isHuman) {
      prevCountRef.current = chatMessages.length
      return
    }

    for (let i = prevCountRef.current; i < chatMessages.length; i++) {
      const msg = chatMessages[i]
      if (!msg || msg.senderSeatIndex !== partnerIdx) continue
      if (!PARTNER_SPEECH_TYPES.has(msg.type)) continue
      partnerVoiceService.speak(msg.text)
    }

    prevCountRef.current = chatMessages.length
  }, [chatMessages, game])
}
