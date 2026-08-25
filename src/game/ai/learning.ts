import type { Card, Rank } from '../cards'
import { isRedThree, isWildCard } from '../cards'
import type { Book } from '../books'
import { isCleanBook, isDirtyBook, bookWildCount } from '../books'
import type { AiDifficulty, GameState } from '../deal'
import { getTeam } from '../actions'
import { cardPointValue, meldContributionFromCards, meldThreshold } from '../scoring'
import { buildAiPublicState } from './publicState'
import { findAddToBookActions } from './decisions'

const LEARNING_KEY = 'hand-and-foot-ai-lessons'
const LEARNING_VERSION = 4
const MAX_EPISODE_STATES = 800
const MAX_LESSON_LOG = 60
const MAX_FINDINGS_PER_LESSON = 12

/** Each defeat applies tallies this many times — lessons compound quickly. */
const TURBO_TALLY_MULTIPLIER = 3
/** Extra weight when a human player was on the winning team. */
const HUMAN_BEAT_MULTIPLIER = 1.75
/** Opponent success signals from omniscient post-game review. */
const OPPONENT_SUCCESS_MULTIPLIER = 2.5
/** Sample events needed for full knob strength (was 24). */
const STRENGTH_SAMPLE_TARGET = 8
/** Flat ramp from defeats alone — one loss should already tighten play. */
const DEFEAT_STRENGTH_PER_LOSS = 0.14
const MAX_DEFEAT_STRENGTH_BONUS = 0.56

/**
 * Strategy knobs derived from post-defeat analysis.
 * Values are 0–1; 0.5 is neutral. Expert play biases toward extremes with sample size.
 */
export interface LearnedPreferences {
  /** Lay the opening meld as soon as it is legal. */
  earlyMeldAggressiveness: number
  /** Prefer keeping books clean / avoid dirtying without need. */
  cleanBias: number
  /** Prefer starting larger (4–7) books when points allow. */
  largeBookBias: number
  /** Avoid discarding from pairs / triples. */
  protectPairs: number
  /** Prefer adding to existing team books before starting new ones. */
  buildExistingBias: number
  /** Avoid discarding ranks opponents already have on the table. */
  avoidFeedingOpponents: number
  /** Dump high-point cards / finish books when racing the stock. */
  raceUrgency: number
  /** How many defeat lessons have shaped these knobs. */
  defeatsAnalyzed: number
  sampleSize: number
}

interface LessonTallies {
  missedOpenings: number
  openingChances: number
  pairBreaks: number
  safeDiscardChances: number
  fedOpponents: number
  discardChoices: number
  discardedTeamRank: number
  dirtyOnlyClean: number
  wildOnCleanChances: number
  missedCompletions: number
  completionChances: number
  lateHighHolds: number
  lateRounds: number
  lostRaces: number
  raceRounds: number
  /** Had a legal meld add but discarded / passed instead. */
  sandbaggedMelds: number
  sandbagTurns: number
  /** Winning opponents opened early when legal (omniscient review). */
  opponentEarlyOpens: number
  opponentOpenChances: number
  /** Winning opponents discarded safely — no feed, no pair break. */
  opponentSafeDiscards: number
  opponentDiscardSamples: number
  /** Winning opponents melded instead of passing when a meld was legal. */
  opponentMeldedInstead: number
  opponentMeldTurns: number
  /** Winning team went out holding few cards. */
  opponentEfficientGoOuts: number
}

export interface DefeatLesson {
  at: number
  roundNumber: number
  losingTeamId: number
  /** What our expert team did wrong. */
  findings: string[]
  /** What winning opponents did well (omniscient post-game review). */
  opponentFindings: string[]
  winningTeamIds: number[]
}

export interface AiLessonMemory {
  version: number
  defeatsAnalyzed: number
  tallies: LessonTallies
  lessons: DefeatLesson[]
  updatedAt: number
}

/** In-memory full-state episode for post-game omniscient review only. */
let episode: GameState[] = []
let cached: AiLessonMemory | null = null
let lastAnalyzedKey: string | null = null

function analysisKey(state: GameState, losingTeamId: number): string {
  return `${state.roundNumber}:${state.phase}:${losingTeamId}:${state.wentOutTeamId}:${state.winnerTeamId}`
}

