import type { GameState } from '../game/deal'
import type { UndoVoteRequest } from '../game/votes'
import {
  majorityRequired,
  undoEligibleVoters,
  undoVoteProgress,
} from '../game/votes'

interface RestartNoticeOverlayProps {
  humanCount: number
}

export function RestartNoticeOverlay({ humanCount }: RestartNoticeOverlayProps) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-6 backdrop-blur-sm">
      <div className="animate-fade-up max-w-md rounded-2xl bg-felt-dark px-6 py-8 text-center shadow-2xl">
        <p className="mb-2 font-sans text-[11px] uppercase tracking-[0.2em] text-ink-faint">
          Start over
        </p>
        <h2 className="font-display text-2xl font-semibold text-ink">New game</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          A majority of human players ({majorityRequired(humanCount)} of {humanCount}) voted to
          start over. Setting up a fresh game…
        </p>
      </div>
    </div>
  )
}

interface UndoVoteOverlayProps {
  game: GameState
  request: UndoVoteRequest
  onVote: (voterSeat: number, choice: 'approve' | 'deny') => void
  onDismissResult: () => void
  result: 'approved' | 'denied' | null
}

export function UndoVoteOverlay({
  game,
  request,
  onVote,
  onDismissResult,
  result,
}: UndoVoteOverlayProps) {
  const requester = game.players[request.requesterSeat]
  const eligible = undoEligibleVoters(game, request.requesterSeat)
  const progress = undoVoteProgress(request, eligible)

  if (result) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-6 backdrop-blur-sm">
        <div className="animate-fade-up max-w-md rounded-2xl bg-felt-dark px-6 py-8 text-center shadow-2xl">
          <h2 className="font-display text-2xl font-semibold text-ink">
            {result === 'approved' ? 'Undo granted' : 'Undo denied'}
          </h2>
          <p className="mt-3 text-sm text-ink-soft">
            {result === 'approved'
              ? 'The last move has been reversed.'
              : 'The vote did not reach a majority. Play continues.'}
          </p>
          <button type="button" onClick={onDismissResult} className="btn-primary mt-6 px-6 py-2.5">
            Continue
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div
        className="animate-fade-up max-w-md rounded-2xl bg-felt-dark p-5 shadow-2xl"
        role="dialog"
        aria-label="Undo vote"
      >
        <p className="mb-1 font-sans text-[10px] uppercase tracking-wider text-ink-faint">
          Undo request
        </p>
        <h2 className="font-display text-xl font-semibold text-ink">
          {requester.profile.avatar} {requester.profile.name} wants to undo
        </h2>
        <p className="mt-2 text-xs leading-relaxed text-ink-muted">
          {eligible.length === 0
            ? 'No other human players can vote — undo will apply automatically.'
            : `Partners cannot vote. ${progress.needed} of ${eligible.length} eligible player${
                eligible.length === 1 ? '' : 's'
              } must approve.`}
        </p>

        {eligible.length > 0 && (
          <>
            <p className="mt-3 text-[10px] tabular-nums text-ink-faint">
              {progress.approvals} approve · {progress.denials} deny · {progress.pending} waiting
            </p>
            <ul className="mt-3 space-y-1.5">
              {eligible.map((seat) => {
                const player = game.players[seat]
                const vote = request.votes[seat]
                return (
                  <li
                    key={seat}
                    className="flex flex-wrap items-center gap-2 rounded-xl bg-black/25 px-3 py-2"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink-soft">
                      <span aria-hidden>{player.profile.avatar}</span> {player.profile.name}
                    </span>
                    {vote ? (
                      <span
                        className={`text-xs font-semibold ${
                          vote === 'approve' ? 'text-accent' : 'text-red-300/90'
                        }`}
                      >
                        {vote === 'approve' ? 'Approved' : 'Denied'}
                      </span>
                    ) : (
                      <span className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => onVote(seat, 'approve')}
                          className="btn-secondary px-2 py-1 text-[10px]"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => onVote(seat, 'deny')}
                          className="rounded-lg border border-red-400/30 bg-red-950/35 px-2 py-1 text-[10px] font-semibold text-red-200 hover:bg-red-950/55"
                        >
                          Deny
                        </button>
                      </span>
                    )}
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}

interface UndoRequestPickerProps {
  game: GameState
  onSelect: (seatIndex: number) => void
  onCancel: () => void
}

/** Who is requesting undo — pass-the-device for multi-human games. */
export function UndoRequestPicker({ game, onSelect, onCancel }: UndoRequestPickerProps) {
  const humans = game.players.filter((p) => p.profile.isHuman)

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="animate-fade-up max-w-sm rounded-2xl bg-felt-dark p-5 shadow-2xl">
        <h2 className="font-display text-lg font-semibold text-ink">Request undo</h2>
        <p className="mt-1 text-xs text-ink-muted">Which player is requesting the undo?</p>
        <ul className="mt-3 space-y-1.5">
          {humans.map((player) => (
            <li key={player.profile.seatIndex}>
              <button
                type="button"
                onClick={() => onSelect(player.profile.seatIndex)}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-white/8"
              >
                <span>{player.profile.avatar}</span>
                <span>{player.profile.name}</span>
              </button>
            </li>
          ))}
        </ul>
        <button type="button" onClick={onCancel} className="btn-secondary mt-4 w-full py-2 text-xs">
          Cancel
        </button>
      </div>
    </div>
  )
}
