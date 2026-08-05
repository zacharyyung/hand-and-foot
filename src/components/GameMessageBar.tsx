interface GameMessageBarProps {
  error?: string | null
  hint?: string | null
  discardWarning?: {
    cardName: string
    bookRank: string
  } | null
  onDismissDiscardWarning?: () => void
  onConfirmDiscard?: () => void
  dirtyBookWarning?: {
    bookRank: string
  } | null
  onDismissDirtyBookWarning?: () => void
  onConfirmDirtyBook?: () => void
}

export function GameMessageBar({
  error,
  hint,
  discardWarning,
  onDismissDiscardWarning,
  onConfirmDiscard,
  dirtyBookWarning,
  onDismissDirtyBookWarning,
  onConfirmDirtyBook,
}: GameMessageBarProps) {
  const hasContent = Boolean(error || hint || discardWarning || dirtyBookWarning)
  if (!hasContent) return null

  return (
    <div className="game-message-bar shrink-0 px-3 py-2 sm:px-4" role="status" aria-live="polite">
      {error && (
        <p className="game-message game-message-error">{error}</p>
      )}

      {!error && dirtyBookWarning && (
        <div
          className="game-message game-message-prompt game-message-prompt-contrast mx-auto max-w-md rounded-xl border-2 border-amber-600 px-3 py-2.5 text-left shadow-lg"
          style={{ background: '#fbf7f0', color: '#111111' }}
        >
          <p className="text-[13px] font-bold leading-snug" style={{ color: '#111111' }}>
            Add a wild to your clean{' '}
            <span className="font-bold" style={{ color: '#8a5a12' }}>
              {dirtyBookWarning.bookRank}s
            </span>{' '}
            book? That makes it dirty.
          </p>
          <p className="mt-1 text-[11px] font-semibold" style={{ color: '#1a1a1a' }}>
            The wild is not placed until you confirm.
          </p>
          <div className="mt-2.5 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={onDismissDirtyBookWarning}
              className="rounded-lg px-3 py-1.5 text-xs font-bold"
              style={{ background: '#e8e0d4', color: '#111111' }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirmDirtyBook}
              className="btn-danger px-3 py-1.5 text-xs font-bold"
            >
              Add wild
            </button>
          </div>
        </div>
      )}

      {!error && !dirtyBookWarning && discardWarning && (
        <div className="game-message game-message-prompt">
          <p>
            Discard{' '}
            <span className="font-semibold text-accent">{discardWarning.cardName}</span>? It fits
            your {discardWarning.bookRank}s book.
          </p>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            <button type="button" onClick={onDismissDiscardWarning} className="btn-secondary px-3 py-1 text-xs">
              Cancel
            </button>
            <button type="button" onClick={onConfirmDiscard} className="btn-danger px-3 py-1 text-xs">
              Discard anyway
            </button>
          </div>
        </div>
      )}

      {!error && !dirtyBookWarning && !discardWarning && hint && (
        <p className="game-message game-message-hint">{hint}</p>
      )}
    </div>
  )
}