function emptyTallies(): LessonTallies {
  return {
    missedOpenings: 0,
    openingChances: 0,
    pairBreaks: 0,
    safeDiscardChances: 0,
    fedOpponents: 0,
    discardChoices: 0,
    discardedTeamRank: 0,
    dirtyOnlyClean: 0,
    wildOnCleanChances: 0,
    missedCompletions: 0,
    completionChances: 0,
    lateHighHolds: 0,
    lateRounds: 0,
    lostRaces: 0,
    raceRounds: 0,
    sandbaggedMelds: 0,
    sandbagTurns: 0,
    opponentEarlyOpens: 0,
    opponentOpenChances: 0,
    opponentSafeDiscards: 0,
    opponentDiscardSamples: 0,
    opponentMeldedInstead: 0,
    opponentMeldTurns: 0,
    opponentEfficientGoOuts: 0,
  }
}

function migrateMemory(parsed: AiLessonMemory): AiLessonMemory {
  const base = emptyMemory()
  if (parsed.version === LEARNING_VERSION) {
    return {
      ...base,
      ...parsed,
      tallies: { ...base.tallies, ...parsed.tallies },
      lessons: normalizeLessons(parsed.lessons),
    }
  }
  if (parsed.version === 3 || parsed.version === 2) {
    const t = { ...base.tallies, ...parsed.tallies }
    if (parsed.version === 2) {
      for (const key of Object.keys(t) as (keyof LessonTallies)[]) {
        t[key] = Math.round(t[key] * 2)
      }
    }
    return {
      ...base,
      version: LEARNING_VERSION,
      defeatsAnalyzed: parsed.defeatsAnalyzed ?? 0,
      tallies: t,
      lessons: normalizeLessons(parsed.lessons),
      updatedAt: parsed.updatedAt ?? Date.now(),
    }
  }
  return base
}

function normalizeLessons(lessons: DefeatLesson[] | undefined): DefeatLesson[] {
  if (!Array.isArray(lessons)) return []
  return lessons.slice(-MAX_LESSON_LOG).map((lesson) => ({
    ...lesson,
    opponentFindings: lesson.opponentFindings ?? [],
    winningTeamIds: lesson.winningTeamIds ?? [],
  }))
}

function emptyMemory(): AiLessonMemory {
  return {
    version: LEARNING_VERSION,
    defeatsAnalyzed: 0,
    tallies: emptyTallies(),
    lessons: [],
    updatedAt: Date.now(),
  }
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n))
}

function ratio(num: number, den: number, fallback: number): number {
  if (den <= 0) return fallback
  return clamp01(num / den)
}

export function loadAiLessons(): AiLessonMemory {
  if (cached) return cached
  try {
    const raw = localStorage.getItem(LEARNING_KEY)
    if (!raw) {
      cached = emptyMemory()
      return cached
    }
    const parsed = JSON.parse(raw) as AiLessonMemory
    if (!parsed || (parsed.version !== LEARNING_VERSION && parsed.version !== 3 && parsed.version !== 2)) {
      cached = emptyMemory()
      return cached
    }
    cached = migrateMemory(parsed)
    return cached
  } catch {
    cached = emptyMemory()
    return cached
  }
}

export function saveAiLessons(memory: AiLessonMemory): void {
  cached = { ...memory, updatedAt: Date.now() }
  try {
    localStorage.setItem(LEARNING_KEY, JSON.stringify(cached))
  } catch {
    // ignore quota / private mode
  }
}

export function resetAiLessons(): void {
  cached = emptyMemory()
  episode = []
  lastAnalyzedKey = null
  try {
    localStorage.removeItem(LEARNING_KEY)
  } catch {
    // ignore
  }
}

/** Append a game snapshot for later defeat analysis (not used during live decisions). */
export function recordEpisodeState(state: GameState): void {
  if (episode.length > 0) {
    const last = episode[episode.length - 1]!
    if (last === state) return
    if (
      last.phase === state.phase &&
      last.currentPlayerIndex === state.currentPlayerIndex &&
      last.turnPhase === state.turnPhase &&
      last.stock.length === state.stock.length &&
      last.discard.length === state.discard.length &&
      last.meldPointsThisTurn === state.meldPointsThisTurn
    ) {
      const sameHands = state.players.every((p, i) => {
        const prev = last.players[i]!
        return (
          prev.hand.length === p.hand.length &&
          prev.foot.length === p.foot.length &&
          prev.isPlayingFoot === p.isPlayingFoot
        )
      })
      const sameBooks = state.teams.every((t, i) => {
        const prev = last.teams[i]!
        return (
          prev.books.length === t.books.length &&
          prev.books.every(
            (b, bi) => b.cards.length === (prev.books[bi]?.cards.length ?? -1),
          )
        )
      })
      if (sameHands && sameBooks) return
    }
  }
  episode.push(state)
  if (episode.length > MAX_EPISODE_STATES) {
    episode = episode.slice(-MAX_EPISODE_STATES)
  }
}

