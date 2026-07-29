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
        <div className="game-message game-message-prompt">
          <p>
            Add a wild to your clean{' '}
            <span className="font-semibold text-accent">{dirtyBookWarning.bookRank}s</span> book?
            That makes it dirty.
          </p>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={onDismissDirtyBookWarning}
              className="btn-secondary px-3 py-1 text-xs"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirmDirtyBook}
              className="btn-danger px-3 py-1 text-xs"
            >
              Add wild anyway
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
