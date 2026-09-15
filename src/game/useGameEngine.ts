import { useCallback, useEffect, useReducer, useRef } from 'react'
import type { GameState } from './types'
import { createWorld, step, type World } from './physics'

const BEST_KEY = 'splashy-fish-best'

function loadBest(): number {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0
  } catch {
    return 0
  }
}

function saveBest(best: number) {
  try {
    localStorage.setItem(BEST_KEY, String(best))
  } catch {
    // storage unavailable (private mode, quota) — best just won't persist
  }
}

function levelForScore(score: number) {
  return Math.floor(score / 5) + 1
}

function initialState(): GameState {
  return { phase: 'ready', score: 0, best: loadBest(), level: 1 }
}

type Action =
  | { type: 'START' }
  | { type: 'PAUSE_TOGGLE' }
  | { type: 'SCORE'; score: number }
  | { type: 'GAME_OVER'; score: number }
  | { type: 'NEW_GAME' }

function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'START':
      return state.phase === 'ready' ? { ...state, phase: 'playing' } : state

    case 'PAUSE_TOGGLE':
      if (state.phase === 'playing') return { ...state, phase: 'paused' }
      if (state.phase === 'paused') return { ...state, phase: 'playing' }
      return state

    case 'SCORE':
      return state.phase === 'playing'
        ? { ...state, score: action.score, level: levelForScore(action.score) }
        : state

    case 'GAME_OVER': {
      const best = Math.max(state.best, action.score)
      if (best > state.best) saveBest(best)
      return { ...state, phase: 'over', score: action.score, best }
    }

    case 'NEW_GAME':
      return { ...initialState(), best: state.best, phase: 'playing' }

    default:
      return state
  }
}

/**
 * Drives the fish: a requestAnimationFrame loop steps the mutable physics
 * world every frame (kept in a ref, not React state, so 60fps motion never
 * triggers a re-render) and syncs the reducer only when score/phase actually
 * change, which is what the score/overlay UI reads.
 */
export function useGameEngine() {
  const [state, dispatch] = useReducer(reducer, undefined, initialState)
  const worldRef = useRef<World>(createWorld())
  const inputRef = useRef({ splash: false })
  const phaseRef = useRef(state.phase)
  const lastScoreRef = useRef(0)
  phaseRef.current = state.phase

  const splash = useCallback(() => {
    if (phaseRef.current === 'playing') inputRef.current.splash = true
  }, [])

  const start = useCallback(() => dispatch({ type: 'START' }), [])
  const togglePause = useCallback(() => dispatch({ type: 'PAUSE_TOGGLE' }), [])
  const newGame = useCallback(() => {
    worldRef.current = createWorld()
    lastScoreRef.current = 0
    dispatch({ type: 'NEW_GAME' })
  }, [])

  useEffect(() => {
    let raf = 0
    let last = performance.now()

    function frame(ts: number) {
      const dt = Math.min((ts - last) / 1000, 1 / 30)
      last = ts

      if (phaseRef.current === 'playing') {
        const world = worldRef.current
        step(world, dt, inputRef.current)
        inputRef.current.splash = false

        if (world.collided) {
          dispatch({ type: 'GAME_OVER', score: world.score })
        } else if (world.score !== lastScoreRef.current) {
          lastScoreRef.current = world.score
          dispatch({ type: 'SCORE', score: world.score })
        }
      }

      raf = requestAnimationFrame(frame)
    }

    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      switch (event.key) {
        case ' ':
        case 'ArrowUp':
        case 'w':
        case 'W':
          event.preventDefault()
          if (phaseRef.current === 'ready') start()
          else splash()
          break
        case 'p':
        case 'P':
          togglePause()
          break
        default:
          break
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [splash, start, togglePause])

  return { state, world: worldRef, splash, start, togglePause, newGame }
}
