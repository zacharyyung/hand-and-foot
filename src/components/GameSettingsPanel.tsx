import type { GameState } from '../game/deal'
import { majorityRequired, startOverReached } from '../game/votes'
import { SoundToggle } from './SoundToggle'

interface GameSettingsPanelProps {
  game: GameState
  open: boolean
  onToggle: () => void
  onClose: () => void
  onShowInstructions: () => void
  startOverVotes: number[]
  onStartOverVote: (seatIndex: number) => void
  canRequestUndo: boolean
  undoPending: boolean
  onRequestUndo: () => void
  autoSort: boolean
  onAutoSortChange: (enabled: boolean) => void
  aiDebugEnabled: boolean
  onAiDebugChange: (enabled: boolean) => void
  /** Render trigger inside the player dock instead of fixed corner. */
  dockInline?: boolean
}

export function GameSettingsPanel({
  game,
  open,
  onToggle,
  onClose,
  onShowInstructions,
  startOverVotes,
  onStartOverVote,
  canRequestUndo,
  undoPending,
  onRequestUndo,
  autoSort,
  onAutoSortChange,
  aiDebugEnabled,
  onAiDebugChange,
  dockInline = false,
}: GameSettingsPanelProps) {
  const humans = game.players.filter((p) => p.profile.isHuman)
  const humanCount = humans.length
  const needed = majorityRequired(humanCount)
  const reached = startOverReached(startOverVotes, humanCount)

  return (
    <>
      <button
        type="button"
        onClick={onToggle}
        className={dockInline ? 'dock-control dock-control-settings' : 'corner-control corner-control-br'}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        Settings
      </button>

      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px]"
            aria-label="Close settings"
            onClick={onClose}
          />
          <div
            className="settings-popover corner-popover corner-popover-br animate-fade-up"
            role="dialog"
            aria-label="Settings"
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="font-display text-base font-semibold text-ink">Settings</h2>
              <button type="button" onClick={onClose} className="btn-secondary px-2 py-1 text-xs">
                Close
              </button>
            </div>

            <div className="space-y-3">
              <section className="rounded-xl bg-black/20 px-3 py-2.5">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                  Sound
                </p>
                <SoundToggle variant="row" />
              </section>

              <section className="rounded-xl bg-black/20 px-3 py-2.5">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                  Hand
                </p>
                <button
                  type="button"
                  onClick={() => onAutoSortChange(!autoSort)}
                  className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-xs font-medium text-ink-soft hover:bg-white/8 hover:text-ink"
                  aria-pressed={autoSort}
                >
                  <span>Auto sort</span>
                  <span>{autoSort ? 'On' : 'Off'}</span>
                </button>
                <p className="mt-1.5 text-[10px] leading-relaxed text-ink-faint">
                  When on, your hand is sorted automatically after you draw.
                </p>
              </section>

              <section className="rounded-xl bg-black/20 px-3 py-2.5">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                  AI debugging features
                </p>
                <button
                  type="button"
                  onClick={() => onAiDebugChange(!aiDebugEnabled)}
                  className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-xs font-medium text-ink-soft hover:bg-white/8 hover:text-ink"
                  aria-pressed={aiDebugEnabled}
                >
                  <span>Show AI debug panel</span>
                  <span>{aiDebugEnabled ? 'On' : 'Off'}</span>
                </button>
                <p className="mt-1.5 text-[10px] leading-relaxed text-ink-faint">
                  Dev overlay: see AI reasoning and peek at bot hands. Turn off when done
                  debugging.
                </p>
              </section>

              <section className="rounded-xl bg-black/20 px-3 py-2.5">
                <button
                  type="button"
                  onClick={() => {
                    onShowInstructions()
                    onClose()
                  }}
                  className="w-full rounded-lg px-2 py-2 text-left text-xs font-medium text-ink-soft hover:bg-white/8 hover:text-ink"
                >
                  Instructions
                </button>
              </section>

              <section className="rounded-xl bg-black/20 px-3 py-2.5">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                  Undo
                </p>
                <button
                  type="button"
                  onClick={onRequestUndo}
                  disabled={!canRequestUndo || undoPending}
                  className="w-full rounded-lg px-2 py-2 text-left text-xs font-medium text-ink-soft hover:bg-white/8 hover:text-ink disabled:cursor-not-allowed disabled:opacity-35"
                >
                  {undoPending ? 'Undo vote in progress…' : 'Request undo'}
                </button>
                {!canRequestUndo && !undoPending && (
                  <p className="mt-1 text-[10px] text-ink-faint">No moves to undo yet.</p>
                )}
              </section>

              <section className="rounded-xl bg-black/20 px-3 py-2.5">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                  Start over
                </p>
                <p className="mb-2 text-[10px] text-ink-muted">
                  {humanCount <= 1
                    ? 'Restarts the game from setup.'
                    : `Needs ${needed} of ${humanCount} human players (${startOverVotes.length}/${needed} voted).`}
                </p>
                {reached ? (
                  <p className="text-xs font-medium text-accent">Majority reached — restarting…</p>
                ) : (
                  <ul className="space-y-1.5">
                    {humans.map((player) => {
                      const seat = player.profile.seatIndex
                      const voted = startOverVotes.includes(seat)
                      return (
                        <li key={seat}>
                          <button
                            type="button"
                            onClick={() => onStartOverVote(seat)}
                            disabled={voted}
                            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-white/8 disabled:opacity-55"
                          >
                            <span aria-hidden>{player.profile.avatar}</span>
                            <span className="min-w-0 flex-1 truncate font-medium text-ink-soft">
                              {player.profile.name}
                            </span>
                            <span
                              className={`shrink-0 text-[10px] font-semibold ${
                                voted ? 'text-accent' : 'text-ink-faint'
                              }`}
                            >
                              {voted ? 'Voted' : 'Vote'}
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>
            </div>
          </div>
        </>
      )}
    </>
  )
}
