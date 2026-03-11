import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Hash, CornerDownLeft, ArrowUp, ArrowDown } from 'lucide-react'
import { searchNodes, getNodesByTag, db } from '../db/store'

/**
 * Highlight matched substring with bold styling.
 */
function HighlightMatch({ text, query }) {
  if (!query || !text) return <span>{text}</span>

  const clean = query.replace(/^#/, '').trim()
  if (!clean) return <span>{text}</span>

  const idx = text.toLowerCase().indexOf(clean.toLowerCase())
  if (idx === -1) return <span>{text}</span>

  const before = text.slice(0, idx)
  const match = text.slice(idx, idx + clean.length)
  const after = text.slice(idx + clean.length)

  return (
    <span>
      {before}
      <span className="text-white font-semibold">{match}</span>
      {after}
    </span>
  )
}

/**
 * Truncate node content for display.
 */
function excerpt(content, max = 80) {
  if (!content) return '—'
  const line = content.replace(/\n/g, ' ').trim()
  return line.length > max ? line.slice(0, max) + '…' : line
}

/**
 * CommandPalette — Cmd+K global search modal.
 *
 * Auto-detects search mode: "#tag" → tag search, else → full-text search.
 * Results grouped by Matter with keyboard navigation.
 *
 * @param {{
 *   isOpen: boolean,
 *   onClose: () => void,
 *   onNavigate: (matterId: number, nodeId: number) => void,
 * }}
 */
export default function CommandPalette({ isOpen, onClose, onNavigate }) {
  const inputRef = useRef(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [activeIdx, setActiveIdx] = useState(0)
  const [mattersMap, setMattersMap] = useState({})

  // ── Focus input on open ────────────────────────────────────
  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setResults([])
      setActiveIdx(0)
      // Small delay so Framer Motion animation completes
      const t = setTimeout(() => inputRef.current?.focus(), 80)
      return () => clearTimeout(t)
    }
  }, [isOpen])

  // ── Load matters map for grouping ──────────────────────────
  useEffect(() => {
    if (!isOpen) return
    db.matters.toArray().then((all) => {
      const map = {}
      for (const m of all) map[m.id] = m
      setMattersMap(map)
    })
  }, [isOpen])

  // ── Search on query change ─────────────────────────────────
  useEffect(() => {
    if (!isOpen) return

    const trimmed = query.trim()
    if (!trimmed) {
      setResults([])
      setActiveIdx(0)
      return
    }

    let cancelled = false

    const run = async () => {
      let nodes
      if (trimmed.startsWith('#')) {
        const tag = trimmed.slice(1).trim()
        nodes = tag ? await getNodesByTag(tag) : []
      } else {
        nodes = await searchNodes(trimmed)
      }
      if (!cancelled) {
        setResults(nodes)
        setActiveIdx(0)
      }
    }

    // Small debounce
    const timer = setTimeout(run, 120)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query, isOpen])

  // ── Group results by matter ────────────────────────────────
  const grouped = useMemo(() => {
    const groups = []
    const seen = new Map()

    for (const node of results) {
      const mid = node.matterId
      if (!seen.has(mid)) {
        seen.set(mid, groups.length)
        groups.push({
          matter: mattersMap[mid] || { id: mid, title: 'Unknown' },
          nodes: [],
        })
      }
      groups[seen.get(mid)].nodes.push(node)
    }

    return groups
  }, [results, mattersMap])

  // Flat list for keyboard navigation
  const flatList = useMemo(() => results, [results])

  // ── Keyboard navigation ────────────────────────────────────
  const handleKeyDown = useCallback(
    (e) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setActiveIdx((prev) => Math.min(prev + 1, flatList.length - 1))
          break
        case 'ArrowUp':
          e.preventDefault()
          setActiveIdx((prev) => Math.max(prev - 1, 0))
          break
        case 'Enter':
          e.preventDefault()
          if (flatList[activeIdx]) {
            const node = flatList[activeIdx]
            onNavigate?.(node.matterId, node.id)
            onClose?.()
          }
          break
        case 'Escape':
          e.preventDefault()
          onClose?.()
          break
        default:
          break
      }
    },
    [flatList, activeIdx, onNavigate, onClose],
  )

  // Track which flat index we're at while rendering groups
  let flatIndex = -1

  const isTagMode = query.trim().startsWith('#')

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* ── Backdrop ─────────────────────────────────── */}
          <motion.div
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
          />

          {/* ── Modal ────────────────────────────────────── */}
          <motion.div
            className="fixed inset-0 z-[101] flex items-start justify-center pt-[15vh]"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          >
            <div
              className="w-full max-w-lg mx-4 rounded-2xl overflow-hidden
                         bg-gray-950/95 border border-white/10 shadow-2xl"
              onKeyDown={handleKeyDown}
            >
              {/* ── Search input ──────────────────────────── */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5">
                {isTagMode ? (
                  <Hash size={18} className="text-purple-400 shrink-0" />
                ) : (
                  <Search size={18} className="text-white/30 shrink-0" />
                )}
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search notes or #tags..."
                  className="flex-1 bg-transparent text-sm text-white/90
                             placeholder:text-white/25 outline-none"
                  spellCheck={false}
                  autoComplete="off"
                />
                <kbd className="hidden sm:flex items-center gap-0.5 text-[10px]
                                text-white/20 border border-white/10 rounded px-1.5 py-0.5">
                  esc
                </kbd>
              </div>

              {/* ── Results ──────────────────────────────── */}
              <div className="max-h-[360px] overflow-y-auto">
                {query.trim() && results.length === 0 && (
                  <div className="px-4 py-8 text-center text-sm text-white/25">
                    No results found
                  </div>
                )}

                {grouped.map((group) => (
                  <div key={group.matter.id}>
                    {/* Group header */}
                    <div className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase
                                    tracking-wider text-white/20">
                      {group.matter.title}
                    </div>

                    {group.nodes.map((node) => {
                      flatIndex++
                      const idx = flatIndex
                      const isActive = idx === activeIdx

                      return (
                        <button
                          key={node.id}
                          onClick={() => {
                            onNavigate?.(node.matterId, node.id)
                            onClose?.()
                          }}
                          onMouseEnter={() => setActiveIdx(idx)}
                          className={`
                            w-full text-left px-4 py-2.5 flex items-start gap-3
                            transition-colors duration-75 cursor-pointer
                            ${isActive ? 'bg-white/5' : 'hover:bg-white/3'}
                          `}
                        >
                          {/* Accent dot */}
                          <div
                            className="shrink-0 mt-1.5 w-2 h-2 rounded-full"
                            style={{
                              backgroundColor:
                                group.matter.color || 'var(--matter-color, #6366f1)',
                            }}
                          />

                          <div className="flex-1 min-w-0">
                            {/* Content excerpt */}
                            <p className="text-sm text-white/60 truncate leading-snug">
                              <HighlightMatch
                                text={excerpt(node.content)}
                                query={query}
                              />
                            </p>

                            {/* Tags */}
                            {node.tags?.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {node.tags.map((tag) => (
                                  <span
                                    key={tag}
                                    className={`text-[10px] px-1.5 py-0 rounded-full
                                      ${isTagMode &&
                                        tag.toLowerCase().includes(
                                          query.trim().slice(1).toLowerCase(),
                                        )
                                        ? 'bg-purple-500/20 text-purple-300'
                                        : 'bg-white/5 text-white/30'
                                      }`}
                                  >
                                    #{tag}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Enter hint on active item */}
                          {isActive && (
                            <CornerDownLeft
                              size={14}
                              className="shrink-0 mt-1 text-white/15"
                            />
                          )}
                        </button>
                      )
                    })}
                  </div>
                ))}
              </div>

              {/* ── Footer hints ─────────────────────────── */}
              {results.length > 0 && (
                <div className="flex items-center gap-4 px-4 py-2 border-t border-white/5
                                text-[10px] text-white/15">
                  <span className="flex items-center gap-1">
                    <ArrowUp size={10} />
                    <ArrowDown size={10} />
                    navigate
                  </span>
                  <span className="flex items-center gap-1">
                    <CornerDownLeft size={10} />
                    open
                  </span>
                  <span className="flex items-center gap-1">
                    esc close
                  </span>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