export function clearEpisode(): void {
  episode = []
}

export function getEpisodeStates(): GameState[] {
  return [...episode]
}

/** Test helper — replace the in-memory episode. */
export function setEpisodeStatesForTest(states: GameState[]): void {
  episode = [...states]
}

export function getLearnedPreferences(
  memory: AiLessonMemory = loadAiLessons(),
): LearnedPreferences {
  const t = memory.tallies
  const sampleSize =
    t.openingChances +
    t.discardChoices +
    t.wildOnCleanChances +
    t.completionChances +
    t.lateRounds +
    t.raceRounds +
    t.sandbagTurns +
    t.opponentOpenChances +
    t.opponentDiscardSamples +
    t.opponentMeldTurns

  const defeatBoost = Math.min(
    MAX_DEFEAT_STRENGTH_BONUS,
    memory.defeatsAnalyzed * DEFEAT_STRENGTH_PER_LOSS,
  )

  const opponentOpenRate = ratio(
    t.opponentEarlyOpens,
    Math.max(1, t.opponentOpenChances),
    0,
  )
  const opponentSafeDiscardRate = ratio(
    t.opponentSafeDiscards,
    Math.max(1, t.opponentDiscardSamples),
    0,
  )
  const opponentMeldRate = ratio(
    t.opponentMeldedInstead,
    Math.max(1, t.opponentMeldTurns),
    0,
  )
  const opponentGoOutBoost = clamp01(t.opponentEfficientGoOuts * 0.18)

  return {
    earlyMeldAggressiveness: clamp01(
      0.52 +
        ratio(t.missedOpenings, Math.max(1, t.openingChances), 0) * 0.48 +
        ratio(t.sandbaggedMelds, Math.max(1, t.sandbagTurns), 0) * 0.2 +
        opponentOpenRate * 0.28 +
        defeatBoost * 0.15,
    ),
    cleanBias: clamp01(
      0.52 +
        ratio(t.dirtyOnlyClean, Math.max(1, t.wildOnCleanChances), 0) * 0.48,
    ),
    largeBookBias: clamp01(
      0.42 +
        ratio(t.missedCompletions, Math.max(1, t.completionChances), 0) * 0.45 +
        ratio(t.sandbaggedMelds, Math.max(1, t.sandbagTurns), 0) * 0.15 +
        opponentMeldRate * 0.2,
    ),
    protectPairs: clamp01(
      0.52 +
        ratio(t.pairBreaks, Math.max(1, t.safeDiscardChances), 0) * 0.48 +
        opponentSafeDiscardRate * 0.22,
    ),
    buildExistingBias: clamp01(
      0.48 +
        ratio(t.discardedTeamRank, Math.max(1, t.discardChoices), 0) * 0.45 +
        ratio(t.sandbaggedMelds, Math.max(1, t.sandbagTurns), 0) * 0.12 +
        opponentMeldRate * 0.18,
    ),
    avoidFeedingOpponents: clamp01(
      0.52 +
        ratio(t.fedOpponents, Math.max(1, t.discardChoices), 0) * 0.48 +
        opponentSafeDiscardRate * 0.32 +
        defeatBoost * 0.12,
    ),
    raceUrgency: clamp01(
      0.48 +
        ratio(t.lostRaces, Math.max(1, t.raceRounds), 0) * 0.38 +
        ratio(t.lateHighHolds, Math.max(1, t.lateRounds), 0) * 0.32 +
        opponentGoOutBoost +
        defeatBoost * 0.2,
    ),
    defeatsAnalyzed: memory.defeatsAnalyzed,
    sampleSize,
  }
}

export function learningStrength(
  sampleSize: number,
  difficulty: AiDifficulty,
  defeatsAnalyzed = 0,
): number {
  const ramp = clamp01(sampleSize / STRENGTH_SAMPLE_TARGET)
  const defeatBoost = Math.min(
    MAX_DEFEAT_STRENGTH_BONUS,
    defeatsAnalyzed * DEFEAT_STRENGTH_PER_LOSS,
  )
  if (difficulty === 'expert') {
    return Math.min(1, ramp * 1.35 + defeatBoost)
  }
  return Math.min(0.72, ramp * 0.55 + defeatBoost * 0.45)
}

function findSeatThatActed(prev: GameState, next: GameState): number | null {
  if (prev.currentPlayerIndex !== next.currentPlayerIndex) {
    return prev.currentPlayerIndex
  }
  if (
    prev.turnPhase !== next.turnPhase ||
    prev.meldPointsThisTurn !== next.meldPointsThisTurn
  ) {
    return prev.currentPlayerIndex
  }
  for (let i = 0; i < prev.players.length; i++) {
    const before = prev.players[i]!
    const after = next.players[i]!
    if (
      before.hand.length !== after.hand.length ||
      before.foot.length !== after.foot.length
    ) {
      return i
    }
  }
  return prev.currentPlayerIndex
}

