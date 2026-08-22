const VIEWPORT_META_SELECTOR = 'meta[name="viewport"]'
const PLAYING_VIEWPORT =
  'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover'
const DEFAULT_VIEWPORT =
  'width=device-width, initial-scale=1.0, viewport-fit=cover'

type GestureEventName = 'gesturestart' | 'gesturechange' | 'gestureend'

const GESTURE_EVENTS: GestureEventName[] = [
  'gesturestart',
  'gesturechange',
  'gestureend',
]

function preventGesture(event: Event) {
  event.preventDefault()
}

function preventMultiTouchZoom(event: TouchEvent) {
  if (event.touches.length > 1) {
    event.preventDefault()
  }
}

function getViewportMeta(): HTMLMetaElement | null {
  return document.querySelector<HTMLMetaElement>(VIEWPORT_META_SELECTOR)
}

/**
 * Disable pinch / focus zoom while the table is up.
 * Setup screen keeps the default scalable viewport.
 */
export function lockGameViewport(): () => void {
  const meta = getViewportMeta()
  const previousContent = meta?.getAttribute('content') ?? DEFAULT_VIEWPORT
  meta?.setAttribute('content', PLAYING_VIEWPORT)

  for (const name of GESTURE_EVENTS) {
    document.addEventListener(name, preventGesture, { passive: false })
  }
  document.addEventListener('touchmove', preventMultiTouchZoom, { passive: false })

  return () => {
    meta?.setAttribute('content', previousContent)
    for (const name of GESTURE_EVENTS) {
      document.removeEventListener(name, preventGesture)
    }
    document.removeEventListener('touchmove', preventMultiTouchZoom)
  }
}
