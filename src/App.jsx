import { useState, useCallback, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Brain, BookOpen, Lightbulb, Rocket,
  Code2, Palette, Music, FlaskConical,
  Plus, X, Sparkles,
} from 'lucide-react'

import { useAllMatters, useActiveThread } from './hooks/useMatters'
import { useKeyboard } from './hooks/useKeyboard'
import { createMatter } from './db/store'

import Sidebar from './components/Sidebar'
import Thread from './components/Thread'
import Scrubber from './components/Scrubber'
import CommandPalette from './components/CommandPalette'

// ── Preset colors & icons ────────────────────────────────────
const COLOR_PRESETS = [
  '#FF3B5C', // Crimson
  '#00D4FF', // Cyan
  '#00FF9F', // Emerald
  '#A855F7', // Violet
  '#FBBF24', // Amber
  '#F472B6', // Rose
  '#6366F1', // Indigo
  '#84CC16', // Lime
]

const ICON_OPTIONS = [
  { key: 'brain',     Icon: Brain },
  { key: 'book',      Icon: BookOpen },
  { key: 'lightbulb', Icon: Lightbulb },
  { key: 'rocket',    Icon: Rocket },
  { key: 'code',      Icon: Code2 },
  { key: 'palette',   Icon: Palette },
  { key: 'music',     Icon: Music },
  { key: 'flask',     Icon: FlaskConical },
]

/**
 * App — Root layout composing Sidebar, Thread, Scrubber, and CommandPalette.
 */