function opponentRanksOnTable(state: GameState, myTeamId: number): Set<Rank> {
  const ranks = new Set<Rank>()
  for (const team of state.teams) {
    if (team.id === myTeamId) continue
    for (const book of team.books) ranks.add(book.rank)
  }
  return ranks
}

function teamRanks(books: Book[]): Set<Rank> {
  return new Set(books.map((b) => b.rank))
}

function onlyCompletedClean(books: Book[]): boolean {
  const cleans = books.filter((b) => b.cards.length >= 7 && isCleanBook(b))
  const dirties = books.filter((b) => b.cards.length >= 7 && isDirtyBook(b))
  return cleans.length === 1 && dirties.length === 0
}

function hasDirtyWildSink(books: Book[]): boolean {
  return books.some((b) => !isCleanBook(b) && bookWildCount(b) < 2)
}

function couldCompleteBook(hand: Card[], books: Book[]): boolean {
  for (const book of books) {
    if (book.cards.length < 6 || book.cards.length >= 7) continue
    const need = 7 - book.cards.length
    if (isCleanBook(book)) {
      const naturals = hand.filter(
        (c) => c.rank === book.rank && !isWildCard(c) && !isRedThree(c),
      )
      if (naturals.length >= need) return true
    } else {
      const naturals = hand.filter(
        (c) => c.rank === book.rank && !isWildCard(c) && !isRedThree(c),
      )
      const wilds = hand.filter((c) => isWildCard(c) && !isRedThree(c))
      if (naturals.length + Math.min(wilds.length, 2 - bookWildCount(book)) >= need) {
        return true
      }
    }
  }
  return false
}

function singletonNaturals(hand: Card[]): Card[] {
  const counts = new Map<Rank, Card[]>()
  for (const card of hand) {
    if (isWildCard(card) || isRedThree(card)) continue
    const list = counts.get(card.rank) ?? []
    list.push(card)
    counts.set(card.rank, list)
  }
  return [...counts.values()].filter((g) => g.length === 1).map((g) => g[0]!)
}

/**
 * Lightweight opening check used only in post-defeat analysis.
 * Avoids importing strategy.ts (which consumes learned prefs) — no cycle.
 */
function roughCanMeetOpening(hand: Card[], required: number): boolean {
  const groups = new Map<Rank, Card[]>()
  const wilds: Card[] = []
  for (const card of hand) {
    if (isRedThree(card)) continue
    if (isWildCard(card)) {
      wilds.push(card)
      continue
    }
    const list = groups.get(card.rank) ?? []
    list.push(card)
    groups.set(card.rank, list)
  }

  const bookScores: number[] = []
  let wildIdx = 0
  for (const cards of groups.values()) {
    if (cards.length >= 3) {
      bookScores.push(meldContributionFromCards(cards))
      continue
    }
    if (cards.length === 2 && wildIdx < wilds.length) {
      bookScores.push(meldContributionFromCards([...cards, wilds[wildIdx]!]))
      wildIdx += 1
    }
  }
  bookScores.sort((a, b) => b - a)
  let total = 0
  for (const score of bookScores) {
    total += score
    if (total >= required) return true
  }
  return false
}

interface AnalysisScratch {
  tallies: LessonTallies
  findings: string[]
  opponentFindings: string[]
}

function note(scratch: AnalysisScratch, finding: string): void {
  if (!scratch.findings.includes(finding)) scratch.findings.push(finding)
}

function noteOpponent(scratch: AnalysisScratch, finding: string): void {
  if (!scratch.opponentFindings.includes(finding)) scratch.opponentFindings.push(finding)
}

function playerLabel(player: GameState['players'][number]): string {
  if (player.profile.isHuman) return 'Human opponent'
  const diff = player.profile.aiDifficulty ?? 'normal'
  return diff === 'expert' ? 'Expert opponent' : 'Opponent AI'
}

function teamMelded(prev: GameState, next: GameState, teamId: number): boolean {
  const prevTeam = getTeam(prev, teamId)
  const nextTeam = getTeam(next, teamId)
  if (nextTeam.books.length > prevTeam.books.length) return true
  if (next.meldPointsThisTurn > prev.meldPointsThisTurn && next.currentPlayerIndex === prev.currentPlayerIndex) {
    return true
  }
  return nextTeam.books.some((book) => {
    const prevBook = prevTeam.books.find((b) => b.id === book.id)
    return prevBook != null && book.cards.length > prevBook.cards.length
  })
}

