import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CornerDownLeft, ArrowUp, ArrowDown } from 'lucide-react'
import { searchNodes, getNodesByTag, db } from '../db/store'
import './CommandPalette.css'

/* ── Helpers ─────────────────────────────────────────────────── */

/** Highlight matched substring with accent colour */
function HighlightMatch({ text, query }) {
  if (!query || !text) return <span>{text}</span>
  const clean = query.replace(/^#/, '').trim()
  if (!clean) return <span>{text}</span>
  const idx = text.toLowerCase().indexOf(clean.toLowerCase())
  if (idx === -1) return <span>{text}</span>
  return (
    <span>
      {text.slice(0, idx)}
      <span className="cp-match">{text.slice(idx, idx + clean.length)}</span>
      {text.slice(idx + clean.length)}
    </span>
  )
}

/** Truncate node content for result preview */
function excerpt(content, max = 80) {
  if (!content) return '—'
  const line = content.replace(/\n/g, ' ').trim()
  return line.length > max ? line.slice(0, max) + '…' : line
}

/* ═══════════════════════════════════════════════════════════════
   CommandPalette — ⌘K global search modal
   ═══════════════════════════════════════════════════════════════ */

/**
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

  /* ── Focus input on open ─────────────────────────────────── */
  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setResults([])
      setActiveIdx(0)
      const t = setTimeout(() => inputRef.current?.focus(), 80)
      return () => clearTimeout(t)
    }
  }, [isOpen])

  /* ── Load matters lookup ─────────────────────────────────── */
  useEffect(() => {
    if (!isOpen) return
    db.matters.toArray().then((all) => {
      const map = {}
      for (const m of all) map[m.id] = m
      setMattersMap(map)
    })
  }, [isOpen])

  /* ── Search on query change (debounced 120ms) ────────────── */
  useEffect(() => {
    if (!isOpen) return
    const trimmed = query.trim()
    if (!trimmed) { setResults([]); setActiveIdx(0); return }

    let cancelled = false
    const timer = setTimeout(async () => {
      let nodes
      if (trimmed.startsWith('#')) {
        const tag = trimmed.slice(1).trim()
        nodes = tag ? await getNodesByTag(tag) : []
      } else {
        nodes = await searchNodes(trimmed)
      }
      if (!cancelled) { setResults(nodes); setActiveIdx(0) }
    }, 120)

    return () => { cancelled = true; clearTimeout(timer) }
  }, [query, isOpen])

  /* ── Group results by matter ─────────────────────────────── */
  const grouped = useMemo(() => {
    const groups = []
    const seen = new Map()
    for (const node of results) {
      const mid = node.matterId
      if (!seen.has(mid)) {
        seen.set(mid, groups.length)
        groups.push({ matter: mattersMap[mid] || { id: mid, title: 'Unknown' }, nodes: [] })
      }
      groups[seen.get(mid)].nodes.push(node)
    }
    return groups
  }, [results, mattersMap])

  const flatList = results

  /* ── Keyboard handler ────────────────────────────────────── */
  const handleKeyDown = useCallback((e) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setActiveIdx((p) => Math.min(p + 1, flatList.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setActiveIdx((p) => Math.max(p - 1, 0))
        break
      case 'Enter':
        e.preventDefault()
        if (flatList[activeIdx]) {
          const n = flatList[activeIdx]
          onNavigate?.(n.matterId, n.id)
          onClose?.()
        }
        break
      case 'Escape':
        e.preventDefault()
        onClose?.()
        break
      default: break
    }
  }, [flatList, activeIdx, onNavigate, onClose])

  const isTagMode = query.trim().startsWith('#')

  // Flat counter while rendering grouped results
  let flatIndex = -1

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="cp-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={(e) => { if (e.target === e.currentTarget) onClose?.() }}
        >
          <motion.div
            className="cp-modal"
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.94 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={handleKeyDown}
          >
            {/* ── Input row ────────────────────────────────── */}
            <div className="cp-input-row">
              <span className="cp-icon">⌘</span>
              <input
                ref={inputRef}
                className="cp-input"
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search notes or #tags…"
                spellCheck={false}
                autoComplete="off"
              />
              <button className="cp-esc" onClick={onClose}>esc</button>
            </div>

            {/* ── Results ──────────────────────────────────── */}
            <div className="cp-results">
              {query.trim() && results.length === 0 && (
                <div className="cp-empty">No results found</div>
              )}

              {grouped.map((group) => (
                <div key={group.matter.id}>
                  <div className="cp-group-header">{group.matter.title}</div>

                  {group.nodes.map((node) => {
                    flatIndex++
                    const idx = flatIndex
                    const selected = idx === activeIdx

                    return (
                      <button
                        key={node.id}
                        className={`cp-row${selected ? ' is-selected' : ''}`}
                        onClick={() => { onNavigate?.(node.matterId, node.id); onClose?.() }}
                        onMouseEnter={() => setActiveIdx(idx)}
                      >
                        <div
                          className="cp-row-dot"
                          style={{ backgroundColor: group.matter.color || 'var(--cc)' }}
                        />
                        <div className="cp-row-body">
                          <div className="cp-row-title">
                            <HighlightMatch text={excerpt(node.content)} query={query} />
                          </div>

                          {node.tags?.length > 0 && (
                            <div className="cp-row-tags">
                              {node.tags.map((tag) => {
                                const isMatch = isTagMode &&
                                  tag.toLowerCase().includes(query.trim().slice(1).toLowerCase())
                                return (
                                  <span
                                    key={tag}
                                    className={`cp-row-tag${isMatch ? ' is-match' : ''}`}
                                  >
                                    #{tag}
                                  </span>
                                )
                              })}
                            </div>
                          )}
                        </div>

                        {selected && (
                          <CornerDownLeft size={13} style={{ color: 'var(--txt-4)', flexShrink: 0, marginTop: 3 }} />
                        )}
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>

            {/* ── Footer hints ─────────────────────────────── */}
            {results.length > 0 && (
              <div className="cp-footer">
                <span><ArrowUp size={10} /><ArrowDown size={10} /> navigate</span>
                <span><CornerDownLeft size={10} /> open</span>
                <span>esc close</span>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
