import type { CommentaryRequest, GameNarrationEvent, NarratorPersonality } from './types'
import { pickVaried } from './commentaryVariety'

function rankLabel(rank: string): string {
  if (rank === 'Joker') return 'joker'
  if (rank === 'A') return 'ace'
  if (rank === 'K') return 'king'
  if (rank === 'Q') return 'queen'
  if (rank === 'J') return 'jack'
  return rank
}

function line(
  personality: NarratorPersonality,
  category: string,
  options: Record<NarratorPersonality, string[]>,
): string {
  const pool = options[personality] ?? options.dealer
  return pickVaried(category, pool)
}

const VIEWER_TURN_DEALER = [
  'You\'re up.',
  'Your turn.',
  'Over to you.',
  'Whenever you\'re ready.',
  'The table\'s yours.',
  'All yours.',
  'Go ahead.',
  'Take your time.',
]

const VIEWER_TURN_COMMENTATOR = [
  'Your turn.',
  'You\'re up.',
  'Ball\'s in your court.',
  'It\'s on you.',
  'Your play.',
  'Ready when you are.',
]

const VIEWER_TURN_STORYTELLER = [
  'The table turns to you.',
  'Your moment.',
  'Your move.',
  'All eyes, briefly, on you.',
  'The next play is yours.',
]

const VIEWER_FOOT_DEALER = [
  'Your foot — make it count.',
  'Foot\'s live. Your move.',
  'Playing the foot now.',
  'Last pile — your call.',
  'Foot\'s on the table.',
]

const VIEWER_FOOT_COMMENTATOR = [
  'Foot time.',
  'You\'re on the foot.',
  'Close it from the foot.',
  'Last stretch.',
]

const VIEWER_FOOT_STORYTELLER = [
  'The foot awaits.',
  'Your final pile.',
  'The foot is live.',
  'One pile left to play.',
]