/** Omniscient review: winning player opened when they could. */
function analyzeSuccessfulOpening(
  prev: GameState,
  next: GameState,
  seat: number,
  scratch: AnalysisScratch,
): void {
  const player = prev.players[seat]!
  const team = getTeam(prev, player.profile.teamId)
  if (team.meldThresholdMet) return
  if (prev.turnPhase !== 'play') return

  const required = meldThreshold(team.score)
  if (!roughCanMeetOpening(player.hand, required)) return

  scratch.tallies.opponentOpenChances += 1
  const nextTeam = getTeam(next, player.profile.teamId)
  const opened =
    nextTeam.meldThresholdMet ||
    nextTeam.books.length > team.books.length ||
    teamMelded(prev, next, player.profile.teamId)
  if (opened) {
    scratch.tallies.opponentEarlyOpens += 1
    noteOpponent(
      scratch,
      `${playerLabel(player)} opened the meld requirement early — match that pace.`,
    )
  }
}

/** Omniscient review: winning player discarded safely. */
function analyzeSuccessfulDiscard(
  prev: GameState,
  next: GameState,
  seat: number,
  scratch: AnalysisScratch,
): void {
  if (next.discard.length <= prev.discard.length) return
  const discarded = next.discard[next.discard.length - 1]
  if (!discarded) return

  const player = prev.players[seat]!
  const hand = player.hand
  scratch.tallies.opponentDiscardSamples += 1

  let safe = true
  const sameRank = hand.filter(
    (c) =>
      c.rank === discarded.rank && !isWildCard(c) && !isRedThree(c) && c.id !== discarded.id,
  ).length
  const singles = singletonNaturals(hand).filter((c) => c.id !== discarded.id)
  if (!isWildCard(discarded) && !isRedThree(discarded) && sameRank >= 1 && singles.length > 0) {
    safe = false
  }

  const oppRanks = opponentRanksOnTable(prev, player.profile.teamId)
  if (!isWildCard(discarded) && oppRanks.has(discarded.rank)) {
    const safer = hand.find(
      (c) =>
        c.id !== discarded.id &&
        !isWildCard(c) &&
        !isRedThree(c) &&
        !oppRanks.has(c.rank),
    )
    if (safer) safe = false
  }

  if (safe) {
    scratch.tallies.opponentSafeDiscards += 1
    noteOpponent(
      scratch,
      `${playerLabel(player)} discarded safely — avoid feeding and breaking pairs.`,
    )
  }
}

/** Omniscient review: winning player melded when a meld was legal. */
function analyzeSuccessfulMeld(
  prev: GameState,
  next: GameState,
  seat: number,
  scratch: AnalysisScratch,
): void {
  const player = prev.players[seat]!
  const team = getTeam(prev, player.profile.teamId)
  if (!team.meldThresholdMet) return
  if (prev.turnPhase !== 'play') return

  const adds = findAddToBookActions(
    player.hand,
    team.books,
    player.isPlayingFoot,
    prev.booksWithWildAddedThisTurn,
    team.meldThresholdMet,
  )
  if (adds.length === 0) return

  scratch.tallies.opponentMeldTurns += 1
  if (teamMelded(prev, next, player.profile.teamId)) {
    scratch.tallies.opponentMeldedInstead += 1
    noteOpponent(
      scratch,
      `${playerLabel(player)} melded down instead of holding cards — play faster.`,
    )
  }
}

function analyzeWinningTeamEndState(
  endState: GameState,
  winningTeamId: number,
  scratch: AnalysisScratch,
): void {
  if (endState.wentOutTeamId !== winningTeamId) return

  const held = endState.players
    .filter((p) => p.profile.teamId === winningTeamId)
    .flatMap((p) => [...p.hand, ...p.foot])
  const highHeld = held.filter((c) => !isRedThree(c) && cardPointValue(c) >= 20)

  if (held.length <= 3 && highHeld.length === 0) {
    scratch.tallies.opponentEfficientGoOuts += 1
    noteOpponent(
      scratch,
      'Winning team went out efficiently — race harder when opponents are low.',
    )
  }
}

/**
 * Post-game omniscient review of every winning-team player (human + AI).
 * Live play never sees opponent hands — this runs only after round/game end.
 */
