import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import './CreateMatterModal.css'

// ── Preset colours ────────────────────────────────────────────
const COLORS = [
  '#E8FF47', '#FF4F7B', '#00D4FF', '#B06EF7',
  '#FFAA00', '#00FF9F', '#FF7043', '#40C4FF',
]

// ── Emoji icons ───────────────────────────────────────────────
const EMOJIS = ['🧠', '📖', '💡', '🚀', '💻', '🎨', '🎵', '🧪']

// ── Modal entry animation ─────────────────────────────────────
const SPRING = { type: 'spring', stiffness: 500, damping: 32 }

/**
 * CreateMatterModal — full-screen overlay to create a new Matter.
 *
 * Props
 *   isOpen        boolean
 *   onClose       () => void
 *   onCreateMatter({ title, color, icon }) => Promise<void>
 */
export default function CreateMatterModal({ isOpen, onClose, onCreateMatter }) {
  // ── Internal state ───────────────────────────────────────────
  const [title, setTitle]   = useState('')
  const [color, setColor]   = useState(COLORS[2])   // cyan default
  const [icon, setIcon]     = useState('🧠')
  const inputRef            = useRef(null)

  // Reset + auto-focus when opening
  useEffect(() => {
    if (isOpen) {
      setTitle('')
      setColor(COLORS[2])
      setIcon('🧠')
      setTimeout(() => inputRef.current?.focus(), 80)
    }
  }, [isOpen])

  // ── Escape key to close ──────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  // ── Submit ───────────────────────────────────────────────────
  const handleCreate = async () => {
    const trimmed = title.trim()
    if (!trimmed) return
    await onCreateMatter({ title: trimmed, color, icon })
  }

  // ── Render ───────────────────────────────────────────────────
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="cm-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
        >
          <motion.div
            className="cm-modal"
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.94 }}
            transition={SPRING}
          >
            {/* ── Title ──────────────────────────────────── */}
            <h2 className="cm-title">Create a new Matter</h2>

            {/* ── Name input ─────────────────────────────── */}
            <label className="cm-label">Title</label>
            <input
              ref={inputRef}
              className="cm-input"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate() }}
              placeholder="e.g. System Design, Reading Notes…"
              autoComplete="off"
              spellCheck={false}
            />

            {/* ── Colour swatches ────────────────────────── */}
            <label className="cm-label">Colour</label>
            <div className="cm-colors">
              {COLORS.map((c) => (
                <button
                  key={c}
                  className={`cm-swatch${color === c ? ' is-picked' : ''}`}
                  style={{
                    backgroundColor: c,
                    boxShadow: color === c ? `0 0 14px ${c}88` : 'none',
                  }}
                  onClick={() => setColor(c)}
                  aria-label={`Select colour ${c}`}
                />
              ))}
            </div>

            {/* ── Emoji icon picker ──────────────────────── */}
            <label className="cm-label">Icon</label>
            <div className="cm-emojis">
              {EMOJIS.map((em) => (
                <button
                  key={em}
                  className={`cm-emoji${icon === em ? ' is-picked' : ''}`}
                  onClick={() => setIcon(em)}
                  aria-label={`Select icon ${em}`}
                >
                  {em}
                </button>
              ))}
            </div>

            {/* ── Action buttons ─────────────────────────── */}
            <div className="cm-buttons">
              <button className="cm-btn-cancel" onClick={onClose}>
                Cancel
              </button>
              <button
                className="cm-btn-create"
                disabled={!title.trim()}
                onClick={handleCreate}
              >
                Create
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
