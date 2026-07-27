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

/** Full-screen partner prompt for go-out asks. Wild/dirty consent uses inline book prompts. */
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
    <>
      <div className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px]" aria-hidden />
      <div
        className="partner-voice-overlay animate-fade-up fixed left-1/2 top-1/2 z-50 w-[min(22rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-white/12 bg-gradient-to-b from-[#0f3a26]/98 to-[#081c12]/99 p-5 shadow-2xl"
        role="dialog"
        aria-label="Partner decision"
      >
        <div className="mb-3 flex items-center gap-3">
          <div
            className="flex h-11 w-11 items-center justify-center rounded-full text-xl ring-2"
            style={{ boxShadow: `0 0 0 2px ${teamColor}55` }}
          >
            {partner.profile.avatar}
          </div>
          <div>
            <p className="font-display text-base font-semibold text-ink">
              {partner.profile.name} wants to go out
            </p>
            <p className="text-[10px] uppercase tracking-wider text-ink-faint">Your AI partner</p>
          </div>
        </div>

        <p className="mb-4 rounded-xl bg-black/25 px-3 py-2.5 text-sm leading-relaxed text-ink-soft">
          &ldquo;{goOutRequest.text}&rdquo;
        </p>

        <p className="mb-3 text-[10px] leading-relaxed text-ink-muted">
          Yes clears them to go out. No tells them to wait — they won&apos;t ask again this round.
          You can still tell them &ldquo;You should go out!&rdquo; later in table chat.
        </p>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => respondGoOut(true)}
            className="btn-success flex-1 py-2.5 text-sm"
          >
            Yes
          </button>
          <button
            type="button"
            onClick={() => respondGoOut(false)}
            className="btn-secondary flex-1 py-2.5 text-sm"
          >
            No
          </button>
        </div>
      </div>
    </>
  )
}
