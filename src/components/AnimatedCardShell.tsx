import type { ReactNode } from 'react'
import type { CardMotionKind } from '../game/cardMotion'

const MOTION_CLASS: Record<CardMotionKind, string> = {
  draw: 'animate-card-draw',
  place: 'animate-card-place',
  discard: 'animate-card-discard',
}

interface AnimatedCardShellProps {
  motion?: CardMotionKind
  className?: string
  children: ReactNode
}

export function AnimatedCardShell({
  motion,
  className = '',
  children,
}: AnimatedCardShellProps) {
  const anim = motion ? MOTION_CLASS[motion] : ''
  return (
    <div className={[anim, className].filter(Boolean).join(' ')}>
      {children}
    </div>
  )
}
