export function LandscapeModeOverlay() {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/85 p-6 backdrop-blur-sm"
      role="alertdialog"
      aria-live="assertive"
      aria-label="Rotate your device"
    >
      <div className="animate-fade-up max-w-sm rounded-2xl border border-white/10 bg-felt-dark px-6 py-8 text-center shadow-2xl">
        <p className="mb-2 font-sans text-[11px] uppercase tracking-[0.2em] text-ink-faint">
          Rotate your device
        </p>
        <h2 className="font-display text-2xl font-semibold text-ink">Portrait mode works best</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          Hand &amp; Foot is designed for portrait on mobile. Turn your phone upright for the
          clearest table, hand, and controls.
        </p>
      </div>
    </div>
  )
}
