import type { Card, Rank } from '../cards'
import { isRedThree, isWildCard } from '../cards'
import type { Book } from '../books'
import { bookWildCount, canAddToBook, canStartBook, countWildsInCards, naturalRank } from '../books'
import { sumCardPoints, cardPointValue } from '../scoring'

export type AiAction =
  | { type: 'startBook'; cardIds: string[]; score: number }
  | { type: 'addToBook'; bookId: string; cardIds: string[]; priority: number }
  | { type: 'discard'; cardId: string }

function combinations<T>(items: T[], min: number, max: number): T[][] {
  const results: T[][] = []

  function helper(start: number, combo: T[]) {
    if (combo.length >= min && combo.length <= max) {
      results.push([...combo])
    }
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
    const rank = card.rank
    const list = groups.get(rank) ?? []
    list.push(card)
    groups.set(rank, list)
  }
  return groups
}

function wildsInHand(hand: Card[]): Card[] {
  return hand.filter(isWildCard)
}

export function findStartBookActions(hand: Card[], teamBooks: Book[]): AiAction[] {
  const actions: AiAction[] = []
  const ranks = new Set<Rank>()
  const playable = hand.filter((c) => !isRedThree(c))

  for (const combo of combinations(playable, 3, Math.min(7, playable.length))) {
    const check = canStartBook(combo, teamBooks)
    if (!check.ok) continue
    if (ranks.has(check.rank)) continue
    ranks.add(check.rank)
    actions.push({
      type: 'startBook',
      cardIds: combo.map((c) => c.id),
      score: sumCardPoints(combo),
    })
  }

  return actions
}

export function findAddToBookActions(
  hand: Card[],
  teamBooks: Book[],
  isPlayingFoot = false,
  booksWithWildAddedThisTurn: string[] = [],
): Extract<AiAction, { type: 'addToBook' }>[] {
  if (isPlayingFoot && hand.length === 1) return []

  const actions: Extract<AiAction, { type: 'addToBook' }>[] = []
  const playable = hand.filter((c) => !isRedThree(c))

  for (const book of teamBooks) {
    for (const size of [1, 2, 3, 4]) {
      for (const combo of combinations(playable, size, size)) {
        const check = canAddToBook(book, combo, {
          wildAlreadyAddedThisTurn: booksWithWildAddedThisTurn.includes(book.id),
        })
        if (!check.ok) continue
        const newSize = book.cards.length + combo.length
        const wildsInCombo = countWildsInCards(combo)
        const bookIsClean = bookWildCount(book) === 0
        let priority =
          (newSize >= 7 ? 100 : newSize * 10) + combo.length
        if (bookIsClean && wildsInCombo > 0) {
          priority -= 800
        } else if (wildsInCombo === 0) {
          priority += 25
        }
        actions.push({
          type: 'addToBook',
          bookId: book.id,
          cardIds: combo.map((c) => c.id),
          priority,
        })
      }
    }
  }

  return actions.sort((a, b) => b.priority - a.priority)
}

export function pickDiscardCard(
  hand: Card[],
  difficulty: 'normal' | 'expert',
  goingOut: boolean,
): string {
  if (hand.length === 0) return ''
  if (goingOut) return hand[0].id

  const redThrees = hand.filter(isRedThree)
  if (redThrees.length > 0) return redThrees[0].id

  const ranked = hand
    .map((card) => ({
      card,
      penalty: isRedThree(card) ? 300 : cardPointValue(card),
      keep: isWildCard(card),
    }))
    .sort((a, b) => {
      if (a.keep !== b.keep) return a.keep ? 1 : -1
      return b.penalty - a.penalty
    })

  if (difficulty === 'normal' && Math.random() < 0.2) {
    const nonWild = hand.filter((c) => !isWildCard(c) && !isRedThree(c))
    if (nonWild.length > 0) {
      return nonWild[Math.floor(Math.random() * nonWild.length)].id
    }
  }

  return ranked[0].card.id
}

export function tableRanksSeen(books: Book[]): Set<Rank> {
  const seen = new Set<Rank>()
  for (const book of books) {
    seen.add(book.rank)
    for (const card of book.cards) {
      const rank = naturalRank(card)
      if (rank) seen.add(rank)
    }
  }
  return seen
}

export function rankStrengthInHand(hand: Card[], rank: Rank): number {
  return hand.filter((c) => c.rank === rank && !isRedThree(c)).length
}

export function bestStartBook(
  actions: AiAction[],
  hand: Card[],
  allBooks: Book[],
  difficulty: 'normal' | 'expert',
  needPoints: number,
): AiAction | null {
  const starts = actions.filter((a) => a.type === 'startBook') as Extract<
    AiAction,
    { type: 'startBook' }
  >[]
  if (starts.length === 0) return null

  const seen = tableRanksSeen(allBooks)

  const scored = starts.map((action) => {
    const rank = hand.find((c) => action.cardIds.includes(c.id) && !isWildCard(c))?.rank
    let value = action.score
    if (rank) {
      value += rankStrengthInHand(hand, rank) * 5
      if (difficulty === 'expert' && !seen.has(rank)) value += 8
    }
    if (action.score >= needPoints) value += 50
    return { action, value }
  })

  scored.sort((a, b) => b.value - a.value)

  if (difficulty === 'normal' && Math.random() < 0.15 && scored.length > 1) {
    return scored[1].action
  }

  return scored[0].action
}

export function bestAddToBook(
  actions: Extract<AiAction, { type: 'addToBook' }>[],
  difficulty: 'normal' | 'expert',
): Extract<AiAction, { type: 'addToBook' }> | null {
  if (actions.length === 0) return null

  if (difficulty === 'normal' && Math.random() < 0.1) return null

  return actions[0]
}

export { groupByRank, wildsInHand }