function analyzeWinningTeamFromEpisode(
  states: GameState[],
  winningTeamId: number,
  scratch: AnalysisScratch,
): void {
  const end = states[states.length - 1]!

  for (let i = 0; i < states.length - 1; i++) {
    const prev = states[i]!
    const next = states[i + 1]!
    if (prev.phase !== 'playing') continue

    const seat = findSeatThatActed(prev, next)
    if (seat == null) continue
    const player = prev.players[seat]
    if (!player || player.profile.teamId !== winningTeamId) continue

    analyzeSuccessfulOpening(prev, next, seat, scratch)
    analyzeSuccessfulDiscard(prev, next, seat, scratch)
    analyzeSuccessfulMeld(prev, next, seat, scratch)
  }

  analyzeWinningTeamEndState(end, winningTeamId, scratch)
}

function winningTeamIds(end: GameState, losingTeamId: number): number[] {
  return end.teams.filter((t) => t.id !== losingTeamId).map((t) => t.id)
}

function analyzePassedMeld(
  prev: GameState,
  next: GameState,
  seat: number,
  scratch: AnalysisScratch,
): void {
  const player = prev.players[seat]!
  const team = getTeam(prev, player.profile.teamId)
  if (!team.meldThresholdMet) return
  if (prev.turnPhase !== 'play') return
  if (next.discard.length <= prev.discard.length) return

  const adds = findAddToBookActions(
    player.hand,
    team.books,
    player.isPlayingFoot,
    prev.booksWithWildAddedThisTurn,
    team.meldThresholdMet,
  )
  if (adds.length === 0) return

  scratch.tallies.sandbagTurns += 1
  scratch.tallies.sandbaggedMelds += 1
  note(scratch, 'Had a meld available but discarded instead — play cards down faster.')
}

function winningTeamHadHuman(end: GameState, losingTeamId: number): boolean {
  return end.players.some(
    (p) => p.profile.isHuman && p.profile.teamId !== losingTeamId,
  )
}

function turboWeight(end: GameState, losingTeamId: number): number {
  let w = TURBO_TALLY_MULTIPLIER
  if (winningTeamHadHuman(end, losingTeamId)) {
    w *= HUMAN_BEAT_MULTIPLIER
    return w
  }
  return w
}

function applyTurboTallies(
  target: LessonTallies,
  source: LessonTallies,
  weight: number,
): void {
  for (const key of Object.keys(source) as (keyof LessonTallies)[]) {
    const w = key.startsWith('opponent') ? weight * OPPONENT_SUCCESS_MULTIPLIER : weight
    if (source[key] <= 0) continue
    target[key] += Math.max(1, Math.round(source[key] * w))
  }
}

function analyzeExpertDiscard(
  prev: GameState,
  next: GameState,
  seat: number,
  scratch: AnalysisScratch,
): void {
  if (next.discard.length <= prev.discard.length) return
  const discarded = next.discard[next.discard.length - 1]
  if (!discarded) return

  const player = prev.players[seat]!
  const hand = player.hand
  const team = getTeam(prev, player.profile.teamId)
  scratch.tallies.discardChoices += 1

  const sameRank = hand.filter(
    (c) =>
      c.rank === discarded.rank && !isWildCard(c) && !isRedThree(c) && c.id !== discarded.id,
  ).length
  const singles = singletonNaturals(hand).filter((c) => c.id !== discarded.id)
  if (!isWildCard(discarded) && !isRedThree(discarded) && sameRank >= 1 && singles.length > 0) {
    scratch.tallies.safeDiscardChances += 1
    scratch.tallies.pairBreaks += 1
    note(scratch, 'Broke a pair/triple instead of discarding a singleton.')
  } else if (singles.length > 0 || sameRank >= 1) {
    scratch.tallies.safeDiscardChances += 1
  }

  const oppRanks = opponentRanksOnTable(prev, player.profile.teamId)
  if (!isWildCard(discarded) && oppRanks.has(discarded.rank)) {
    const safer = hand.find(
      (c) =>
        c.id !== discarded.id &&
        !isWildCard(c) &&
        !isRedThree(c) &&
        !oppRanks.has(c.rank),
    )
    if (safer) {
      scratch.tallies.fedOpponents += 1
      note(scratch, 'Fed a discard onto an opponent book rank.')
    }
  }

  const ownRanks = teamRanks(team.books)
  if (!isWildCard(discarded) && ownRanks.has(discarded.rank)) {
    const safer = hand.find(
      (c) =>
        c.id !== discarded.id &&
        !isWildCard(c) &&
        !isRedThree(c) &&
        !ownRanks.has(c.rank),
    )
    if (safer) {
      scratch.tallies.discardedTeamRank += 1
      note(scratch, 'Discarded a card that matched an unfinished team book.')
    }
  }

  if (couldCompleteBook(hand, team.books)) {
    scratch.tallies.completionChances += 1
    const stillCould = couldCompleteBook(
      hand.filter((c) => c.id !== discarded.id),
      team.books,
    )
    if (!stillCould) {
      scratch.tallies.missedCompletions += 1
      note(scratch, 'Discarded instead of completing a nearly-finished book.')
    }
  }
}

