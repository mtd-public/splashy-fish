import { GameCanvas } from './components/GameCanvas'
import { GameOverlay } from './components/GameOverlay'
import { KeyboardHelp } from './components/KeyboardHelp'
import { StatsSidebar } from './components/StatsSidebar'
import { useGameEngine } from './game/useGameEngine'

export default function App() {
  const { state, world, splash, start, togglePause, newGame } = useGameEngine()
  const playable = state.phase === 'playing'

  function onBoardPointerDown() {
    if (state.phase === 'playing') splash()
  }

  return (
    <div className="app">
      <header className="topbar">
        <h1 className="wordmark">
          Splashy <span className="wordmark__accent">Fish</span>
        </h1>
        <div className="topbar__stats">
          <span className="topbar__stat">
            <span className="stat__label">Score</span> {state.score.toLocaleString()}
          </span>
        </div>
        <div className="topbar__actions">
          <KeyboardHelp />
          <button
            type="button"
            className="btn btn--ghost"
            onClick={togglePause}
            disabled={state.phase !== 'playing' && state.phase !== 'paused'}
          >
            {state.phase === 'paused' ? 'Resume' : 'Pause'}
          </button>
        </div>
      </header>

      <main className="layout">
        <div className="board-shell" onPointerDown={onBoardPointerDown}>
          <GameCanvas world={world} phase={state.phase} score={state.score} />
          <div className="depth-badge">
            <span className="depth-badge__label">Depth</span>
            <span className="depth-badge__value">{state.level}</span>
          </div>
          <GameOverlay
            phase={state.phase}
            score={state.score}
            best={state.best}
            onStart={start}
            onResume={togglePause}
            onNewGame={newGame}
          />
        </div>

        <StatsSidebar state={state} />
      </main>

      <div className="footer-bar">
        <button type="button" className="btn btn--primary btn--splash" onClick={splash} disabled={!playable}>
          Splash!
        </button>
      </div>
    </div>
  )
}