export function buildCommentary({ event, personality }: CommentaryRequest): string {
  switch (event.type) {
    case 'game_start':
      return line(personality, 'game_start', {
        dealer: [
          'Fresh cards on the table.',
          'New game — take a seat.',
          'Alright, let\'s deal.',
          'Cards are out.',
        ],
        commentator: [
          'Here we go.',
          'Cards are out — good luck.',
          'Let\'s play.',
          'New game, clean slate.',
        ],
        storyteller: [
          'The table is ready.',
          'A new round of stories begins.',
          'Shuffle, deal, begin.',
          'Another hand unfolds.',
        ],
      })

    case 'game_resume':
      return line(personality, 'game_resume', {
        dealer: ['Picking up where we left off.', 'Welcome back to the table.', 'We resume.'],
        commentator: ['Welcome back.', 'Good to see you again.', 'Let\'s keep going.'],
        storyteller: ['We return to the table.', 'The game continues.', 'Back to the cards.'],
      })

    case 'round_start':
      return line(personality, `round_start:${event.roundNumber}`, {
        dealer: ['New round.', 'Fresh deal.', 'Cards back in play.', 'Round reset.'],
        commentator: ['New round.', 'Reset and go.', 'Another round.', 'Here we go again.'],
        storyteller: ['Another chapter.', 'The cards turn again.', 'Round anew.', 'A fresh deal.'],
      })

    case 'turn_start':
      if (event.isViewer) {
        if (event.isPlayingFoot) {
          return line(personality, 'viewer_foot', {
            dealer: VIEWER_FOOT_DEALER,
            commentator: VIEWER_FOOT_COMMENTATOR,
            storyteller: VIEWER_FOOT_STORYTELLER,
          })
        }
        return line(personality, 'viewer_turn', {
          dealer: VIEWER_TURN_DEALER,
          commentator: VIEWER_TURN_COMMENTATOR,
          storyteller: VIEWER_TURN_STORYTELLER,
        })
      }
      return line(personality, `other_turn:${event.playerName}`, {
        dealer: [`${event.playerName}'s turn.`],
        commentator: [`${event.playerName} is up.`],
        storyteller: [`${event.playerName} takes a turn.`],
      })

    case 'draw':
      return line(personality, 'draw', {
        dealer: ['Two from the stock.', 'Drawing two.', 'Stock draw.'],
        commentator: ['Two cards in.', 'Off the stock.', 'Fresh cards.'],
        storyteller: ['Two from the pile.', 'A quiet draw.', 'Cards from the stock.'],
      })

    case 'meld_start':
      return line(personality, `meld_start:${event.rank}`, {
        dealer: [
          `Opens ${rankLabel(event.rank)}s.`,
          `New ${rankLabel(event.rank)} pile.`,
          `${rankLabel(event.rank)}s on the table.`,
        ],
        commentator: [
          `Laying ${rankLabel(event.rank)}s.`,
          `New book — ${rankLabel(event.rank)}.`,
          `${rankLabel(event.rank)}s go down.`,
        ],
        storyteller: [
          `A ${rankLabel(event.rank)} pile begins.`,
          `${rankLabel(event.rank)}s hit the felt.`,
        ],
      })

    case 'meld_add':
      if (event.bookComplete) {
        return line(personality, `meld_complete:${event.rank}`, {
          dealer: [`${rankLabel(event.rank)} book — sealed.`],
          commentator: [`Book closed on ${rankLabel(event.rank)}.`],
          storyteller: [`The ${rankLabel(event.rank)} book is done.`],
        })
      }
      return ''

    case 'book_complete':
      return line(personality, `book_complete:${event.rank}:${event.clean}`, {
        dealer: [
          `${event.clean ? 'Clean' : 'Dirty'} ${rankLabel(event.rank)} book — done.`,
          `That ${rankLabel(event.rank)} book is closed.`,
          `${rankLabel(event.rank)} book finished.`,
        ],
        commentator: [
          `Book — ${rankLabel(event.rank)} complete.`,
          `${event.clean ? 'Clean' : 'Dirty'} book sealed.`,
        ],
        storyteller: [
          `Seven ${rankLabel(event.rank)}s — finished.`,
          `A ${rankLabel(event.rank)} book, complete.`,
        ],
      })

    case 'threshold_met':
      return line(personality, 'threshold_met', {
        dealer: ['You\'re on the board.', 'Down and in.', 'Meld threshold cleared.', 'First meld is down.'],
        commentator: ['They went down.', 'On the board.', 'First meld down.'],
        storyteller: ['The first meld lands.', 'Now the real play begins.', 'On the board at last.'],
      })

    case 'discard': {
      if (event.goingOut) {
        return line(personality, 'going_out', {
          dealer: ['And out.', 'That\'s the round.', 'Out.', 'Round closed.'],
          commentator: ['Goes out.', 'Round over.', 'That\'s out.'],
          storyteller: ['The final discard.', 'Silence — out.', 'The round ends here.'],
        })
      }
      if (event.goToFoot) {
        return line(personality, 'go_to_foot_discard', {
          dealer: ['Into the foot.', 'Foot time.', 'Hand empty — foot next.'],
          commentator: ['Hits the foot.', 'Foot pickup.', 'Onto the foot.'],
          storyteller: ['The hand is gone.', 'Now the foot.', 'Foot awaits.'],
        })
      }
      return ''
    }

    case 'go_to_foot':
      return line(personality, 'go_to_foot', {
        dealer: ['Picking up the foot.', 'Foot\'s in play.', 'The foot opens.'],
        commentator: ['On the foot.', 'Foot pickup.', 'Foot\'s live.'],
        storyteller: ['The foot opens.', 'A deeper pile to play.', 'Foot in hand.'],
      })

    case 'go_out':
      return line(personality, 'go_out', {
        dealer: ['Round over.', 'That closes it.', 'And the round is done.'],
        commentator: ['They got out.', 'Round\'s done.', 'Out — round over.'],
        storyteller: ['The round ends.', 'Done.', 'Closed.'],
      })

    case 'round_end': {
      const leader = event.breakdowns.reduce((best, row) =>
        row.total > best.total ? row : best,
      )
      return line(personality, `round_end:${leader.teamId}`, {
        dealer: [
          `Round tally — Team ${leader.teamId + 1} leads.`,
          `Team ${leader.teamId + 1} takes the round.`,
        ],
        commentator: [
          `Team ${leader.teamId + 1} wins the round.`,
          `Round to Team ${leader.teamId + 1}.`,
        ],
        storyteller: [
          `Team ${leader.teamId + 1} finishes on top.`,
          `Team ${leader.teamId + 1} leads the tally.`,
        ],
      })
    }

    case 'game_over':
      return line(personality, `game_over:${event.winnerTeamId}`, {
        dealer: [`Team ${event.winnerTeamId + 1} wins it.`],
        commentator: [`Game over — Team ${event.winnerTeamId + 1}.`],
        storyteller: [`Victory for Team ${event.winnerTeamId + 1}.`],
      })

    case 'error':
      return event.message

    case 'chat':
      return ''

    default:
      return ''
  }
}

export function computeExcitement(event: GameNarrationEvent): number {
  switch (event.type) {
    case 'go_out':
    case 'game_over':
    case 'book_complete':
      return 1
    case 'round_end':
    case 'go_to_foot':
      return 0.75
    case 'threshold_met':
      return 0.65
    case 'turn_start':
      return event.isViewer ? 0.55 : 0.3
    case 'discard':
      return event.goingOut || event.goToFoot ? 0.8 : 0.35
    default:
      return 0.4
  }
}

export function eventCacheKey(event: GameNarrationEvent, text?: string): string {
  const base = (() => {
    switch (event.type) {
      case 'discard':
        return `discard:${event.card.rank}:${event.goingOut}:${event.goToFoot}`
      case 'meld_start':
        return `meld_start:${event.rank}:${event.cardCount}`
      case 'meld_add':
        return `meld_add:${event.rank}:${event.bookComplete}`
      case 'book_complete':
        return `book_complete:${event.rank}:${event.clean}`
      case 'turn_start':
        return `turn_start:${event.isViewer}:${event.isPlayingFoot}`
      case 'round_start':
        return `round_start:${event.roundNumber}`
      case 'round_end':
        return 'round_end'
      case 'game_over':
        return 'game_over'
      case 'game_start':
        return 'game_start'
      case 'game_resume':
        return 'game_resume'
      case 'draw':
        return 'draw'
      case 'threshold_met':
        return 'threshold'
      case 'go_out':
        return 'go_out'
      case 'go_to_foot':
        return 'go_to_foot'
      case 'error':
        return `error:${event.message}`
      default:
        return 'unknown'
    }
  })()

  return text ? `${base}:${text}` : base
}
