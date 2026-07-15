import { useEffect, useState, type ReactNode } from 'react'
import type { GameState } from './game/deal'
import { startNewGame } from './game/deal'
import { applyRoundScores, startNextRound } from './game/roundScoring'
import type { ChatMessage } from './game/chat'
import { loadMutePreference, playSound, unlockAudio } from './game/audio'
import { GameView } from './components/GameView'
import { RoundSummary } from './components/RoundSummary'
import {
  SetupScreen,
  createDefaultSetupPlayers,
  type SetupPlayer,
} from './components/SetupScreen'
import {
  InstructionsButton,
  InstructionsOverlay,
} from './components/InstructionsOverlay'
import { TEAM_COLORS } from './game/teams'
import type { PlayerCount } from './game/teams'

function App() {
  const [playerCount, setPlayerCount] = useState<PlayerCount>(4)
  const [humanCount, setHumanCount] = useState(1)
  const [setupPlayers, setSetupPlayers] = useState<SetupPlayer[]>(() =>
    createDefaultSetupPlayers(4, 1),
  )
  const [game, setGame] = useState<GameState | null>(null)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [showInstructions, setShowInstructions] = useState(false)

  useEffect(() => {
    loadMutePreference()
  }, [])

  function handlePlayerCountChange(count: PlayerCount) {
    setPlayerCount(count)
    const humans = Math.min(humanCount, count)
    setHumanCount(humans)
    setSetupPlayers(createDefaultSetupPlayers(count, humans))
  }

  function handleStart() {
    unlockAudio()
    playSound('threshold')
    setChatMessages([])
    setGame(startNewGame(setupPlayers, playerCount))
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
    }
  }

  let content: ReactNode

  if (!game) {
    content = (
      <SetupScreen
        playerCount={playerCount}
        onPlayerCountChange={handlePlayerCountChange}
        humanCount={humanCount}
        onHumanCountChange={setHumanCount}
        players={setupPlayers}
        onPlayersChange={setSetupPlayers}
        onStart={handleStart}
      />
    )
  } else if (game.phase === 'roundEnd') {
    content = <RoundSummary game={game} onContinue={handleRoundContinue} />
  } else if (game.phase === 'gameOver') {
    const winner = game.teams.find((t) => t.id === game.winnerTeamId)
    content = (
      <div className="animate-fade-up mx-auto max-w-lg px-6 py-16 text-center">
        <p className="mb-2 font-sans text-[11px] uppercase tracking-[0.2em] text-ink-faint">
          Game over
        </p>
        <h2 className="mb-3 font-display text-4xl font-semibold text-ink">Victory</h2>
        <p className="mb-10 text-lg text-ink-soft">
          <span style={{ color: TEAM_COLORS[winner!.id] }}>
            Team {winner!.id + 1}
          </span>{' '}
          wins with{' '}
          <span className="font-display font-semibold tabular-nums text-accent">
            {winner!.score}
          </span>
        </p>
        <button
          onClick={() => {
            playSound('button')
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
        onGameChange={setGame}
        chatMessages={chatMessages}
        onChatSend={(message) => {
          playSound('chat')
          setChatMessages((prev) => [...prev, message])
        }}
        onShowInstructions={() => setShowInstructions(true)}
      />
    )
  }

  return (
    <div
      className={`room-bg min-h-screen ${
        game && game.phase === 'playing' ? 'h-dvh overflow-hidden' : ''
      }`}
    >
      {(!game || game.phase !== 'playing') && (
        <InstructionsButton onClick={() => setShowInstructions(true)} />
      )}
      <InstructionsOverlay
        open={showInstructions}
        onClose={() => setShowInstructions(false)}
      />
      {content}
    </div>
  )
}

export default App
