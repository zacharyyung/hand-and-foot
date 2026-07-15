import type { Card, Rank } from '../cards'
import { isRedThree, isWildCard } from '../cards'
import type { Book } from '../books'
import { bookWildCount, canStartBook, countWildsInCards, isCleanBook, isDirtyBook } from '../books'
import { sumCardPoints, cardPointValue, meldThreshold } from '../scoring'
import type { AiDifficulty } from '../deal'
import { findAddToBookActions, findStartBookActions, type AiAction } from './decisions'

function combinations<T>(items: T[], min: number, max: number): T[][] {
  const results: T[][] = []
  function helper(start: number, combo: T[]) {
    if (combo.length >= min && combo.length <= max) results.push([...combo])
    if (combo.length === max) return
    for (let i = start; i < items.length; i++) {
      combo.push(items[i])
      helper(i + 1, combo)
      combo.pop()
    }
  }
  helper(0, [])
  return results
}

function groupByRank(hand: Card[]): Map<Rank, Card[]> {
  const groups = new Map<Rank, Card[]>()
  for (const card of hand) {
    if (isRedThree(card) || isWildCard(card)) continue
    const list = groups.get(card.rank) ?? []
    list.push(card)
    groups.set(card.rank, list)
  }
  return groups
}

function hasWilds(cards: Card[]): boolean {
  return cards.some(isWildCard)
}

interface StartOption {
  cardIds: string[]
  score: number
  rank: Rank
  clean: boolean
}

function getStartOptions(hand: Card[], teamBooks: Book[]): StartOption[] {
  const options: StartOption[] = []
  const seen = new Set<Rank>()
  const playable = hand.filter((c) => !isRedThree(c))

  for (const combo of combinations(playable, 3, Math.min(6, playable.length))) {
    const check = canStartBook(combo, teamBooks)
    if (!check.ok || seen.has(check.rank)) continue
    seen.add(check.rank)
    options.push({
      cardIds: combo.map((c) => c.id),
      score: sumCardPoints(combo),
      rank: check.rank,
      clean: !hasWilds(combo),
    })
  }

  return options
}

/** Pick non-overlapping books that meet the meld point requirement. */
export function planInitialMeld(
  hand: Card[],
  teamBooks: Book[],
  required: number,
  urgency: 'low' | 'medium' | 'high',
  difficulty: AiDifficulty = 'normal',
): string[][] | null {
  const options = getStartOptions(hand, teamBooks)
  if (options.length === 0) return null

  const needsDirty = teamNeedsDirtyBook(teamBooks)
  const needsClean = teamNeedsCleanBook(teamBooks)

  const scoreOption = (opt: StartOption) => {
    let s = opt.score
    const rankCount = hand.filter((c) => c.rank === opt.rank && !isRedThree(c)).length

    if (difficulty === 'expert') {
      if (opt.clean) {
        s += urgency === 'low' ? 50 : urgency === 'medium' ? 35 : 20
        s += rankCount * 6
      } else {
        s -= urgency === 'low' ? 50 : urgency === 'medium' ? 25 : 8
      if (needsDirty) s += 18
      else s -= 30
      if (needsClean && opt.clean) s += 12
      }
      if (urgency === 'high') s += opt.score * 0.35
    } else {
      if (urgency === 'high') s += 15
      if (opt.clean) s += 12
      else s += 6
      s += rankCount * 3
    }

    return s
  }

  const sorted = [...options].sort((a, b) => scoreOption(b) - scoreOption(a))

  function dirtyBooksInPlan(chosen: string[][]): number {
    return chosen.filter((ids) =>
      ids.some((id) => {
        const card = hand.find((c) => c.id === id)
        return card && isWildCard(card)
      }),
    ).length
  }

  function search(
    index: number,
    used: Set<string>,
    chosen: string[][],
    points: number,
  ): string[][] | null {
    if (points >= required) return chosen
    if (index >= sorted.length) return null

    const skip = search(index + 1, used, chosen, points)
    if (skip) return skip

    const opt = sorted[index]
    if (opt.cardIds.some((id) => used.has(id))) {
      return search(index + 1, used, chosen, points)
    }

    if (
      difficulty === 'expert' &&
      !opt.clean &&
      dirtyBooksInPlan(chosen) >= 1 &&
      urgency !== 'high'
    ) {
      return search(index + 1, used, chosen, points)
    }

    const nextUsed = new Set(used)
    opt.cardIds.forEach((id) => nextUsed.add(id))
    return search(
      index + 1,
      nextUsed,
      [...chosen, opt.cardIds],
      points + opt.score,
    )
  }

  const plan = search(0, new Set(), [], 0)
  if (!plan || difficulty !== 'expert') return plan

  const cleanOnly = options.filter((o) => o.clean)
  if (cleanOnly.length > 0) {
    const cleanSorted = [...cleanOnly].sort((a, b) => scoreOption(b) - scoreOption(a))
    const cleanPlan = searchCleanOnly(cleanSorted, required)
    if (cleanPlan) return cleanPlan
  }

  return plan
}

function searchCleanOnly(
  sorted: StartOption[],
  required: number,
): string[][] | null {
  function search(
    index: number,
    used: Set<string>,
    chosen: string[][],
    points: number,
  ): string[][] | null {
    if (points >= required) return chosen
    if (index >= sorted.length) return null

    const skip = search(index + 1, used, chosen, points)
    if (skip) return skip

    const opt = sorted[index]
    if (opt.cardIds.some((id) => used.has(id))) {
      return search(index + 1, used, chosen, points)
    }

    const nextUsed = new Set(used)
    opt.cardIds.forEach((id) => nextUsed.add(id))
    return search(
      index + 1,
      nextUsed,
      [...chosen, opt.cardIds],
      points + opt.score,
    )
  }

  return search(0, new Set(), [], 0)
}

