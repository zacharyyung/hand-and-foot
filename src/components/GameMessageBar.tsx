interface GameMessageBarProps {
  error?: string | null
  hint?: string | null
  discardWarning?: {
    cardName: string
    bookRank: string
  } | null
  onDismissDiscardWarning?: () => void
  onConfirmDiscard?: () => void
}

export function GameMessageBar({
  error,
  hint,
  discardWarning,
  onDismissDiscardWarning,
  onConfirmDiscard,
}: GameMessageBarProps) {
  const hasContent = Boolean(error || hint || discardWarning)
  if (!hasContent) return null

  return (
    <div className="game-message-bar shrink-0 px-3 py-2 sm:px-4" role="status" aria-live="polite">
      {error && (
        <p className="game-message game-message-error">{error}</p>
      )}

      {!error && hint && (
        <p className="game-message game-message-hint">{hint}</p>
      )}

      {!error && discardWarning && (
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
    </div>
  )
}