function analyzeMissedOpening(
  prev: GameState,
  next: GameState,
  seat: number,
  scratch: AnalysisScratch,
): void {
  const player = prev.players[seat]!
  const team = getTeam(prev, player.profile.teamId)
  if (team.meldThresholdMet) return
  if (prev.turnPhase !== 'play') return

  const required = meldThreshold(team.score)
  if (!roughCanMeetOpening(player.hand, required)) return

  scratch.tallies.openingChances += 1

  const nextTeam = getTeam(next, player.profile.teamId)
  const opened =
    nextTeam.meldThresholdMet || nextTeam.books.length > team.books.length
  if (!opened && next.discard.length > prev.discard.length) {
    scratch.tallies.missedOpenings += 1
    note(scratch, 'Could open the meld requirement but discarded instead.')
  }
}

function analyzeWildOnClean(
  prev: GameState,
  next: GameState,
  seat: number,
  scratch: AnalysisScratch,
): void {
  const player = prev.players[seat]!
  const prevTeam = getTeam(prev, player.profile.teamId)
  const nextTeam = getTeam(next, player.profile.teamId)

  for (const nextBook of nextTeam.books) {
    const prevBook = prevTeam.books.find((b) => b.id === nextBook.id)
    if (!prevBook) continue
    if (nextBook.cards.length <= prevBook.cards.length) continue
    if (!isCleanBook(prevBook)) continue

    const added = nextBook.cards.slice(prevBook.cards.length)
    if (!added.some(isWildCard)) continue

    scratch.tallies.wildOnCleanChances += 1
    if (onlyCompletedClean(prevTeam.books) || !hasDirtyWildSink(prevTeam.books)) {
      /* Sometimes forced — still count the chance but soft. */
      continue
    }
    scratch.tallies.dirtyOnlyClean += 1
    note(scratch, 'Dirtied a clean book while a dirty wild sink was available.')
  }
}

function analyzeRoundEndHoldings(
  endState: GameState,
  losingTeamId: number,
  scratch: AnalysisScratch,
): void {
  const held = endState.players
    .filter((p) => p.profile.teamId === losingTeamId)
    .flatMap((p) => [...p.hand, ...p.foot])
  const highHeld = held.filter((c) => !isRedThree(c) && cardPointValue(c) >= 20)
  scratch.tallies.lateRounds += 1
  if (highHeld.length >= 3 || held.length >= 10) {
    scratch.tallies.lateHighHolds += 1
    note(scratch, 'Ended the round holding too many high-point cards.')
  }

  scratch.tallies.raceRounds += 1
  if (endState.wentOutTeamId !== null && endState.wentOutTeamId !== losingTeamId) {
    scratch.tallies.lostRaces += 1
    note(scratch, 'Opponents went out first — play more urgently when they are low.')
  }
}

/**
 * Omniscient post-defeat review of the recorded episode.
 * Live decisions never see this — only the resulting knobs affect future expert play.
 */
