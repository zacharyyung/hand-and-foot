import { useLayoutEffect, useState, type RefObject } from 'react'

export type GameShellLayout = 'comfortable' | 'compact' | 'tight'

function layoutTier(width: number, height: number): GameShellLayout {
  if (height < 680 || (height < 760 && width < 1050)) return 'tight'
  if (height < 880 || width < 820) return 'compact'
  return 'comfortable'
}

/** Measure the play shell and expose responsive layout tier + CSS vars. */
export function useGameShellLayout(shellRef: RefObject<HTMLElement | null>): GameShellLayout {
  const [layout, setLayout] = useState<GameShellLayout>('comfortable')

  useLayoutEffect(() => {
    const el = shellRef.current
    if (!el) return

    const apply = () => {
      const width = el.clientWidth
      const height = el.clientHeight
      const tier = layoutTier(width, height)
      setLayout(tier)
      el.dataset.layout = tier
      document.documentElement.style.setProperty('--game-shell-w', `${width}px`)
      document.documentElement.style.setProperty('--game-shell-h', `${height}px`)
    }

    apply()
    const observer = new ResizeObserver(apply)
    observer.observe(el)
    window.addEventListener('orientationchange', apply)

    return () => {
      observer.disconnect()
      window.removeEventListener('orientationchange', apply)
      delete el.dataset.layout
    }
  }, [shellRef])

  return layout
}
