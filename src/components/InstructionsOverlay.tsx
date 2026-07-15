interface InstructionsOverlayProps {
  open: boolean
  onClose: () => void
}

export function InstructionsOverlay({ open, onClose }: InstructionsOverlayProps) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] max-w-lg overflow-y-auto rounded-2xl border border-white/15 bg-felt-dark p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-xl font-bold text-white">How to Play</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-white/10 px-3 py-1 text-sm text-white hover:bg-white/20"
          >
            Close
          </button>
        </div>

        <div className="space-y-4 text-sm leading-relaxed text-white/80">
          <section>
            <h3 className="mb-1 font-semibold text-white">Overview</h3>
            <p>
              Hand and Foot is a team rummy game. Each player has a <strong>hand</strong>{' '}
              (played first) and a <strong>foot</strong> (face-down until the hand is empty).
              Teams meld <strong>books</strong> — sets of matching rank — on the table.
              First team to <strong>5,000 points</strong> wins.
            </p>
          </section>

          <section>
            <h3 className="mb-1 font-semibold text-white">Setup</h3>
            <ul className="list-inside list-disc space-y-1">
              <li>4, 6, 8, or 10 players in teams of 2 (partners sit across from each other).</li>
              <li>One deck per player (52 cards + 2 jokers each), all shuffled together.</li>
              <li>11 cards to each hand and 11 to each foot; remainder is the stock pile.</li>
              <li>Discard pile starts empty. Youngest human goes first (solo player always starts).</li>
            </ul>
          </section>

          <section>
            <h3 className="mb-1 font-semibold text-white">Turn</h3>
            <ul className="list-inside list-disc space-y-1">
              <li>Draw 2 cards from the stock (never from the discard pile).</li>
              <li>Optionally meld or add to your team&apos;s books.</li>
              <li>Discard exactly 1 card to end your turn (no take-backs).</li>
            </ul>
          </section>

          <section>
            <h3 className="mb-1 font-semibold text-white">Initial meld</h3>
            <p className="mb-1">Before your team can freely meld, one player must lay enough points in one turn:</p>
            <ul className="list-inside list-disc space-y-1">
              <li>Team score 0–999 → 50 points</li>
              <li>1,000–1,499 → 100 points</li>
              <li>1,500–1,999 → 150 points</li>
              <li>2,000+ → 200 points</li>
            </ul>
            <p className="mt-1">
              Use <strong>Stage Book</strong> to privately prepare melds, then <strong>Meld</strong> when
              staged cards meet the requirement. After that, your partner may meld freely.
            </p>
          </section>

          <section>
            <h3 className="mb-1 font-semibold text-white">Books</h3>
            <ul className="list-inside list-disc space-y-1">
              <li>Start a book with 3+ cards of the same rank (max 1 wild when starting).</li>
              <li>Only one book per rank per team. Red 3s cannot go in books.</li>
              <li>Dirty book: has wilds (2s or Jokers). Max 2 wilds per book.</li>
              <li>Clean book: no wilds. Books can grow beyond 7 cards.</li>
              <li>Completed book (7+ cards): clean = +300 bonus, dirty = +100 bonus at round end.</li>
            </ul>
          </section>

          <section>
            <h3 className="mb-1 font-semibold text-white">Hand → foot</h3>
            <ul className="list-inside list-disc space-y-1">
              <li>
                <strong>Skip and run:</strong> meld your last hand card and immediately continue with your foot.
              </li>
              <li>
                <strong>Or:</strong> discard your last hand card, pick up your foot, and play it next turn.
              </li>
              <li>You must still discard 1 card before your turn ends (unless going out).</li>
            </ul>
          </section>

          <section>
            <h3 className="mb-1 font-semibold text-white">Going out</h3>
            <ul className="list-inside list-disc space-y-1">
              <li>Team must have at least one completed clean book (7+) and one dirty book (7+).</li>
              <li>Discard your last card to end the round (+100 bonus).</li>
            </ul>
          </section>

          <section>
            <h3 className="mb-1 font-semibold text-white">Card values</h3>
            <ul className="list-inside list-disc space-y-1">
              <li>3♣–9, black 3s: 5 · 10, J, Q, K: 10 · A, 2: 20 · Joker: 50</li>
              <li>Red 3s: −300 if left in hand or foot at round end</li>
            </ul>
          </section>

          <section>
            <h3 className="mb-1 font-semibold text-white">Scoring (end of round)</h3>
            <ul className="list-inside list-disc space-y-1">
              <li>+ Card values on the table + book bonuses + going-out bonus</li>
              <li>− Cards still in your hand and foot</li>
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
      className="fixed right-4 top-4 z-40 rounded-lg border border-white/20 bg-black/40 px-3 py-1.5 text-xs font-medium text-white/80 backdrop-blur hover:bg-black/60 hover:text-white"
    >
      Instructions
    </button>
  )
}
