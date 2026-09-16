import { useEffect, useRef } from 'react'
import { Scene3D } from '../game/scene3d'
import type { World } from '../game/physics'
import type { GamePhase } from '../game/types'

interface GameCanvasProps {
  world: { current: World }
  phase: GamePhase
  score: number
}

export function GameCanvas({ world, phase, score }: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const phaseRef = useRef(phase)
  const scoreRef = useRef(score)
  phaseRef.current = phase
  scoreRef.current = score

  useEffect(() => {
    const canvas = canvasRef.current
    const parent = canvas?.parentElement
    if (!canvas || !parent) return

    const scene = new Scene3D(canvas)

    function resize() {
      scene.resize(parent!.clientWidth, parent!.clientHeight)
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(parent)

    let raf = 0
    let last = performance.now()
    function frame(ts: number) {
      const dt = Math.min((ts - last) / 1000, 1 / 30)
      last = ts
      scene.update(world.current, phaseRef.current, scoreRef.current, dt, ts / 1000)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
      scene.dispose()
    }
  }, [world])

  return <canvas ref={canvasRef} className="game-canvas" />
}
