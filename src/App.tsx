import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import type { AiDifficulty, GameState } from './game/deal'
import { startNewGame } from './game/deal'
import { applyRoundScores, startNextRound } from './game/roundScoring'
import type { ChatMessage } from './game/chat'
import { isAllowedChatMessage } from './game/chat'
import { loadMutePreference, playSound, unlockAudio } from './game/audio'
import { loadAutoSortPreference, loadAiDebugPreference, saveAutoSortPreference, saveAiDebugPreference } from './game/preferences'
import type { UndoVoteRequest } from './game/votes'
import {
  humanSeats,
  resolveUndoRequest,
  startOverReached,
  undoEligibleVoters,
} from './game/votes'
import { GameView } from './components/GameView'
import { RoundSummary } from './components/RoundSummary'
import {
  RestartNoticeOverlay,
  UndoRequestPicker,
  UndoVoteOverlay,
} from './components/VoteOverlays'
import {
  SetupScreen,
  buildSetupPlayers,
  createDefaultHumanPlayers,
} from './components/SetupScreen'
import { InstructionsButton, InstructionsOverlay } from './components/InstructionsOverlay'
import { SoundToggle } from './components/SoundToggle'
import { TEAM_COLORS } from './game/teams'
import type { PlayerCount } from './game/teams'

const RESTART_NOTICE_MS = 2400

