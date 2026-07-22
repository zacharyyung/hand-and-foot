import type { NarrationJob, NarrationPriority } from './types'

const PRIORITY_WEIGHT: Record<NarrationPriority, number> = {
  critical: 4,
  highlight: 3,
  normal: 2,
  ambient: 1,
}

export class NarrationQueue {
  private queue: NarrationJob[] = []
  private running = false
  private cancelled = false
  private worker: ((job: NarrationJob) => Promise<void>) | null = null

  setWorker(worker: (job: NarrationJob) => Promise<void>): void {
    this.worker = worker
  }

  enqueue(job: NarrationJob): void {
    this.queue.push(job)
    this.queue.sort((a, b) => {
      const priorityDiff = PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority]
      if (priorityDiff !== 0) return priorityDiff
      return a.createdAt - b.createdAt
    })

    if (this.queue.length > 8) {
      this.queue = this.queue.filter((item, index) => {
        if (index >= 6 && item.priority === 'ambient') return false
        return true
      })
    }

    void this.pump()
  }

  clear(): void {
    this.queue = []
    this.cancelled = true
  }

  resume(): void {
    this.cancelled = false
  }

  private async pump(): Promise<void> {
    if (this.running || !this.worker || this.cancelled) return
    const next = this.queue.shift()
    if (!next) return

    this.running = true
    try {
      await this.worker(next)
    } catch {
      /* narration failures should never bubble */
    } finally {
      this.running = false
      if (this.queue.length > 0) {
        queueMicrotask(() => void this.pump())
      }
    }
  }
}

export function priorityForEvent(
  type: string,
): NarrationPriority {
  switch (type) {
    case 'game_over':
    case 'go_out':
      return 'critical'
    case 'round_end':
    case 'book_complete':
    case 'threshold_met':
      return 'highlight'
    case 'ai_thinking':
      return 'ambient'
    default:
      return 'normal'
  }
}
