interface InstructionsOverlayProps {
  open: boolean
  onClose: () => void
}

export function InstructionsOverlay({ open, onClose }: InstructionsOverlayProps) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="animate-fade-up max-h-[85vh] max-w-lg overflow-y-auto rounded-2xl bg-felt-dark p-6 shadow-2xl"
        style={{ boxShadow: '0 0 0 1px rgba(255,255,255,0.08), 0 24px 64px rgba(0,0,0,0.5)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 className="font-display text-2xl font-semibold text-ink">How to play</h2>
          <button type="button" onClick={onClose} className="btn-secondary px-3 py-1.5">
            Close
          </button>
        </div>

        <div className="space-y-4 text-sm leading-relaxed text-ink-soft">
          <section>
            <h3 className="mb-1 font-semibold text-ink">Overview</h3>
            <p>
              Hand and Foot is a team rummy game. Each player has a <strong>hand</strong>{' '}
              (played first) and a <strong>foot</strong> (face-down until the hand is empty).
              Teams meld <strong>books</strong> — sets of matching rank — on the table.
              First team to <strong>5,000 points</strong> wins.
            </p>
          </section>

          <section>
            <h3 className="mb-1 font-semibold text-ink">Setup</h3>
            <ul className="list-inside list-disc space-y-1">
              <li>4, 6, 8, or 10 players in teams of 2 (partners sit across).</li>
              <li>One deck per player (52 cards + 2 jokers), shuffled together.</li>
              <li>11 cards to each hand and foot; remainder is the stock.</li>
              <li>Youngest human goes first (solo player always starts).</li>
            </ul>
          </section>

          <section>
            <h3 className="mb-1 font-semibold text-ink">Turn</h3>
            <ul className="list-inside list-disc space-y-1">
              <li>Draw 2 from the stock (never the discard).</li>
              <li>Optionally meld or add to your team&apos;s books.</li>
              <li>Discard exactly 1 card to end your turn.</li>
            </ul>
          </section>

          <section>
            <h3 className="mb-1 font-semibold text-ink">Initial meld</h3>
            <p className="mb-1">Before free melding, one player must lay enough points:</p>
            <ul className="list-inside list-disc space-y-1">
              <li>0–999 → 50 · 1,000–1,499 → 100 · 1,500–1,999 → 150 · 2,000+ → 200</li>
            </ul>
            <p className="mt-1">
              Use <strong>Stage</strong> privately, then <strong>Meld</strong> when you meet
              the requirement. Completed book bonuses (+300 clean, +100 dirty) count toward
              the meld total.
            </p>
          </section>

          <section>
            <h3 className="mb-1 font-semibold text-ink">Books</h3>
            <ul className="list-inside list-disc space-y-1">
              <li>Start with 3+ of a rank (max 1 wild when starting).</li>
              <li>Only one book per rank per team. Red 3s cannot go in books.</li>
              <li>
                Dirty = has wilds. Clean = no wilds. A dirty book may hold{' '}
                <strong>at most 2 wilds</strong> total.
              </li>
              <li>
                Only <strong>1 wild per play</strong> when starting, staging, or adding to a
                book — and only <strong>1 wild per book per turn</strong>.
              </li>
              <li>Completed (7+): clean +300, dirty +100 at round end.</li>
            </ul>
          </section>

          <section>
            <h3 className="mb-1 font-semibold text-ink">Hand → foot &amp; going out</h3>
            <ul className="list-inside list-disc space-y-1">
              <li>
                <strong>Skip and run:</strong> meld your last hand card and continue with foot.
              </li>
              <li>Or discard last hand card, pick up foot next turn.</li>
              <li>
                Go out with one completed clean and one dirty book, then discard your last card.
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  )
}

export function InstructionsButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="fixed right-4 top-4 z-40 rounded-full bg-black/40 px-3 py-1.5 text-xs font-medium text-ink-muted backdrop-blur hover:bg-black/60 hover:text-ink"
    >
      How to play
    </button>
  )
}
