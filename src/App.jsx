import { useState, useCallback, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Plus, Sparkles } from 'lucide-react'

import { useAllMatters, useActiveThread } from './hooks/useMatters'
import { useKeyboard } from './hooks/useKeyboard'
import { createMatter } from './db/store'

import Sidebar from './components/Sidebar'
import TopBar from './components/TopBar'
import Thread from './components/Thread'
import Scrubber from './components/Scrubber'
import CommandPalette from './components/CommandPalette'
import CreateMatterModal from './components/CreateMatterModal'

/**
 * App — Root layout composing Sidebar, TopBar, Thread, Scrubber, and modals.
 */
export default function App() {
  // ── Core state ──────────────────────────────────────────────
  const [activeMatterId, setActiveMatterId] = useState(null)
  const [isPaletteOpen, setIsPaletteOpen] = useState(false)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [focusEnabled, setFocusEnabled] = useState(true)

  // ── Data ────────────────────────────────────────────────────
  const { matters, isLoading } = useAllMatters()
  const activeMatter = matters.find((m) => m.id === activeMatterId) || null

  // Load nodes for Scrubber + TopBar counts
  const { nodes: threadNodes } = useActiveThread(activeMatterId)

  // ── Derived counts ──────────────────────────────────────────
  const nodeCount = threadNodes.length
  const branchCount = threadNodes.filter((n) => n.isBranch === true).length

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
    setIsCreateOpen(true)
  }, [])

  const handleCreateMatter = useCallback(async ({ title, color, icon }) => {
    const id = await createMatter({ title, color, icon })
    setIsCreateOpen(false)
    setActiveMatterId(id)
  }, [])

  const handlePaletteNavigate = useCallback((matterId, nodeId) => {
    setActiveMatterId(matterId)
    if (nodeId) {
      setTimeout(() => {
        const el = document.querySelector(`[data-node-id="${nodeId}"]`)
        el?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
      }, 300)
    }
  }, [])

  const handleNavigate = useCallback((matterId, nodeId) => {
    if (matterId != null) setActiveMatterId(matterId)
    if (nodeId != null) {
      setTimeout(() => {
        const el = document.querySelector(`[data-node-id="${nodeId}"]`)
        el?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
      }, 300)
    }
  }, [])

  const handleJumpTo = useCallback((nodeId) => {
    const el = document.querySelector(`[data-node-id="${nodeId}"]`)
    el?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }, [])

  // ── Auto-select first matter on load ────────────────────────
  useEffect(() => {
    if (!isLoading && matters.length > 0 && activeMatterId == null) {
      setActiveMatterId(matters[0].id)
    }
  }, [isLoading, matters, activeMatterId])

  // ── Render ──────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 text-white overflow-hidden" style={{ background: 'var(--bg)' }}>
      {/* ── Sidebar ──────────────────────────────────────── */}
      <Sidebar
        matters={matters}
        activeMatterId={activeMatterId}
        onSelect={handleSelectMatter}
        onCreateMatter={handleOpenCreate}
      />

      {/* ── Thread area (TopBar + Thread) ────────────────── */}
      <main
        className="absolute top-0 right-0 flex flex-col"
        style={{ left: 68, bottom: 46 }}
      >
        {activeMatter ? (
          <>
            <TopBar
              matterTitle={activeMatter.title}
              nodeCount={nodeCount}
              branchCount={branchCount}
              focusEnabled={focusEnabled}
              onToggleFocus={() => setFocusEnabled((v) => !v)}
              onOpenSearch={() => setIsPaletteOpen(true)}
            />

            <Thread
              matterId={activeMatter.id}
              matterColor={activeMatter.color || 'var(--cc)'}
              focusEnabled={focusEnabled}
              onNavigate={handleNavigate}
            />
          </>
        ) : !isLoading && matters.length === 0 ? (
          /* ── Welcome empty state ─────────────────────── */
          <div className="flex items-center justify-center h-full">
            <motion.div
              className="text-center space-y-6"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <div
                className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center"
                style={{ background: 'color-mix(in srgb, var(--cc) 10%, transparent)' }}
              >
                <Sparkles size={28} style={{ color: 'var(--cc)' }} />
              </div>
              <div className="space-y-2">
                <h2
                  className="text-2xl font-bold"
                  style={{ color: 'var(--txt)', fontFamily: 'var(--font-display)' }}
                >
                  Welcome to Matters
                </h2>
                <p className="text-sm max-w-xs mx-auto" style={{ color: 'var(--txt-3)' }}>
                  Organize your thoughts as branching threads.
                  Each matter is a topic with connected notes.
                </p>
              </div>
              <button
                onClick={handleOpenCreate}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl
                           text-white text-sm font-medium transition-colors duration-150
                           cursor-pointer hover:opacity-90"
                style={{ background: 'var(--cc)' }}
              >
                <Plus size={16} />
                Start your first Matter
              </button>
              <p className="text-[11px]" style={{ color: 'var(--txt-4)' }}>
                or press{' '}
                <kbd
                  className="px-1.5 py-0.5 rounded"
                  style={{ border: '1px solid var(--border)', color: 'var(--txt-3)' }}
                >
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
        <Scrubber nodes={threadNodes} onJumpTo={handleJumpTo} />
      )}

      {/* ── Command Palette ──────────────────────────────── */}
      <CommandPalette
        isOpen={isPaletteOpen}
        onClose={() => setIsPaletteOpen(false)}
        onNavigate={handlePaletteNavigate}
      />

      {/* ── Create Matter Modal ──────────────────────────── */}
      <CreateMatterModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreateMatter={handleCreateMatter}
      />
    </div>
  )
}
