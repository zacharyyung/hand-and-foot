import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import type { Card } from './cards'
import type { GameState } from './deal'
import type { Book } from './books'
import {
  bookFlightAnchor,
  handFlightAnchor,
  prefersReducedCardMotion,
  seatFlightAnchor,
  stagingBookAnchor,
  type FlightAnchor,
} from './flightAnchors'
import type { CardMotionKind } from './cardMotion'

export interface CardFlightRequest {
  cards: Card[]
  from: FlightAnchor
  to: FlightAnchor
  kind: CardMotionKind
  faceDown?: boolean
  bookLayout?: {
    totalCards: number
    incomingCards: number
    stacked?: boolean
  }
}

export interface ActiveCardFlight extends CardFlightRequest {
  flightId: string
  duration: number
  delay: number
  targetRotation?: number
}

const FLIGHT_DURATION: Record<CardMotionKind, number> = {
  draw: 220,
  place: 250,
  discard: 220,
}

/** Hand fan spread — keep in sync with draw flight duration. */
export const HAND_LAYOUT_MS = FLIGHT_DURATION.draw

const GROUP_STAGGER_MS = 55
const DRAW_STAGGER_MS = 48

function findCardInHands(
  game: GameState,
  cardId: string,
): { card: Card; seat: number } | null {
  for (let seat = 0; seat < game.players.length; seat++) {
    const card = game.players[seat].hand.find((c) => c.id === cardId)
    if (card) return { card, seat }
  }
  return null
}

function findPrevBook(prev: GameState, bookId: string): Book | undefined {
  for (const team of prev.teams) {
    const book = team.books.find((b) => b.id === bookId)
    if (book) return book
  }
  return undefined
}

function sourceAnchorForSeat(
  seat: number,
  viewerSeat: number,
  isHumanViewer: boolean,
  cardId: string,
  stagedCardIds: Set<string>,
  stagingFlightIdsRef: RefObject<Set<string>>,
  stagingBookIdByCardRef: RefObject<Map<string, string>>,
): FlightAnchor {
  const fromStaging =
    stagedCardIds.has(cardId) || stagingFlightIdsRef.current?.has(cardId)
  if (fromStaging && seat === viewerSeat && isHumanViewer) {
    const stagedBookId = stagingBookIdByCardRef.current?.get(cardId)
    if (stagedBookId) return stagingBookAnchor(stagedBookId)
    return 'staging'
  }
  if (seat === viewerSeat && isHumanViewer) return handFlightAnchor(cardId)
  return seatFlightAnchor(seat)
}

/** Merge same-route flights so a staged book moves as one stack, not N glitches. */
function groupFlightRequests(requests: CardFlightRequest[]): CardFlightRequest[] {
  const groups = new Map<string, Card[]>()
  const meta = new Map<
    string,
    { from: FlightAnchor; to: FlightAnchor; kind: CardMotionKind; faceDown?: boolean }
  >()

  for (const request of requests) {
    if (request.cards.length === 0) continue
    const key = `${request.from}|${request.to}|${request.kind}|${request.faceDown ? 'back' : 'face'}`
    const existing = groups.get(key) ?? []
    groups.set(key, [...existing, ...request.cards])
    meta.set(key, {
      from: request.from,
      to: request.to,
      kind: request.kind,
      faceDown: request.faceDown,
    })
  }

  return [...groups.entries()].map(([key, cards]) => {
    const info = meta.get(key)!
    return {
      cards,
      from: info.from,
      to: info.to,
      kind: info.kind,
      faceDown: info.faceDown,
    }
  })
}

