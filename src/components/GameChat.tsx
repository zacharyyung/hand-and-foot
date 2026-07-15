import { useEffect, useRef, useState } from 'react'
import type { PlayerProfile } from '../game/deal'
import type { ChatMessage } from '../game/chat'
import { createChatMessage } from '../game/chat'
import { playSound } from '../game/audio'

interface GameChatProps {
  humanPlayers: Array<{ profile: PlayerProfile }>
  messages: ChatMessage[]
  onSend: (message: ChatMessage) => void
  defaultSenderSeat?: number
  dockedAboveHand?: boolean
}

export function GameChat({
  humanPlayers,
  messages,
  onSend,
  defaultSenderSeat,
  dockedAboveHand = false,
}: GameChatProps) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [senderSeat, setSenderSeat] = useState(
    defaultSenderSeat ?? humanPlayers[0]?.profile.seatIndex ?? 0,
  )
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (defaultSenderSeat !== undefined) {
      setSenderSeat(defaultSenderSeat)
    }
  }, [defaultSenderSeat])

  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, open])

  const sender = humanPlayers.find((p) => p.profile.seatIndex === senderSeat)

  function handleSend() {
    const text = draft.trim()
    if (!text || !sender) return

    onSend(
      createChatMessage(
        sender.profile.seatIndex,
        sender.profile.name,
        sender.profile.avatar,
        text,
      ),
    )
    setDraft('')
  }

  return (
    <div
      className={`fixed right-3 z-30 flex w-[min(100vw-1.5rem,17rem)] flex-col ${
        dockedAboveHand
          ? 'bottom-[min(32vh,320px)] sm:bottom-[min(30vh,340px)]'
          : 'bottom-3'
      }`}
    >
      <button
        type="button"
        onClick={() => {
          playSound('button')
          setOpen((v) => !v)
        }}
        className="mb-2 self-end rounded-full bg-black/50 px-3 py-1.5 text-[11px] font-medium text-ink-muted backdrop-blur hover:bg-black/70 hover:text-ink"
      >
        {open ? 'Close' : messages.length > 0 ? `Chat · ${messages.length}` : 'Chat'}
      </button>

      {open && (
        <div className="animate-fade-up flex max-h-[min(28vh,14rem)] flex-col overflow-hidden rounded-2xl bg-black/75 shadow-xl backdrop-blur-md">
          <div className="px-3 py-2">
            <p className="text-[11px] font-semibold text-ink">Partner chat</p>
            <p className="text-[9px] text-ink-faint">Humans only</p>
          </div>

          <div ref={listRef} className="flex-1 space-y-2 overflow-y-auto px-3 py-1">
            {messages.length === 0 ? (
              <p className="py-4 text-center text-[11px] text-ink-faint">
                Coordinate quietly.
              </p>
            ) : (
              messages.map((msg) => (
                <div key={msg.id} className="rounded-lg bg-white/5 px-2 py-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm">{msg.senderAvatar}</span>
                    <span className="text-[11px] font-semibold text-ink">
                      {msg.senderName}
                    </span>
                  </div>
                  <p className="mt-0.5 whitespace-pre-wrap break-words text-[11px] text-ink-soft">
                    {msg.text}
                  </p>
                </div>
              ))
            )}
          </div>

          <div className="p-2">
            {humanPlayers.length > 1 && (
              <label className="mb-1.5 flex items-center gap-2">
                <span className="shrink-0 text-[9px] text-ink-faint">As</span>
                <select
                  value={senderSeat}
                  onChange={(e) => setSenderSeat(Number(e.target.value))}
                  className="w-full rounded-lg border-0 bg-white/10 px-2 py-1 text-[11px] text-ink"
                >
                  {humanPlayers.map((p) => (
                    <option
                      key={p.profile.seatIndex}
                      value={p.profile.seatIndex}
                      className="bg-felt-dark"
                    >
                      {p.profile.avatar} {p.profile.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <div className="flex gap-1.5">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSend()
                  }
                }}
                placeholder="Message…"
                maxLength={280}
                className="min-w-0 flex-1 rounded-lg border-0 bg-white/10 px-2 py-1.5 text-[11px] text-ink placeholder:text-ink-faint focus:outline-none focus:ring-1 focus:ring-accent/40"
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={!draft.trim()}
                className="btn-primary px-2.5 py-1.5 disabled:opacity-35"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