export function analyzeDefeatFromEpisode(
  states: GameState[],
  losingTeamId: number,
  options?: { persist?: boolean },
): DefeatLesson | null {
  if (states.length < 2) return null

  const end = states[states.length - 1]!
  const hasExpertLoser = end.players.some(
    (p) =>
      p.profile.teamId === losingTeamId &&
      !p.profile.isHuman &&
      (p.profile.aiDifficulty ?? 'normal') === 'expert',
  )
  if (!hasExpertLoser) return null

  const scratch: AnalysisScratch = {
    tallies: emptyTallies(),
    findings: [],
    opponentFindings: [],
  }

  for (let i = 0; i < states.length - 1; i++) {
    const prev = states[i]!
    const next = states[i + 1]!
    if (prev.phase !== 'playing') continue

    const seat = findSeatThatActed(prev, next)
    if (seat == null) continue
    const player = prev.players[seat]
    if (!player || player.profile.isHuman) continue
    if (player.profile.teamId !== losingTeamId) continue
    if ((player.profile.aiDifficulty ?? 'normal') !== 'expert') continue

    analyzeMissedOpening(prev, next, seat, scratch)
    analyzeExpertDiscard(prev, next, seat, scratch)
    analyzeWildOnClean(prev, next, seat, scratch)
    analyzePassedMeld(prev, next, seat, scratch)
  }

  const winners = winningTeamIds(end, losingTeamId)
  for (const winTeamId of winners) {
    analyzeWinningTeamFromEpisode(states, winTeamId, scratch)
  }

  analyzeRoundEndHoldings(end, losingTeamId, scratch)

  if (winningTeamHadHuman(end, losingTeamId)) {
    scratch.tallies.lostRaces += 1
    scratch.tallies.raceRounds += 1
    note(
      scratch,
      'Human opponents won — tighten race pressure and stop feeding their books.',
    )
  }

  if (
    scratch.findings.length === 0 &&
    scratch.opponentFindings.length === 0 &&
    scratch.tallies.discardChoices === 0 &&
    scratch.tallies.sandbagTurns === 0
  ) {
    scratch.tallies.raceRounds += 1
    scratch.tallies.lostRaces += 1
    note(scratch, 'Lost the round — push harder next time.')
  }

  const key = analysisKey(end, losingTeamId)
  if (options?.persist !== false && lastAnalyzedKey === key) {
    return null
  }

  const lesson: DefeatLesson = {
    at: Date.now(),
    roundNumber: end.roundNumber,
    losingTeamId,
    findings: scratch.findings.slice(0, MAX_FINDINGS_PER_LESSON),
    opponentFindings: scratch.opponentFindings.slice(0, MAX_FINDINGS_PER_LESSON),
    winningTeamIds: winners,
  }

  if (options?.persist !== false) {
    lastAnalyzedKey = key
    const memory = loadAiLessons()
    const weight = turboWeight(end, losingTeamId)
    applyTurboTallies(memory.tallies, scratch.tallies, weight)
    memory.defeatsAnalyzed += 1
    memory.lessons = [...memory.lessons, lesson].slice(-MAX_LESSON_LOG)
    saveAiLessons(memory)
  }

  return lesson
}

/**
 * After a scored round / game over: if any expert AI team lost, study the episode.
 * Returns lessons that were recorded.
 */
export function learnFromExpertDefeats(scoredState: GameState): DefeatLesson[] {
  const states = getEpisodeStates()
  if (states.length === 0) return []

  const withEnd = [...states, scoredState]
  const lessons: DefeatLesson[] = []

  if (scoredState.phase === 'gameOver' && scoredState.winnerTeamId !== null) {
    const loserTeams = scoredState.teams
      .filter((t) => t.id !== scoredState.winnerTeamId)
      .map((t) => t.id)
    for (const teamId of loserTeams) {
      const lesson = analyzeDefeatFromEpisode(withEnd, teamId)
      if (lesson) lessons.push(lesson)
    }
    clearEpisode()
    return lessons
  }

  if (scoredState.phase === 'roundEnd' && scoredState.roundScores) {
    const scores = scoredState.teams.map((t) => ({
      id: t.id,
      round: scoredState.roundScores![t.id] ?? 0,
    }))
    const best = Math.max(...scores.map((s) => s.round))
    const losers = scores.filter((s) => s.round < best).map((s) => s.id)

    /* Also treat "didn't go out" as a soft loss when round points tied. */
    if (
      losers.length === 0 &&
      scoredState.wentOutTeamId !== null
    ) {
      for (const team of scoredState.teams) {
        if (team.id !== scoredState.wentOutTeamId) losers.push(team.id)
      }
    }

    for (const teamId of [...new Set(losers)]) {
      const lesson = analyzeDefeatFromEpisode(withEnd, teamId)
      if (lesson) lessons.push(lesson)
    }

    /* Keep episode across rounds until game over, but trim to recent play. */
    if (episode.length > MAX_EPISODE_STATES / 2) {
      episode = episode.slice(-Math.floor(MAX_EPISODE_STATES / 2))
    }
  }

  return lessons
}

/**
 * Guard: public AI view never includes another seat's card identities.
 * Partner and opponents expose counts only.
 */
export function assertPublicStateHidesOtherHands(
  state: GameState,
  seatIndex: number,
): void {
  const pub = buildAiPublicState(state, seatIndex)
  const myIds = new Set(pub.myHand.map((c) => c.id))

  for (const other of state.players) {
    if (other.profile.seatIndex === seatIndex) continue
    for (const card of [...other.hand, ...other.foot]) {
      if (myIds.has(card.id)) {
        throw new Error(
          `AI public state leaked another seat's card id ${card.id} into myHand`,
        )
      }
    }
  }

  for (const other of pub.otherPlayers) {
    if (!('hand' in other) && !('foot' in other) && !('cards' in other)) continue
    throw new Error('AI otherPlayers must not expose card arrays')
  }
}
