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
        className="theme-scroll animate-fade-up max-h-[85vh] max-w-lg overflow-y-auto rounded-2xl bg-felt-dark p-6 shadow-2xl"
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
            <h3 className="mb-1 font-semibold text-ink">Card values</h3>
            <p className="mb-2">
              Points count toward your initial meld and round score. Cards left in hand or foot at
              round end count against you at the same values (red 3s are the exception — see
              below).
            </p>
            <ul className="list-inside list-disc space-y-1">
              <li>
                <strong>Jokers</strong> — 50 pts
              </li>
              <li>
                <strong>2s</strong> and <strong>Aces</strong> — 20 pts
              </li>
              <li>
                <strong>10s</strong> and <strong>face cards</strong> (J, Q, K) — 10 pts
              </li>
              <li>
                <strong>All other cards</strong> (4–9, black 3s) — 5 pts
              </li>
              <li>
                <strong>Red 3s</strong> (♥3, ♦3) — not melded; discard when you can. Each one
                still in hand or foot at round end costs <strong>300 pts</strong>.
              </li>
            </ul>
          </section>

          <section>
            <h3 className="mb-1 font-semibold text-ink">Wild cards</h3>
            <p className="mb-2">
              <strong>2s</strong> (any suit) and <strong>Jokers</strong> are wild. They can stand
              in for any rank when starting or adding to a book — for example, a 2 plus two 7s
              starts a 7 book.
            </p>
            <ul className="list-inside list-disc space-y-1">
              <li>
                A book needs at least two natural cards; you cannot start a book from wilds alone.
              </li>
              <li>
                When starting a book, use <strong>at most 1 wild</strong> in that play.
              </li>
              <li>
                When adding to a book, play <strong>at most 1 wild at a time</strong>, and only{' '}
                <strong>1 wild per book per turn</strong>.
              </li>
              <li>
                A dirty book (one with any wild) may hold <strong>at most 2 wilds</strong> total.
                Clean books have no wilds.
              </li>
              <li>
                A lone wild can be added to any book that still has room for wilds, even if you
                are not adding naturals of that rank.
              </li>
            </ul>
          </section>

          <section>
            <h3 className="mb-1 font-semibold text-ink">Initial meld</h3>
            <p className="mb-1">Before free melding, one player must lay enough points:</p>
            <ul className="list-inside list-disc space-y-1">
              <li>0–999 → 50 · 1,000–1,499 → 100 · 1,500–1,999 → 150 · 2,000+ → 200</li>
            </ul>
            <p className="mt-1">
              Use <strong>Stage</strong> privately (you can keep adding cards to staged
              books), then <strong>Meld</strong> when you meet
              the requirement. Completed book bonuses (+300 clean, +100 dirty) count toward
              the meld total.
            </p>
          </section>

          <section>
            <h3 className="mb-1 font-semibold text-ink">Books</h3>
            <ul className="list-inside list-disc space-y-1">
              <li>Start with 3+ of a rank (see Wild cards for wild limits).</li>
              <li>Only one book per rank per team. Red 3s cannot go in books.</li>
              <li>
                Dirty = has wilds. Clean = no wilds. A dirty book may hold{' '}
                <strong>at most 2 wilds</strong> total.
              </li>
              <li>Completed (7+): clean +300, dirty +100 at round end.</li>
            </ul>
          </section>

          <section>
            <h3 className="mb-1 font-semibold text-ink">Table chat</h3>
            <p>
              Use <strong>Table chat</strong> while playing your <strong>foot</strong> with books
              set to ask <strong>I can go out!</strong> Your partner replies Yes or No with
              advice — especially if they still hold high-value cards or red threes. You may still
              go out if all requirements are met and you think it is the right move.
            </p>
            <p className="mt-2">
              When your AI partner asks to go out, saying <strong>No</strong> stops them from
              asking again. Use <strong>You should go out!</strong> in table chat whenever you want
              to clear them to go out (even if they have not asked).
            </p>
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
    <button type="button" onClick={onClick} className="corner-control">
      How to play
    </button>
  )
}
