import { useEffect, useRef } from 'react'
import type { ChatMessage } from '../game/chat'
import type { GameState } from '../game/deal'
import {
  createApproveGoOutSignal,
  createDenyGoOutSignal,
  pendingPartnerGoOutRequest,
  pendingPartnerWildRequest,
} from '../game/chat'
import { partnerSeat, TEAM_COLORS, type PlayerCount } from '../game/teams'
import { playSound, unlockAudio } from '../game/audio'
import { partnerVoiceService } from '../partnerVoice'

interface PartnerVoiceOverlayProps {
  game: GameState
  viewerSeat: number
  messages: ChatMessage[]
  onSend: (message: ChatMessage, validationState?: GameState) => void
}

/**
 * Compact go-out Yes/No prompt — keeps the table visible (no full-screen dimmer).
 * Wild/dirty consent uses the inline book popup instead.
 */
export function PartnerVoiceOverlay({
  game,
  viewerSeat,
  messages,
  onSend,
}: PartnerVoiceOverlayProps) {
  const spokenRef = useRef<string | null>(null)

  const viewer = game.players[viewerSeat]
  const partnerIdx = partnerSeat(viewerSeat, game.playerCount as PlayerCount)
  const partner = game.players[partnerIdx]
  const viewerIsHuman = viewer.profile.isHuman
  const aiPartner = !partner.profile.isHuman

  const goOutRequest =
    viewerIsHuman && aiPartner
      ? pendingPartnerGoOutRequest(messages, viewerSeat, partnerIdx)
      : null
  const wildRequest =
    viewerIsHuman && aiPartner
      ? pendingPartnerWildRequest(messages, viewerSeat, partnerIdx)
      : null

  useEffect(() => {
    const toSpeak = goOutRequest ?? wildRequest
    if (!toSpeak || spokenRef.current === toSpeak.id) return
    spokenRef.current = toSpeak.id
    unlockAudio()
    partnerVoiceService.unlock()
    partnerVoiceService.speak(toSpeak.text)
  }, [goOutRequest, wildRequest])

  if (!goOutRequest || !viewerIsHuman) return null

  const teamColor = TEAM_COLORS[partner.profile.teamId]

  function respondGoOut(approve: boolean) {
    unlockAudio()
    partnerVoiceService.unlock()
    partnerVoiceService.stop()
    playSound('chat')
    onSend(
      approve
        ? createApproveGoOutSignal(viewerSeat, viewer.profile.name, viewer.profile.avatar)
        : createDenyGoOutSignal(viewerSeat, viewer.profile.name, viewer.profile.avatar),
      game,
    )
  }

  return (
    <div
      className="partner-voice-overlay animate-fade-up pointer-events-auto fixed bottom-[max(5.5rem,env(safe-area-inset-bottom))] left-1/2 z-50 w-[min(20rem,calc(100vw-1.5rem))] -translate-x-1/2 rounded-2xl border border-white/12 bg-gradient-to-b from-[#0f3a26]/96 to-[#081c12]/98 p-3.5 shadow-2xl backdrop-blur-sm sm:bottom-8"
      role="dialog"
      aria-label="Partner wants to go out"
    >
      <div className="mb-2.5 flex items-center gap-2.5">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg ring-2"
          style={{ boxShadow: `0 0 0 2px ${teamColor}55` }}
        >
          {partner.profile.avatar}
        </div>
        <div className="min-w-0">
          <p className="font-display text-sm font-semibold leading-tight text-ink">
            {partner.profile.name} wants to go out
          </p>
          <p className="text-[10px] uppercase tracking-wider text-ink-faint">Your AI partner</p>
        </div>
      </div>

      <p className="mb-2 line-clamp-3 rounded-xl bg-black/25 px-2.5 py-2 text-[12px] leading-snug text-ink-soft">
        &ldquo;{goOutRequest.text}&rdquo;
      </p>

      <p className="mb-2.5 text-[10px] leading-relaxed text-ink-muted">
        Yes clears them to go out. No keeps them from going out for now — they may ask again later.
        Saying &ldquo;You should go out!&rdquo; in table chat also answers this ask (or clears a
        prior No).
      </p>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => respondGoOut(true)}
          className="btn-success flex-1 py-2 text-sm"
        >
          Yes
        </button>
        <button
          type="button"
          onClick={() => respondGoOut(false)}
          className="btn-secondary flex-1 py-2 text-sm"
        >
          No
        </button>
      </div>
    </div>
  )
}
