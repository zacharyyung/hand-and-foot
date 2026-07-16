import { useEffect, useRef, useState } from 'react'
import type { GameState } from '../game/deal'
import type { ChatMessage } from '../game/chat'
import {
  createApproveGoOutSignal,
  createDenyGoOutSignal,
  createPartnerReplySignal,
  createReadyGoOutSignal,
  pendingPartnerGoOutRequest,
  READY_GO_OUT_SIGNAL_TEXT,
  awaitingPartnerGoOutResponse,
} from '../game/chat'
import { partnerSeat, TEAM_COLORS, type PlayerCount } from '../game/teams'
import { playSound } from '../game/audio'

interface GameChatProps {
  game: GameState
  viewerSeat: number
  messages: ChatMessage[]
  onSend: (message: ChatMessage) => void
}

export function GameChat({
  game,
  viewerSeat,
  messages,
  onSend,
}: GameChatProps) {
  const [open, setOpen] = useState(false)
  const [customReply, setCustomReply] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  const viewer = game.players[viewerSeat]
  const partnerIdx = partnerSeat(viewerSeat, game.playerCount as PlayerCount)
  const partner = game.players[partnerIdx]
  const viewerIsHuman = viewer.profile.isHuman
  const isMyTurn = game.currentPlayerIndex === viewerSeat

  const partnerRequest = pendingPartnerGoOutRequest(messages, viewerSeat, partnerIdx)
  const waitingForAiReview =
    viewerIsHuman &&
    !partner.profile.isHuman &&
    awaitingPartnerGoOutResponse(messages, viewerSeat, partnerIdx)

  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, open])

  useEffect(() => {
    if ((partnerRequest || waitingForAiReview) && viewerIsHuman) {
      setOpen(true)
    }
  }, [partnerRequest, waitingForAiReview, viewerIsHuman])

  useEffect(() => {
    if (!partnerRequest) setCustomReply('')
  }, [partnerRequest])

  function sendReadyGoOut() {
    if (!viewerIsHuman || !isMyTurn) return
    playSound('chat')
    onSend(
      createReadyGoOutSignal(
        viewer.profile.seatIndex,
        viewer.profile.name,
        viewer.profile.avatar,
      ),
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
    )
    setCustomReply('')
  }

  function sendCustomPartnerReply() {
    const text = customReply.trim()
    if (!viewerIsHuman || !partnerRequest || text.length === 0) return
    playSound('chat')
    onSend(
      createPartnerReplySignal(
        viewer.profile.seatIndex,
        viewer.profile.name,
        viewer.profile.avatar,
        text,
      ),
    )
    setCustomReply('')
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          playSound('button')
          setOpen((v) => !v)
        }}
        className={`corner-control corner-control-bl table-chat-chip ${
          partnerRequest || waitingForAiReview ? 'table-chat-chip-alert' : ''
        }`}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <span className="table-chat-chip-label">Table chat</span>
        {partnerRequest && (
          <span className="table-chat-chip-badge table-chat-chip-badge-alert" aria-hidden>
            !
          </span>
        )}
        {!partnerRequest && waitingForAiReview && (
          <span className="table-chat-chip-badge table-chat-chip-badge-alert" aria-hidden>
            …
          </span>
        )}
        {!partnerRequest && !waitingForAiReview && messages.length > 0 && (
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
                  Say you can go out on your turn only. Your partner can reply
                  anytime — even when it is not their turn.
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
                  Your partner is reviewing whether you should go out.
                </p>
              </div>
            )}

            {partnerRequest && viewerIsHuman && (
              <div className="table-chat-partner-prompt">
                <p className="text-[11px] font-semibold text-ink">
                  {partner.profile.avatar} {partner.profile.name} says they can go out!
                </p>
                <p className="mt-1 text-[10px] text-ink-muted">
                  Only you can reply — even when it is not your turn.
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
                <div className="mt-2 flex gap-1.5">
                  <input
                    type="text"
                    value={customReply}
                    onChange={(e) => setCustomReply(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') sendCustomPartnerReply()
                    }}
                    placeholder="Custom reply…"
                    className="min-w-0 flex-1 rounded-lg border border-white/12 bg-black/30 px-2.5 py-2 text-[11px] text-ink placeholder:text-ink-faint"
                    aria-label="Custom partner reply"
                  />
                  <button
                    type="button"
                    onClick={sendCustomPartnerReply}
                    disabled={customReply.trim().length === 0}
                    className="btn-secondary shrink-0 px-3 py-2 text-[11px] disabled:opacity-35"
                  >
                    Send
                  </button>
                </div>
              </div>
            )}

            <div ref={listRef} className="table-chat-messages">
              {messages.length === 0 ? (
                <p className="py-4 text-center text-[11px] leading-relaxed text-ink-faint">
                  On your turn, signal when you can go out. Your partner can reply
                  with Yes, No, or a custom message.
                </p>
              ) : (
                messages.map((msg) => {
                  const teamId = game.players[msg.senderSeatIndex]?.profile.teamId ?? 0
                  const isRequest = msg.type === 'ready_go_out'
                  const isApprove = msg.type === 'approve_go_out'
                  const isDeny = msg.type === 'deny_go_out'
                  const isReply = msg.type === 'partner_reply'
                  return (
                    <div
                      key={msg.id}
                      className={`rounded-lg px-2.5 py-2 ${
                        isRequest
                          ? 'bg-accent/16 ring-1 ring-accent/35'
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

                {isMyTurn ? (
                  <button
                    type="button"
                    onClick={sendReadyGoOut}
                    className="btn-primary w-full py-2 text-[11px]"
                  >
                    {READY_GO_OUT_SIGNAL_TEXT}
                  </button>
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
