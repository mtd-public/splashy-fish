import { motion } from 'framer-motion'
import type { GameState } from '../game/types'

function Stat({ label, value, duplicate }: { label: string; value: number; duplicate?: boolean }) {
  return (
    <div className={`stat${duplicate ? ' stat--duplicate' : ''}`}>
      <span className="stat__label">{label}</span>
      <motion.span
        key={value}
        className="stat__value"
        initial={{ scale: 1.25, color: 'var(--accent)' }}
        animate={{ scale: 1, color: 'var(--text)' }}
        transition={{ duration: 0.3 }}
      >
        {value.toLocaleString()}
      </motion.span>
    </div>
  )
}

export function StatsSidebar({ state }: { state: GameState }) {
  return (
    <aside className="stats-sidebar">
      <div className="stats-sidebar__section">
        <span className="stat__label">Best</span>
        <span className="stat__value stat__value--best">{state.best.toLocaleString()}</span>
      </div>
      <div className="stats-sidebar__stats">
        {/* Score already shows in the topbar — hidden here on the compact
            phone/tablet-portrait strip, shown alongside Depth on the wide
            (desktop/tablet-landscape) card. */}
        <Stat label="Score" value={state.score} duplicate />
        <Stat label="Depth" value={state.level} />
      </div>
    </aside>
  )
}
