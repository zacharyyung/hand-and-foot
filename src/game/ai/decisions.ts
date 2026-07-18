import type { Card, Rank } from '../cards'
import { isRedThree, isWildCard } from '../cards'
import type { Book } from '../books'
import { bookWildCount, canAddToBook, canStartBook, countWildsInCards, naturalRank } from '../books'
import { footMeldAllowedForHand } from '../actions'
import { cardPointValue, meldContributionFromCards } from '../scoring'

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

function footMeldKeepsDiscard(
  hand: Card[],
  meldCardIds: string[],
  isPlayingFoot: boolean,
  booksAfterMeld: Book[],
  meldThresholdMetAfterMeld: boolean,
): boolean {
  return footMeldAllowedForHand(
    hand,
    meldCardIds,
    isPlayingFoot,
    booksAfterMeld,
    meldThresholdMetAfterMeld,
  )
}

export function findStartBookActions(
  hand: Card[],
  teamBooks: Book[],
  isPlayingFoot = false,
  meldThresholdMet = true,
): AiAction[] {
  const actions: AiAction[] = []
  const ranks = new Set<Rank>()
  const playable = hand.filter((c) => !isRedThree(c))

  for (const combo of combinations(playable, 3, Math.min(7, playable.length))) {
    const cardIds = combo.map((c) => c.id)
    const check = canStartBook(combo, teamBooks)
    if (!check.ok) continue
    const projectedBook: Book = {
      id: `preview-${check.rank}`,
      rank: check.rank,
      cards: combo,
      teamId: teamBooks[0]?.teamId ?? 0,
      startedBySeatIndex: 0,
    }
    if (
      !footMeldKeepsDiscard(
        hand,
        cardIds,
        isPlayingFoot,
        [...teamBooks, projectedBook],
        meldThresholdMet,
      )
    ) {
      continue
    }
    if (ranks.has(check.rank)) continue
    ranks.add(check.rank)
    actions.push({
      type: 'startBook',
      cardIds: combo.map((c) => c.id),
      score: meldContributionFromCards(combo),
    })
  }

  return actions
}

export function findAddToBookActions(
  hand: Card[],
  teamBooks: Book[],
  isPlayingFoot = false,
  booksWithWildAddedThisTurn: string[] = [],
  meldThresholdMet = true,
): Extract<AiAction, { type: 'addToBook' }>[] {
  const actions: Extract<AiAction, { type: 'addToBook' }>[] = []
  const playable = hand.filter((c) => !isRedThree(c))

  for (const book of teamBooks) {
    for (const size of [1, 2, 3, 4]) {
      for (const combo of combinations(playable, size, size)) {
        const cardIds = combo.map((c) => c.id)
        const check = canAddToBook(book, combo, {
          wildAlreadyAddedThisTurn: booksWithWildAddedThisTurn.includes(book.id),
        })
        if (!check.ok) continue
        const updatedBook = { ...book, cards: [...book.cards, ...combo] }
        if (
          !footMeldKeepsDiscard(
            hand,
            cardIds,
            isPlayingFoot,
            teamBooks.map((b) => (b.id === book.id ? updatedBook : b)),
            meldThresholdMet,
          )
        ) {
          continue
        }
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
  _teamBooks: Book[],
  _difficulty: 'normal' | 'expert',
  goingOut: boolean,
): string {
  if (hand.length === 0) return ''
  if (goingOut) {
    const naturals = hand.filter((c) => !isWildCard(c) && !isRedThree(c))
    if (naturals.length > 0) {
      return naturals.sort((a, b) => cardPointValue(b) - cardPointValue(a))[0].id
    }
    const deuces = hand.filter((c) => c.rank === '2')
    if (deuces.length > 0) return deuces[0].id
    return hand[0].id
  }

  const redThrees = hand.filter(isRedThree)
  if (redThrees.length > 0) return redThrees[0].id

  const wilds = hand.filter((c) => isWildCard(c) && !isRedThree(c))
  const jokers = wilds.filter((c) => c.rank === 'Joker')
  const deuces = wilds.filter((c) => c.rank === '2')
  const naturals = hand.filter((c) => !isWildCard(c) && !isRedThree(c))

  if (naturals.length > 0) {
    return naturals.sort((a, b) => cardPointValue(b) - cardPointValue(a))[0].id
  }

  if (deuces.length > 0) {
    return deuces.sort((a, b) => cardPointValue(a) - cardPointValue(b))[0].id
  }

  if (jokers.length >= 3) {
    return jokers[0].id
  }

  if (jokers.length > 0) {
    return jokers[0].id
  }

  return hand[0].id
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
