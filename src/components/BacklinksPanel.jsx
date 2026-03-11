import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import { getBacklinks, getOutlinks } from '../db/store'
import './BacklinksPanel.css'

/**
 * BacklinksPanel — fixed right sidebar showing cross-matter links.
 *
 * When a node is selected, slides in from the right to show all
 * backlinks (nodes linking TO this node) and outlinks (nodes this
 * node links TO).
 *
 * @param {{
 *   nodeId: number | null,
 *   onNavigate: (matterId: number, nodeId: number) => void,
 *   onClose: () => void,
 * }}
 */
export default function BacklinksPanel({ nodeId, onNavigate, onClose }) {
  const [backlinks, setBacklinks] = useState([])
  const [outlinks, setOutlinks] = useState([])
  const [loading, setLoading] = useState(false)

  // ── Fetch links when nodeId changes ─────────────────────────
  useEffect(() => {
    if (nodeId == null) {
      setBacklinks([])
      setOutlinks([])
      return
    }

    let cancelled = false
    setLoading(true)

    Promise.all([getBacklinks(nodeId), getOutlinks(nodeId)])
      .then(([bl, ol]) => {
        if (cancelled) return
        setBacklinks(bl)
        setOutlinks(ol)
      })
      .catch((err) => console.error('[BacklinksPanel] fetch error:', err))
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [nodeId])

  // ── Stats for graph hint ────────────────────────────────────
  const totalNodes = backlinks.length + outlinks.length
  const matterSet = new Set()
  for (const b of backlinks) {
    if (b.sourceMatter?.id) matterSet.add(b.sourceMatter.id)
  }
  for (const o of outlinks) {
    if (o.targetMatter?.id) matterSet.add(o.targetMatter.id)
  }
  const totalMatters = matterSet.size

  // ── Helpers ─────────────────────────────────────────────────
  const excerpt = (content) => {
    if (!content) return 'Untitled'
    return content.substring(0, 80).split('\n')[0].trim() || 'Untitled'
  }

  const isOpen = nodeId != null

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.aside
          className="backlinks-panel"
          initial={{ x: 300, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 300, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        >
          {/* ── Header ─────────────────────────────────── */}
          <div className="bp-header">
            <div className="bp-header-left">
              <span className="bp-label">LINKED FROM</span>
              <span className="bp-badge">{totalNodes}</span>
            </div>
            <button
              className="bp-close"
              onClick={onClose}
              aria-label="Close backlinks panel"
            >
              <X size={14} />
            </button>
          </div>

          {/* ── Content ────────────────────────────────── */}
          <div className="bp-body">
            {loading ? (
              <div className="bp-empty">Loading…</div>
            ) : (
              <>
                {/* ── Section: Backlinks ─────────────── */}
                <div className="bp-section">
                  <span className="bp-section-title">Backlinks</span>
                  {backlinks.length === 0 ? (
                    <div className="bp-empty">
                      No links yet. Type <code>[[</code> in a node to create one.
                    </div>
                  ) : (
                    <div className="bp-list">
                      {backlinks.map((b) => (
                        <button
                          key={b.link.id}
                          className="bp-row"
                          onClick={() =>
                            onNavigate?.(
                              b.sourceNode.matterId,
                              b.sourceNode.id,
                            )
                          }
                        >
                          <span
                            className="bp-dot"
                            style={{
                              background: b.sourceMatter?.color || '#6366f1',
                              boxShadow: `0 0 6px ${b.sourceMatter?.color || '#6366f1'}`,
                            }}
                          />
                          <div className="bp-row-text">
                            <span className="bp-matter-name">
                              {b.sourceMatter?.title || 'Unknown'}
                            </span>
                            <span className="bp-excerpt">
                              {excerpt(b.sourceNode.content)}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* ── Section: Outlinks ──────────────── */}
                <div className="bp-section">
                  <span className="bp-section-title">Outlinks</span>
                  {outlinks.length === 0 ? (
                    <div className="bp-empty">
                      No links yet. Type <code>[[</code> in a node to create one.
                    </div>
                  ) : (
                    <div className="bp-list">
                      {outlinks.map((o) => (
                        <button
                          key={o.link.id}
                          className="bp-row"
                          onClick={() =>
                            onNavigate?.(
                              o.targetNode.matterId,
                              o.targetNode.id,
                            )
                          }
                        >
                          <span
                            className="bp-dot"
                            style={{
                              background: o.targetMatter?.color || '#6366f1',
                              boxShadow: `0 0 6px ${o.targetMatter?.color || '#6366f1'}`,
                            }}
                          />
                          <div className="bp-row-text">
                            <span className="bp-matter-name">
                              {o.targetMatter?.title || 'Unknown'}
                            </span>
                            <span className="bp-excerpt">
                              {excerpt(o.targetNode.content)}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* ── Graph Hint ─────────────────────────────── */}
          {totalNodes > 0 && (
            <div className="bp-graph-hint">
              {totalNodes} node{totalNodes !== 1 ? 's' : ''} connected across{' '}
              {totalMatters} matter{totalMatters !== 1 ? 's' : ''}
            </div>
          )}
        </motion.aside>
      )}
    </AnimatePresence>
  )
}