export default function App() {
  // ── Core state ──────────────────────────────────────────────
  const [activeMatterId, setActiveMatterId] = useState(null)
  const [isPaletteOpen, setIsPaletteOpen] = useState(false)
  const [isCreateOpen, setIsCreateOpen] = useState(false)

  // ── Data ────────────────────────────────────────────────────
  const { matters, isLoading } = useAllMatters()
  const activeMatter = matters.find((m) => m.id === activeMatterId) || null

  // Load nodes for Scrubber
  const { nodes: threadNodes } = useActiveThread(activeMatterId)

  // ── Creation modal state ────────────────────────────────────
  const [newTitle, setNewTitle] = useState('')
  const [newColor, setNewColor] = useState(COLOR_PRESETS[6])
  const [newIcon, setNewIcon] = useState('brain')
  const titleInputRef = useRef(null)

  // ── Keyboard shortcuts ──────────────────────────────────────
  useKeyboard({
    'cmd+k': () => setIsPaletteOpen(true),
    Escape: () => {
      if (isPaletteOpen) setIsPaletteOpen(false)
      else if (isCreateOpen) setIsCreateOpen(false)
    },
  })

  // ── Handlers ────────────────────────────────────────────────
  const handleSelectMatter = useCallback((id) => {
    setActiveMatterId(id)
  }, [])

  const handleOpenCreate = useCallback(() => {
    setNewTitle('')
    setNewColor(COLOR_PRESETS[6])
    setNewIcon('brain')
    setIsCreateOpen(true)
    setTimeout(() => titleInputRef.current?.focus(), 100)
  }, [])

  const handleCreateMatter = useCallback(async () => {
    const title = newTitle.trim()
    if (!title) return

    const id = await createMatter({
      title,
      color: newColor,
      icon: newIcon,
    })

    setIsCreateOpen(false)
    setActiveMatterId(id)
  }, [newTitle, newColor, newIcon])

  const handlePaletteNavigate = useCallback((matterId, nodeId) => {
    setActiveMatterId(matterId)
    // TODO: scroll to nodeId within Thread (thread handles via its own state)
  }, [])

  const handleJumpTo = useCallback((nodeId) => {
    // Scroll the node into view — Thread handles via data-node-id
    const el = document.querySelector(`[data-node-id="${nodeId}"]`)
    el?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }, [])

  // ── Auto-select first matter on load ────────────────────────
  // FIXED: moved from render body → useEffect.
  // Calling setState during render is a React anti-pattern that
  // causes double-invocation in StrictMode (React 19). The brief
  // flash of activeMatterId=null plus matters=[] (before Dexie
  // resolves) could cascade into child components seeing empty
  // data and issuing destructive writes or clearing UI state.
  useEffect(() => {
    if (!isLoading && matters.length > 0 && activeMatterId == null) {
      setActiveMatterId(matters[0].id)
    }
  }, [isLoading, matters, activeMatterId])

  // ── Render ──────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-[#050505] text-white overflow-hidden">
      {/* ── Sidebar ──────────────────────────────────────── */}
      <Sidebar
        matters={matters}
        activeMatterId={activeMatterId}
        onSelect={handleSelectMatter}
        onCreateMatter={handleOpenCreate}
      />

      {/* ── Thread area ──────────────────────────────────── */}
      <main
        className="absolute top-0 bottom-12 right-0"
        style={{ left: 60 }}
      >
        {activeMatter ? (
          <Thread
            matterId={activeMatter.id}
            matterColor={activeMatter.color || '#6366f1'}
          />
        ) : !isLoading && matters.length === 0 ? (
          /* ── Welcome empty state ─────────────────────── */
          <div className="flex items-center justify-center h-full">
            <motion.div
              className="text-center space-y-6"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <div className="w-16 h-16 mx-auto rounded-2xl bg-indigo-500/10
                              flex items-center justify-center">
                <Sparkles size={28} className="text-indigo-400" />
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-bold text-white/90">
                  Welcome to Matters
                </h2>
                <p className="text-sm text-white/40 max-w-xs mx-auto">
                  Organize your thoughts as branching threads.
                  Each matter is a topic with connected notes.
                </p>
              </div>
              <button
                onClick={handleOpenCreate}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl
                           bg-indigo-600 hover:bg-indigo-500 text-white text-sm
                           font-medium transition-colors duration-150 cursor-pointer"
              >
                <Plus size={16} />
                Start your first Matter
              </button>
              <p className="text-[11px] text-white/20">
                or press{' '}
                <kbd className="px-1.5 py-0.5 rounded border border-white/10 text-white/30">
                  ⌘K
                </kbd>{' '}
                to search
              </p>
            </motion.div>
          </div>
        ) : null}
      </main>

      {/* ── Scrubber ─────────────────────────────────────── */}
      {activeMatter && threadNodes.length > 0 && (
        <div style={{ '--matter-color': activeMatter.color || '#6366f1' }}>
          <Scrubber nodes={threadNodes} onJumpTo={handleJumpTo} />
        </div>
      )}

      {/* ── Command Palette ──────────────────────────────── */}
      <CommandPalette
        isOpen={isPaletteOpen}
        onClose={() => setIsPaletteOpen(false)}
        onNavigate={handlePaletteNavigate}
      />

      {/* ── Create Matter Modal ──────────────────────────── */}
      <AnimatePresence>
        {isCreateOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsCreateOpen(false)}
            />

            {/* Modal */}
            <motion.div
              className="fixed inset-0 z-[91] flex items-center justify-center"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            >
              <div className="w-full max-w-sm mx-4 rounded-2xl overflow-hidden
                              bg-gray-950/95 border border-white/10 shadow-2xl p-5">
                {/* Header */}
                <div className="flex items-center justify-between mb-5">
                  <h3 className="text-base font-semibold text-white/90">
                    New Matter
                  </h3>
                  <button
                    onClick={() => setIsCreateOpen(false)}
                    className="p-1 rounded-lg text-white/30 hover:text-white/60
                               hover:bg-white/5 transition-colors cursor-pointer"
                  >
                    <X size={16} />
                  </button>
                </div>

                {/* Title input */}
                <div className="mb-4">
                  <label className="block text-xs text-white/30 mb-1.5">Title</label>
                  <input
                    ref={titleInputRef}
                    type="text"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCreateMatter()
                    }}
                    placeholder="e.g. System Design, Reading Notes…"
                    className="w-full bg-white/5 border border-white/10 rounded-lg
                               px-3 py-2 text-sm text-white/90 placeholder:text-white/20
                               outline-none focus:border-white/25 transition-colors"
                    autoComplete="off"
                  />
                </div>

                {/* Color picker */}
                <div className="mb-4">
                  <label className="block text-xs text-white/30 mb-1.5">Color</label>
                  <div className="flex gap-2">
                    {COLOR_PRESETS.map((color) => (
                      <button
                        key={color}
                        onClick={() => setNewColor(color)}
                        className={`w-7 h-7 rounded-full transition-all duration-150
                                    cursor-pointer ${
                                      newColor === color
                                        ? 'ring-2 ring-white/40 ring-offset-2 ring-offset-gray-950 scale-110'
                                        : 'hover:scale-110'
                                    }`}
                        style={{ backgroundColor: color }}
                        aria-label={`Select color ${color}`}
                      />
                    ))}
                  </div>
                </div>

                {/* Icon picker */}
                <div className="mb-5">
                  <label className="block text-xs text-white/30 mb-1.5">Icon</label>
                  <div className="flex gap-2">
                    {ICON_OPTIONS.map(({ key, Icon }) => (
                      <button
                        key={key}
                        onClick={() => setNewIcon(key)}
                        className={`w-8 h-8 rounded-lg flex items-center justify-center
                                    transition-all duration-150 cursor-pointer ${
                                      newIcon === key
                                        ? 'bg-white/10 border border-white/20'
                                        : 'bg-white/3 border border-transparent hover:bg-white/5'
                                    }`}
                      >
                        <Icon
                          size={16}
                          style={{ color: newIcon === key ? newColor : 'rgba(255,255,255,0.4)' }}
                        />
                      </button>
                    ))}
                  </div>
                </div>

                {/* Preview + Create button */}
                <div className="flex items-center gap-3">
                  {/* Mini preview */}
                  <div
                    className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center"
                    style={{
                      backgroundColor: `${newColor}20`,
                      boxShadow: `0 0 12px 2px ${newColor}40`,
                    }}
                  >
                    {(() => {
                      const opt = ICON_OPTIONS.find((o) => o.key === newIcon)
                      const I = opt?.Icon || Brain
                      return <I size={18} style={{ color: newColor }} />
                    })()}
                  </div>

                  <button
                    onClick={handleCreateMatter}
                    disabled={!newTitle.trim()}
                    className="flex-1 py-2 rounded-lg text-sm font-medium
                               transition-all duration-150 cursor-pointer
                               disabled:opacity-30 disabled:cursor-not-allowed"
                    style={{
                      backgroundColor: newTitle.trim() ? newColor : 'rgba(255,255,255,0.05)',
                      color: newTitle.trim() ? '#fff' : 'rgba(255,255,255,0.3)',
                    }}
                  >
                    Create Matter
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