function App() {
  const [playerCount, setPlayerCount] = useState<PlayerCount>(4)
  const [humanCount, setHumanCount] = useState(1)
  const [humanPlayers, setHumanPlayers] = useState(() => createDefaultHumanPlayers(1))
  const [aiDifficulty, setAiDifficulty] = useState<AiDifficulty>('normal')
  const [game, setGame] = useState<GameState | null>(null)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [showInstructions, setShowInstructions] = useState(false)
  const [gameHistory, setGameHistory] = useState<GameState[]>([])
  const [startOverVotes, setStartOverVotes] = useState<number[]>([])
  const [undoRequest, setUndoRequest] = useState<UndoVoteRequest | null>(null)
  const [undoResult, setUndoResult] = useState<'approved' | 'denied' | null>(null)
  const [showRestartNotice, setShowRestartNotice] = useState(false)
  const [showUndoPicker, setShowUndoPicker] = useState(false)
  const [autoSort, setAutoSort] = useState(() => loadAutoSortPreference())
  const [aiDebugEnabled, setAiDebugEnabled] = useState(() => loadAiDebugPreference())

  useEffect(() => {
    loadMutePreference()
  }, [])

  function resetSession() {
    setGameHistory([])
    setStartOverVotes([])
    setUndoRequest(null)
    setUndoResult(null)
    setShowRestartNotice(false)
    setShowUndoPicker(false)
  }

  function handlePlayerCountChange(count: PlayerCount) {
    setPlayerCount(count)
    const humans = Math.max(1, Math.min(humanCount, count))
    setHumanCount(humans)
    setHumanPlayers((prev) => {
      if (prev.length < humans) {
        return [
          ...prev,
          ...createDefaultHumanPlayers(humans).slice(prev.length),
        ]
      }
      return prev.slice(0, humans)
    })
  }

  function handleHumanCountChange(count: number) {
    setHumanCount(count)
    setHumanPlayers((prev) => {
      if (prev.length < count) {
        return [...prev, ...createDefaultHumanPlayers(count).slice(prev.length)]
      }
      return prev.slice(0, count)
    })
  }

  function handleStart() {
    unlockAudio()
    playSound('threshold')
    setChatMessages([])
    resetSession()
    setGame(
      startNewGame(
        buildSetupPlayers(humanPlayers, playerCount, aiDifficulty),
        playerCount,
      ),
    )
  }

  function handleGameChange(
    next: GameState,
    options?: { recordHistory?: boolean },
  ) {
    if (options?.recordHistory && game) {
      setGameHistory((history) => [...history.slice(-40), game])
    }
    setGame(next)
  }

  function handleStartOverVote(seatIndex: number) {
    if (!game || startOverVotes.includes(seatIndex)) return
    playSound('button')

    const nextVotes = [...startOverVotes, seatIndex]
    setStartOverVotes(nextVotes)

    const humans = humanSeats(game).length
    if (!startOverReached(nextVotes, humans)) return

    setShowRestartNotice(true)
    window.setTimeout(() => {
      playSound('button')
      setChatMessages([])
      resetSession()
      setGame(
        startNewGame(
          buildSetupPlayers(humanPlayers, playerCount, aiDifficulty),
          playerCount,
        ),
      )
    }, RESTART_NOTICE_MS)
  }

  function handleRequestUndo(requesterSeat: number) {
    if (!game || gameHistory.length === 0 || undoRequest) return
    playSound('button')
    setShowUndoPicker(false)

    const eligible = undoEligibleVoters(game, requesterSeat)
    if (eligible.length === 0) {
      setGame(gameHistory[gameHistory.length - 1]!)
      setGameHistory((history) => history.slice(0, -1))
      setUndoResult('approved')
      return
    }

    setUndoRequest({ requesterSeat, votes: {} })
  }

  function initiateUndoRequest() {
    if (!game || gameHistory.length === 0 || undoRequest) return
    const humans = humanSeats(game)
    if (humans.length <= 1) {
      handleRequestUndo(humans[0]!)
      return
    }
    setShowUndoPicker(true)
  }

  function handleUndoVote(voterSeat: number, choice: 'approve' | 'deny') {
    if (!game || !undoRequest || undoRequest.votes[voterSeat]) return
    playSound('button')

    const updated: UndoVoteRequest = {
      ...undoRequest,
      votes: { ...undoRequest.votes, [voterSeat]: choice },
    }
    const eligible = undoEligibleVoters(game, undoRequest.requesterSeat)
    const outcome = resolveUndoRequest(updated, eligible)

    if (outcome === null) {
      setUndoRequest(updated)
      return
    }

    setUndoRequest(null)
    if (outcome === 'approved') {
      const previous = gameHistory[gameHistory.length - 1]
      if (previous) {
        setGame(previous)
        setGameHistory((history) => history.slice(0, -1))
      }
    }
    setUndoResult(outcome)
  }

  function handleDismissUndoResult() {
    playSound('button')
    setUndoResult(null)
  }

  function handleRoundContinue() {
    if (!game) return
    unlockAudio()
    playSound('button')

    if (game.phase === 'roundEnd') {
      if (!game.roundScores) {
        setGame(applyRoundScores(game))
        return
      }
      if (game.winnerTeamId !== null) {
        playSound('goOut')
        setGame({ ...game, phase: 'gameOver' })
        return
      }
      setGame(startNextRound(game))
      setChatMessages([])
    }
  }

  let content: ReactNode

  if (!game) {
    content = (
      <SetupScreen
        playerCount={playerCount}
        onPlayerCountChange={handlePlayerCountChange}
        humanCount={humanCount}
        onHumanCountChange={handleHumanCountChange}
        humanPlayers={humanPlayers}
        onHumanPlayersChange={setHumanPlayers}
        aiDifficulty={aiDifficulty}
        onAiDifficultyChange={setAiDifficulty}
        onStart={handleStart}
      />
    )
  } else if (game.phase === 'roundEnd') {
    content = <RoundSummary game={game} onContinue={handleRoundContinue} />
  } else if (game.phase === 'gameOver') {
    const winner = game.teams.find((t) => t.id === game.winnerTeamId)
    const winningPlayers = game.players.filter(
      (p) => p.profile.teamId === game.winnerTeamId,
    )
    content = (
      <div className="animate-fade-up mx-auto max-w-lg px-6 py-16 text-center">
        <p className="mb-2 font-sans text-[11px] uppercase tracking-[0.2em] text-ink-faint">
          Game over
        </p>
        <h2 className="mb-3 font-display text-4xl font-semibold text-ink">Victory</h2>
        <p className="mb-6 text-lg text-ink-soft">
          <span style={{ color: TEAM_COLORS[winner!.id] }}>
            Team {winner!.id + 1}
          </span>{' '}
          wins with{' '}
          <span className="font-display font-semibold tabular-nums text-accent">
            {winner!.score}
          </span>
        </p>

        <ul className="mb-10 flex flex-wrap items-stretch justify-center gap-3">
          {winningPlayers.map((player) => (
            <li
              key={player.profile.seatIndex}
              className="seat-chip seat-chip-ally max-w-none px-4 py-2.5"
              style={{ '--seat-team': TEAM_COLORS[winner!.id] } as CSSProperties}
            >
              <div className="seat-chip-avatar text-xl">{player.profile.avatar}</div>
              <div className="seat-chip-body">
                <p className="seat-chip-name text-sm">{player.profile.name}</p>
                <span className="seat-chip-role">Winner</span>
              </div>
            </li>
          ))}
        </ul>

        <button
          onClick={() => {
            playSound('button')
            resetSession()
            setGame(null)
          }}
          className="btn-primary px-8 py-3 text-sm"
        >
          New game
        </button>
      </div>
    )
  } else {
    content = (
      <GameView
        game={game}
        onGameChange={handleGameChange}
        chatMessages={chatMessages}
        autoSort={autoSort}
        onAutoSortChange={(enabled) => {
          saveAutoSortPreference(enabled)
          setAutoSort(enabled)
          playSound('button')
        }}
        aiDebugEnabled={aiDebugEnabled}
        onAiDebugChange={(enabled) => {
          saveAiDebugPreference(enabled)
          setAiDebugEnabled(enabled)
          playSound('button')
        }}
        onShowInstructions={() => setShowInstructions(true)}
        startOverVotes={startOverVotes}
        onStartOverVote={handleStartOverVote}
        canRequestUndo={gameHistory.length > 0}
        undoPending={undoRequest !== null}
        onRequestUndo={initiateUndoRequest}
        onChatSend={(message, validationState) => {
          const g = validationState ?? game
          if (!g || !isAllowedChatMessage(g, message, chatMessages)) return
          playSound('chat')
          setChatMessages((prev) => [...prev, message])
        }}
      />
    )
  }

  return (
    <div
      className={
        game?.phase === 'playing'
          ? 'room-bg h-dvh max-h-dvh overflow-hidden'
          : 'room-bg min-h-screen'
      }
    >
      <InstructionsOverlay
        open={showInstructions}
        onClose={() => setShowInstructions(false)}
      />

      {showRestartNotice && game && (
        <RestartNoticeOverlay humanCount={humanSeats(game).length} />
      )}

      {undoRequest && game && !undoResult && (
        <UndoVoteOverlay
          game={game}
          request={undoRequest}
          onVote={handleUndoVote}
          onDismissResult={handleDismissUndoResult}
          result={null}
        />
      )}

      {undoResult && (
        <UndoVoteOverlay
          game={game!}
          request={{ requesterSeat: 0, votes: {} }}
          onVote={() => {}}
          onDismissResult={handleDismissUndoResult}
          result={undoResult}
        />
      )}

      {showUndoPicker && game && (
        <UndoRequestPicker
          game={game}
          onSelect={handleRequestUndo}
          onCancel={() => setShowUndoPicker(false)}
        />
      )}

      {!game && (
        <div className="fixed right-3 top-3 z-40 flex items-center gap-2 sm:right-4 sm:top-4">
          <SoundToggle variant="chip" />
          <InstructionsButton onClick={() => setShowInstructions(true)} />
        </div>
      )}

      {game && game.phase !== 'playing' && (
        <div className="fixed right-3 top-3 z-40 sm:right-4 sm:top-4">
          <InstructionsButton onClick={() => setShowInstructions(true)} />
        </div>
      )}

      {content}
    </div>
  )
}

export default App
