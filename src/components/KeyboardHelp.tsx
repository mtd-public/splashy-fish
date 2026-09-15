import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'

const SHORTCUTS: Array<{ keys: string[]; label: string }> = [
  { keys: ['Space', '↑'], label: 'Splash (swim right)' },
  { keys: ['Tap board'], label: 'Splash (swim right)' },
  { keys: ['P'], label: 'Pause / resume' },
]

export function KeyboardHelp() {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }

    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className="help" ref={rootRef}>
      <button
        type="button"
        className="help__trigger"
        aria-label="Keyboard controls"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        ?
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="help__panel"
            role="dialog"
            aria-label="Keyboard controls"
            initial={{ opacity: 0, y: -6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
          >
            <span className="help__title">Keyboard controls</span>
            <ul className="help__list">
              {SHORTCUTS.map((shortcut) => (
                <li key={shortcut.label} className="help__row">
                  <span className="help__keys">
                    {shortcut.keys.map((key) => (
                      <kbd key={key} className="help__key">
                        {key}
                      </kbd>
                    ))}
                  </span>
                  <span className="help__label">{shortcut.label}</span>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