export function meldUrgency(teamScore: number): 'low' | 'medium' | 'high' {
  const req = meldThreshold(teamScore)
  if (req >= 150) return 'high'
  if (req >= 100) return 'medium'
  return 'low'
}

export function teamNeedsDirtyBook(books: Book[]): boolean {
  return !books.some((b) => b.cards.length >= 3 && isDirtyBook(b))
}

export function teamNeedsCleanBook(books: Book[]): boolean {
  return !books.some((b) => b.cards.length >= 3 && isCleanBook(b))
}

export function pickBestStartWhenUnlocked(
  hand: Card[],
  teamBooks: Book[],
  urgency: 'low' | 'medium' | 'high',
  difficulty: AiDifficulty,
): string[] | null {
  const options = getStartOptions(hand, teamBooks)
  if (options.length === 0) return null

  const needsDirty = teamNeedsDirtyBook(teamBooks)
  const needsClean = teamNeedsCleanBook(teamBooks)

  const scored = options.map((opt) => {
    let value = opt.score
    const rankCount = hand.filter((c) => c.rank === opt.rank && !isRedThree(c)).length
    value += rankCount * 4

    if (difficulty === 'expert') {
      if (opt.clean) {
        value += urgency === 'low' ? 40 : urgency === 'medium' ? 25 : 12
        value += rankCount * 5
      } else {
        value -= urgency === 'low' ? 35 : urgency === 'medium' ? 15 : 0
        if (needsDirty) value += 20
        else value -= 25
      }
      if (needsClean && opt.clean) value += 15
    } else {
      if (needsDirty && !opt.clean) value += urgency === 'low' ? 15 : 10
      if (needsClean && opt.clean) value += urgency === 'low' ? 12 : 8
      if (urgency === 'high') value += opt.score * 0.4
    }

    return { opt, value }
  })

  scored.sort((a, b) => b.value - a.value)

  if (difficulty === 'normal' && Math.random() < 0.12 && scored.length > 1) {
    return scored[1].opt.cardIds
  }

  return scored[0].opt.cardIds
}

/** Prefer natural adds; avoid wilds on clean books (preserves clean books for going out). */
export function pickBestAddToBook(
  actions: Extract<AiAction, { type: 'addToBook' }>[],
  hand: Card[],
  teamBooks: Book[],
  difficulty: AiDifficulty,
): Extract<AiAction, { type: 'addToBook' }> | null {
  if (actions.length === 0) return null

  const scored = actions.map((action) => {
    const book = teamBooks.find((b) => b.id === action.bookId)!
    const cards = hand.filter((c) => action.cardIds.includes(c.id))
    const wildsAdded = countWildsInCards(cards)
    const naturalsAdded = cards.length - wildsAdded
    const clean = isCleanBook(book)
    const newSize = book.cards.length + cards.length
    const completes = newSize >= 7

    let score = action.priority

    if (clean && wildsAdded > 0) {
      score -= difficulty === 'expert' ? 250 : 200
      if (!completes) score -= 80
    }

    if (clean && naturalsAdded > 0) {
      score += 40
      if (completes) score += 35
    }

    if (!clean && wildsAdded > 0 && bookWildCount(book) < 2) {
      score += 15
    }

    if (naturalsAdded > 0 && !clean) {
      score += 20
    }

    return { action, score }
  })

  scored.sort((a, b) => b.score - a.score)

  const withoutWildOnClean = scored.filter(({ action }) => {
    const book = teamBooks.find((b) => b.id === action.bookId)!
    const cards = hand.filter((c) => action.cardIds.includes(c.id))
    return !(isCleanBook(book) && countWildsInCards(cards) > 0)
  })

  const pool = withoutWildOnClean.length > 0 ? withoutWildOnClean : scored

  if (difficulty === 'normal' && Math.random() < 0.1 && pool.length > 1) {
    return pool[1].action
  }

  return pool[0]?.action ?? null
}

export function pickDiscardCard(
  hand: Card[],
  teamBooks: Book[],
  difficulty: AiDifficulty,
  goingOut: boolean,
): string {
  if (hand.length === 0) return ''
  if (goingOut) return hand[0].id

  const redThrees = hand.filter(isRedThree)
  if (redThrees.length > 0) return redThrees[0].id

  const rankGroups = groupByRank(hand)
  const teamRanks = new Set(teamBooks.map((b) => b.rank))

  const candidates = hand.filter((c) => !isRedThree(c))

  const scored = candidates.map((card) => {
    const penalty = cardPointValue(card)
    let discardScore = penalty

    if (isWildCard(card)) discardScore -= 80
    else {
      const sameRank = rankGroups.get(card.rank) ?? []
      if (sameRank.length >= 2) discardScore -= 40
      if (sameRank.length >= 3) discardScore -= 30
      if (teamRanks.has(card.rank)) discardScore -= 25
    }

    if (difficulty === 'normal' && Math.random() < 0.15) {
      discardScore += Math.random() * 12
    }

    return { card, discardScore }
  })

  scored.sort((a, b) => b.discardScore - a.discardScore)
  return scored[0].card.id
}

export { findAddToBookActions, findStartBookActions }