export function useCardFlightSystem(
  game: GameState,
  viewerSeat: number,
  options: {
    isHumanViewer: boolean
    stagedCardIds: Set<string>
    stagingFlightIdsRef: RefObject<Set<string>>
    stagingBookIdByCardRef: RefObject<Map<string, string>>
  },
) {
  const { isHumanViewer, stagedCardIds, stagingFlightIdsRef, stagingBookIdByCardRef } =
    options
  const [flights, setFlights] = useState<ActiveCardFlight[]>([])
  const [inFlightIds, setInFlightIds] = useState<Set<string>>(() => new Set())
  const flightsRef = useRef(flights)
  flightsRef.current = flights
  const prevGameRef = useRef<GameState | null>(null)
  const flightSeq = useRef(0)
  const flightCardIdsRef = useRef<Set<string>>(new Set())
  const stagedCardIdsRef = useRef(stagedCardIds)
  stagedCardIdsRef.current = stagedCardIds

  const enqueueFlights = useCallback((requests: CardFlightRequest[]) => {
    const grouped = groupFlightRequests(requests).filter(
      (request) => !request.cards.some((card) => flightCardIdsRef.current.has(card.id)),
    )
    if (grouped.length === 0) return
    if (prefersReducedCardMotion()) return

    const batch = grouped.map((request, groupIndex) => {
      const drawIndex =
        request.kind === 'draw'
          ? grouped.slice(0, groupIndex).filter((r) => r.kind === 'draw').length
          : 0
      return {
        ...request,
        flightId: `flight-${flightSeq.current++}-${request.cards.map((c) => c.id).join('-')}`,
        duration: FLIGHT_DURATION[request.kind],
        delay:
          request.kind === 'draw'
            ? drawIndex * DRAW_STAGGER_MS
            : groupIndex * GROUP_STAGGER_MS,
      }
    })

    for (const flight of batch) {
      for (const card of flight.cards) flightCardIdsRef.current.add(card.id)
    }

    setFlights((prev) => [...prev, ...batch])
    setInFlightIds((prev) => {
      const next = new Set(prev)
      for (const flight of batch) {
        for (const card of flight.cards) next.add(card.id)
      }
      return next
    })
  }, [])

  const settleFlight = useCallback((flightId: string) => {
    const flight = flightsRef.current.find((f) => f.flightId === flightId)
    if (!flight) return
    for (const card of flight.cards) flightCardIdsRef.current.delete(card.id)
    setInFlightIds((ids) => {
      const next = new Set(ids)
      for (const card of flight.cards) next.delete(card.id)
      return next
    })
    setFlights((prev) => prev.filter((f) => f.flightId !== flightId))
  }, [])

  const isCardInFlight = useCallback(
    (cardId: string) => inFlightIds.has(cardId),
    [inFlightIds],
  )

  useEffect(() => {
    const prev = prevGameRef.current
    prevGameRef.current = game
    if (!prev) return
    if (prev === game) return

    const requests: CardFlightRequest[] = []
    const stagedIds = stagedCardIdsRef.current

    if (game.discard.length > prev.discard.length) {
      const card = game.discard[game.discard.length - 1]
      const source = findCardInHands(prev, card.id)
      if (source) {
        requests.push({
          cards: [card],
          from: sourceAnchorForSeat(
            source.seat,
            viewerSeat,
            isHumanViewer,
            card.id,
            stagedIds,
            stagingFlightIdsRef,
            stagingBookIdByCardRef,
          ),
          to: 'discard',
          kind: 'discard',
        })
      }
    }

    for (const team of game.teams) {
      for (const book of team.books) {
        const prevBook = findPrevBook(prev, book.id)
        const prevIds = new Set(prevBook?.cards.map((c) => c.id) ?? [])
        const added = book.cards.filter((c) => !prevIds.has(c.id))
        if (added.length === 0) continue

        const source = findCardInHands(prev, added[0].id)
        const fromSeat = source?.seat ?? book.startedBySeatIndex
        requests.push({
          cards: added,
          from: sourceAnchorForSeat(
            fromSeat,
            viewerSeat,
            isHumanViewer,
            added[0].id,
            stagedIds,
            stagingFlightIdsRef,
            stagingBookIdByCardRef,
          ),
          to: bookFlightAnchor(book.id),
          kind: 'place',
        })
      }
    }

    const prevHandIds = new Set(prev.players[viewerSeat]?.hand.map((c) => c.id) ?? [])
    const drawn =
      game.players[viewerSeat]?.hand.filter((c) => !prevHandIds.has(c.id)) ?? []
    if (drawn.length > 0 && drawn.length <= 4) {
      for (const card of drawn) {
        requests.push({
          cards: [card],
          from: 'stock',
          to: handFlightAnchor(card.id),
          kind: 'draw',
        })
      }
    }

    for (const [seat, player] of game.players.entries()) {
      if (seat === viewerSeat) continue
      const prevHand = new Set(prev.players[seat]?.hand.map((c) => c.id) ?? [])
      const gained = player.hand.filter((c) => !prevHand.has(c.id))
      if (gained.length > 0 && gained.length <= 4 && prev.stock.length > game.stock.length) {
        requests.push({
          cards: gained,
          from: 'stock',
          to: seatFlightAnchor(seat),
          kind: 'draw',
          faceDown: true,
        })
      }
    }

    if (requests.length > 0) {
      enqueueFlights(requests)
      if (stagingFlightIdsRef.current) {
        stagingFlightIdsRef.current.clear()
      }
    }
  }, [
    game,
    viewerSeat,
    isHumanViewer,
    stagingFlightIdsRef,
    stagingBookIdByCardRef,
    enqueueFlights,
  ])

  const queueLocalFlights = useCallback(
    (items: CardFlightRequest[]) => {
      enqueueFlights(items)
    },
    [enqueueFlights],
  )

  return {
    flights,
    settleFlight,
    isCardInFlight,
    queueLocalFlights,
  }
}
