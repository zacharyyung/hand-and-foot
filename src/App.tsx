import { useMemo, useState } from 'react'
import type { GameState } from './game/deal'
import { startNewGame } from './game/deal'
import { applyRoundScores, startNextRound } from './game/roundScoring'
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
  const [showInstructions, setShowInstructions] = useState(false)

  function handlePlayerCountChange(count: PlayerCount) {
    setPlayerCount(count)
    const humans = Math.min(humanCount, count)
    setHumanCount(humans)
    setSetupPlayers(createDefaultSetupPlayers(count, humans))
  }

  function handleStart() {
    setGame(startNewGame(setupPlayers, playerCount))
  }

  function handleRoundContinue() {
    if (!game) return

    if (game.phase === 'roundEnd') {
      if (!game.roundScores) {
        setGame(applyRoundScores(game))
        return
      }
      if (game.winnerTeamId !== null) {
        setGame({ ...game, phase: 'gameOver' })
        return
      }
      setGame(startNextRound(game))
    }
  }

  const content = useMemo(() => {
    if (!game) {
      return (
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
    }

    if (game.phase === 'roundEnd') {
      return <RoundSummary game={game} onContinue={handleRoundContinue} />
    }

    if (game.phase === 'gameOver') {
      const winner = game.teams.find((t) => t.id === game.winnerTeamId)
      return (
        <div className="mx-auto max-w-lg px-6 py-10 text-center">
          <h2 className="mb-4 text-3xl font-bold text-white">Game Over!</h2>
          <p className="mb-6 text-lg text-white/80">
            <span style={{ color: TEAM_COLORS[winner!.id] }}>
              Team {winner!.id + 1}
            </span>{' '}
            wins with {winner!.score} points!
          </p>
          <button
            onClick={() => setGame(null)}
            className="rounded-lg bg-amber-500 px-6 py-3 font-semibold text-amber-950 hover:bg-amber-400"
          >
            New Game
          </button>
        </div>
      )
    }

    return <GameView game={game} onGameChange={setGame} />
  }, [game, playerCount, humanCount, setupPlayers])

  return (
    <div className="min-h-screen bg-felt bg-gradient-to-b from-felt-light to-felt-dark">
      <InstructionsButton onClick={() => setShowInstructions(true)} />
      <InstructionsOverlay
        open={showInstructions}
        onClose={() => setShowInstructions(false)}
      />
      {content}
    </div>
  )
}

export default App
