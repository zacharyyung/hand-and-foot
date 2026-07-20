import { useEffect, useRef, useState } from 'react'

export function MeldRulesHint() {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-[1.125rem] w-[1.125rem] items-center justify-center rounded-full border border-white/18 bg-black/35 text-[9px] font-bold leading-none text-ink-muted transition hover:border-white/28 hover:bg-black/50 hover:text-ink"
        aria-label="What is the meld requirement?"
        aria-expanded={open}
      >
        ?
      </button>

      {open && (
        <div
          className="absolute right-0 top-[calc(100%+0.375rem)] z-50 w-[min(16rem,calc(100vw-2rem))] animate-fade-up rounded-xl border border-white/10 bg-felt-dark p-3 shadow-xl"
          role="dialog"
          aria-label="Meld requirement rules"
        >
          <p className="mb-2 font-display text-xs font-semibold text-ink">
            Initial meld requirement
          </p>
          <p className="mb-2 text-[10px] leading-relaxed text-ink-muted">
            Before your team can freely put cards on the table, one player must
            lay enough points in a single turn:
          </p>
          <ul className="space-y-0.5 text-[10px] tabular-nums text-ink-soft">
            <li className="flex justify-between gap-3">
              <span>Team score 0–999</span>
              <span className="font-semibold">50 pts</span>
            </li>
            <li className="flex justify-between gap-3">
              <span>1,000–1,499</span>
              <span className="font-semibold">100 pts</span>
            </li>
            <li className="flex justify-between gap-3">
              <span>1,500–1,999</span>
              <span className="font-semibold">150 pts</span>
            </li>
            <li className="flex justify-between gap-3">
              <span>2,000+</span>
              <span className="font-semibold">200 pts</span>
            </li>
          </ul>
          <p className="mt-2 border-t border-white/10 pt-2 text-[10px] leading-relaxed text-ink-muted">
            Use <strong className="text-ink-soft">Stage</strong> (and add more cards
            to staged books as you go), then{' '}
            <strong className="text-ink-soft">Meld</strong>. Completed book bonuses
            (+300 clean / +100 dirty) count toward the total.
          </p>
        </div>
      )}
    </div>
  )
}
