import { useEffect, useState } from 'react'

function detectMobileLandscape(): boolean {
  if (typeof window === 'undefined') return false

  const width = window.innerWidth
  const height = window.innerHeight
  const landscape = width > height
  if (!landscape) return false

  const touchDevice = window.matchMedia('(pointer: coarse)').matches
  const phoneSized = Math.min(width, height) < 540
  return (touchDevice || phoneSized) && height < 520
}

/** True on phones/tablets held sideways — layout is portrait-first. */
export function useMobileLandscape(): boolean {
  const [landscape, setLandscape] = useState(detectMobileLandscape)

  useEffect(() => {
    const update = () => setLandscape(detectMobileLandscape())
    update()
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
    }
  }, [])

  return landscape
}
