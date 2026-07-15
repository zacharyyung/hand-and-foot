import type { Card, Rank } from '../cards'
import { isRedThree, isWildCard } from '../cards'
import type { Book } from '../books'
import { canStartBook, isCleanBook, isDirtyBook } from '../books'
import { sumCardPoints, cardPointValue, meldThreshold } from '../scoring'
import type { AiDifficulty } from '../deal'
import { findAddToBookActions, findStartBookActions } from './decisions'

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
): string[][] | null {
  const options = getStartOptions(hand, teamBooks)
  if (options.length === 0) return null

  const scoreOption = (opt: StartOption) => {
    let s = opt.score
    if (urgency === 'high') s += 20
    if (urgency === 'low' && opt.clean) s += 15
    if (urgency !== 'high' && !opt.clean) s += 8
    return s
  }

  const sorted = [...options].sort((a, b) => scoreOption(b) - scoreOption(a))

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

    if (needsDirty && !opt.clean) value += urgency === 'low' ? 25 : 15
    if (needsClean && opt.clean) value += urgency === 'low' ? 20 : 10
    if (urgency === 'high') value += opt.score * 0.5

    return { opt, value }
  })

  scored.sort((a, b) => b.value - a.value)

  if (difficulty === 'easy' && Math.random() < 0.15 && scored.length > 1) {
    return scored[1].opt.cardIds
  }

  return scored[0].opt.cardIds
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

    if (difficulty === 'easy' && Math.random() < 0.2) {
      discardScore += Math.random() * 15
    }

    return { card, discardScore }
  })

  scored.sort((a, b) => b.discardScore - a.discardScore)
  return scored[0].card.id
}

export { findAddToBookActions, findStartBookActions }
