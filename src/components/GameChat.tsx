import { useEffect, useRef, useState } from 'react'
import type { GameState } from '../game/deal'
import type { ChatMessage } from '../game/chat'
import {
  createApproveGoOutSignal,
  createDenyGoOutSignal,
  createReadyGoOutSignal,
  canInitiateGoOutSignal,
  pendingPartnerGoOutRequest,
  pendingPartnerWildRequest,
  READY_GO_OUT_SIGNAL_TEXT,
  awaitingPartnerGoOutResponse,
} from '../game/chat'
import { partnerSeat, TEAM_COLORS, type PlayerCount } from '../game/teams'
import { playSound } from '../game/audio'

interface GameChatProps {
  game: GameState
  viewerSeat: number
  messages: ChatMessage[]
  onSend: (message: ChatMessage, validationState?: GameState) => void
  /** Render trigger inside the player dock instead of fixed corner. */
  dockInline?: boolean
  compact?: boolean
}

export function GameChat({
  game,
  viewerSeat,
  messages,
  onSend,
  dockInline = false,
  compact = false,
}: GameChatProps) {
  const [open, setOpen] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  const viewer = game.players[viewerSeat]
  const partnerIdx = partnerSeat(viewerSeat, game.playerCount as PlayerCount)
  const partner = game.players[partnerIdx]
  const viewerIsHuman = viewer.profile.isHuman
  const isMyTurn = game.currentPlayerIndex === viewerSeat
  const canSignalGoOut = canInitiateGoOutSignal(game, viewerSeat)

  const partnerRequest = pendingPartnerGoOutRequest(messages, viewerSeat, partnerIdx)
  const wildRequest = pendingPartnerWildRequest(messages, viewerSeat, partnerIdx)
  const pendingDecision = partnerRequest ?? wildRequest
  const aiPartner = !partner.profile.isHuman
  const waitingForPartnerReply =
    viewerIsHuman &&
    awaitingPartnerGoOutResponse(messages, viewerSeat, partnerIdx)
  const waitingForAiReview =
    waitingForPartnerReply && !partner.profile.isHuman

  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, open])

  useEffect(() => {
    if ((pendingDecision || waitingForPartnerReply) && viewerIsHuman) {
      setOpen(true)
    }
  }, [pendingDecision, waitingForPartnerReply, viewerIsHuman])

  function sendReadyGoOut() {
    if (!viewerIsHuman || !canSignalGoOut) return
    playSound('chat')
    onSend(
      createReadyGoOutSignal(
        viewer.profile.seatIndex,
        viewer.profile.name,
        viewer.profile.avatar,
      ),
      game,
    )
  }

  function sendPartnerResponse(approve: boolean) {
    if (!viewerIsHuman || !partnerRequest) return
    playSound('chat')
    onSend(
      approve
        ? createApproveGoOutSignal(
            viewer.profile.seatIndex,
            viewer.profile.name,
            viewer.profile.avatar,
          )
        : createDenyGoOutSignal(
            viewer.profile.seatIndex,
            viewer.profile.name,
            viewer.profile.avatar,
          ),
      game,
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          playSound('button')
          setOpen((v) => !v)
        }}
        className={`${
          dockInline ? 'dock-control dock-control-chat table-chat-chip' : 'corner-control corner-control-bl table-chat-chip'
        } ${compact ? 'dock-control-icon' : ''} ${pendingDecision || waitingForPartnerReply ? 'table-chat-chip-alert' : ''}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Table chat"
      >
        <span className="table-chat-chip-label">{compact ? 'Chat' : 'Table chat'}</span>
        {pendingDecision && (
          <span className="table-chat-chip-badge table-chat-chip-badge-alert" aria-hidden>
            !
          </span>
        )}
        {!pendingDecision && waitingForPartnerReply && (
          <span className="table-chat-chip-badge table-chat-chip-badge-alert" aria-hidden>
            …
          </span>
        )}
        {!pendingDecision && !waitingForPartnerReply && messages.length > 0 && (
          <span className="table-chat-chip-badge" aria-label={`${messages.length} messages`}>
            {messages.length}
          </span>
        )}
      </button>

      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px]"
            aria-label="Close table chat"
            onClick={() => setOpen(false)}
          />
          <div
            className="table-chat-panel corner-popover corner-popover-bl animate-fade-up"
            role="dialog"
            aria-label="Table chat"
          >
            <div className="table-chat-panel-header">
              <div>
                <p className="font-display text-sm font-semibold text-ink">Table chat</p>
                <p className="mt-0.5 text-[10px] leading-relaxed text-ink-muted">
                  While playing your foot with books set, ask if you can go out. Your partner&apos;s
                  reply is advice — you make the final call.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="btn-secondary px-2 py-1 text-xs"
              >
                Close
              </button>
            </div>

            {waitingForAiReview && (
              <div className="table-chat-partner-prompt">
                <p className="text-[11px] font-semibold text-ink">
                  Waiting for {partner.profile.avatar} {partner.profile.name}…
                </p>
                <p className="mt-1 text-[10px] text-ink-muted">
                  Your partner is deciding whether you should go out.
                </p>
              </div>
            )}

            {waitingForPartnerReply && partner.profile.isHuman && (
              <div className="table-chat-partner-prompt">
                <p className="text-[11px] font-semibold text-ink">
                  Waiting for {partner.profile.avatar} {partner.profile.name}…
                </p>
                <p className="mt-1 text-[10px] text-ink-muted">
                  You asked to go out — your partner&apos;s reply is advice, not a rule.
                </p>
              </div>
            )}

            {partnerRequest && viewerIsHuman && !aiPartner && (
              <div className="table-chat-partner-prompt">
                <p className="text-[11px] font-semibold text-ink">
                  {partner.profile.avatar} {partner.profile.name} says they can go out!
                </p>
                <p className="mt-1 text-[10px] text-ink-muted">
                  Only you can reply — yes encourages going out, no suggests waiting.
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => sendPartnerResponse(true)}
                    className="btn-success flex-1 py-2 text-[11px]"
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    onClick={() => sendPartnerResponse(false)}
                    className="btn-secondary flex-1 py-2 text-[11px]"
                  >
                    No
                  </button>
                </div>
              </div>
            )}

            {wildRequest && viewerIsHuman && aiPartner && (
              <div className="table-chat-partner-prompt">
                <p className="text-[11px] font-semibold text-ink">
                  {partner.profile.avatar} {partner.profile.name} asked about a wild card
                </p>
                <p className="mt-1 text-[10px] text-ink-muted">
                  Reply using the prompt next to the book on the table.
                </p>
              </div>
            )}

            {partnerRequest && viewerIsHuman && aiPartner && (
              <div className="table-chat-partner-prompt">
                <p className="text-[11px] font-semibold text-ink">
                  {partner.profile.avatar} {partner.profile.name} wants to go out
                </p>
                <p className="mt-1 text-[10px] text-ink-muted">
                  Use the partner prompt on screen to reply.
                </p>
              </div>
            )}

            <div ref={listRef} className="table-chat-messages">
              {messages.length === 0 ? (
                <p className="py-4 text-center text-[11px] leading-relaxed text-ink-faint">
                  Playing your foot with books set? Tap &ldquo;I can go out!&rdquo; to check with
                  your partner — their answer is advice, not a requirement.
                </p>
              ) : (
                messages.map((msg) => {
                  const teamId = game.players[msg.senderSeatIndex]?.profile.teamId ?? 0
                  const isRequest = msg.type === 'ready_go_out'
                  const isApprove = msg.type === 'approve_go_out' || msg.type === 'wild_approve'
                  const isDeny = msg.type === 'deny_go_out' || msg.type === 'wild_deny'
                  const isWildRequest = msg.type === 'wild_request'
                  const isReply = msg.type === 'partner_reply'
                  return (
                    <div
                      key={msg.id}
                      className={`rounded-lg px-2.5 py-2 ${
                        isRequest
                          ? 'bg-accent/16 ring-1 ring-accent/35'
                          : isWildRequest
                            ? 'bg-amber-500/14 ring-1 ring-amber-400/30'
                            : isApprove
                            ? 'bg-emerald-500/12 ring-1 ring-emerald-400/25'
                            : isDeny
                              ? 'bg-white/5 ring-1 ring-white/10'
                              : isReply
                                ? 'bg-sky-500/10 ring-1 ring-sky-400/20'
                                : 'bg-white/5'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm">{msg.senderAvatar}</span>
                        <span className="text-[11px] font-semibold text-ink">
                          {msg.senderName}
                        </span>
                        <span
                          className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ backgroundColor: TEAM_COLORS[teamId] }}
                          aria-hidden
                        />
                      </div>
                      <p
                        className={`mt-1 text-[11px] leading-snug ${
                          isRequest
                            ? 'font-semibold text-accent'
                            : isWildRequest
                              ? 'font-semibold text-amber-200'
                              : isApprove
                              ? 'font-semibold text-emerald-300'
                              : isReply
                                ? 'text-sky-100'
                                : 'text-ink-soft'
                        }`}
                      >
                        {msg.text}
                      </p>
                    </div>
                  )
                })
              )}
            </div>

            {viewerIsHuman && (
              <div className="table-chat-actions">
                <p className="text-[9px] text-ink-faint">
                  Partner: {partner.profile.avatar} {partner.profile.name}
                </p>

                {canSignalGoOut ? (
                  <button
                    type="button"
                    onClick={sendReadyGoOut}
                    className="btn-primary w-full py-2 text-[11px]"
                  >
                    {READY_GO_OUT_SIGNAL_TEXT}
                  </button>
                ) : isMyTurn && viewer.isPlayingFoot && !canSignalGoOut ? (
                  <p className="rounded-lg bg-black/25 px-2.5 py-2 text-center text-[10px] leading-relaxed text-ink-muted">
                    Finish your books before asking to go out while playing your foot.
                    {partnerRequest
                      ? ' You can still reply to your partner above.'
                      : ''}
                  </p>
                ) : isMyTurn && viewer.isPlayingFoot ? (
                  <p className="rounded-lg bg-black/25 px-2.5 py-2 text-center text-[10px] leading-relaxed text-ink-muted">
                    Ask your partner when you are ready — you decide whether to go out.
                    {partnerRequest
                      ? ' You can still reply to your partner above.'
                      : ''}
                  </p>
                ) : (
                  <p className="rounded-lg bg-black/25 px-2.5 py-2 text-center text-[10px] leading-relaxed text-ink-muted">
                    Wait for your turn to say you can go out.
                    {partnerRequest
                      ? ' You can still reply to your partner above.'
                      : ''}
                  </p>
                )}
              </div>
            )}

            {!viewerIsHuman && (
              <p className="border-t border-white/8 px-3 py-2 text-center text-[10px] text-ink-faint">
                Spectating — partners post signals here when ready.
              </p>
            )}
          </div>
        </>
      )}
    </>
  )
}
