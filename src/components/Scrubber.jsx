import { useRef, useState, useMemo, useCallback, useEffect } from 'react'
import './Scrubber.css'

/**
 * Truncate text to maxLen chars, appending "…" if needed.
 */
function truncate(text, maxLen = 40) {
  if (!text) return '—'
  const clean = text.replace(/\n/g, ' ').trim()
  return clean.length > maxLen ? clean.slice(0, maxLen) + '…' : clean
}

/**
 * Format timestamp as "Mar 11 · 14:20".
 */
function fmtTime(ts) {
  const d = ts instanceof Date ? ts : new Date(ts)
  const month = d.toLocaleString('en-US', { month: 'short' })
  const day = d.getDate()
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  return `${month} ${day} · ${h}:${m}`
}

/**
 * Format today's date as "Mar 11, 2026".
 */
function fmtDate() {
  const d = new Date()
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/**
 * Scrubber — bottom timeline bar with proportional node dots,
 * a gradient fill, a draggable playhead, and a date label.
 *
 * Props:
 *   nodes      — array of node objects (need id, createdAt, content, isBranch)
 *   onJumpTo   — (nodeId) => void — scrolls Thread to that node
 */
export default function Scrubber({ nodes, onJumpTo }) {
  const trackRef = useRef(null)
  const [hoveredId, setHoveredId] = useState(null)

  // ── Playhead drag state ──────────────────────────────────────
  const [phLeft, setPhLeft] = useState(0)
  const dragging = useRef(false)
  const dragOffset = useRef(0)

  // ── Compute normalised positions ─────────────────────────────
  const positioned = useMemo(() => {
    if (!nodes || nodes.length === 0) return []

    const sorted = [...nodes].sort(
      (a, b) => new Date(a.createdAt) - new Date(b.createdAt),
    )

    const minT = new Date(sorted[0].createdAt).getTime()
    const maxT = new Date(sorted[sorted.length - 1].createdAt).getTime()
    const range = maxT - minT || 1

    return sorted.map((node) => ({
      ...node,
      ratio: (new Date(node.createdAt).getTime() - minT) / range,
    }))
  }, [nodes])

  // Fill bar width = rightmost node ratio
  const fillPct = positioned.length > 0
    ? positioned[positioned.length - 1].ratio * 100
    : 0

  // ── Playhead drag handlers ───────────────────────────────────
  const handlePhDown = useCallback((e) => {
    e.preventDefault()
    dragging.current = true
    const track = trackRef.current
    if (!track) return
    const rect = track.getBoundingClientRect()
    dragOffset.current = e.clientX - rect.left - phLeft
  }, [phLeft])

  useEffect(() => {
    const handleMove = (e) => {
      if (!dragging.current) return
      const track = trackRef.current
      if (!track) return
      const rect = track.getBoundingClientRect()
      const maxLeft = rect.width - 64 // playhead width
      let next = e.clientX - rect.left - dragOffset.current
      next = Math.max(0, Math.min(next, maxLeft))
      setPhLeft(next)
    }

    const handleUp = () => { dragging.current = false }

    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [])

  // ── Render ───────────────────────────────────────────────────
  const hoveredNode = hoveredId != null
    ? positioned.find((n) => n.id === hoveredId)
    : null

  return (
    <div className="sb-bar">
      {/* ── TIMELINE label ──────────────────────────────── */}
      <span className="sb-label">Timeline</span>

      {/* ── Track ────────────────────────────────────────── */}
      <div className="sb-track" ref={trackRef}>
        {/* gradient fill */}
        <div className="sb-fill" style={{ width: `${fillPct}%` }} />

        {/* dots */}
        {positioned.map((node) => {
          const isBranch = node.isBranch === true
          const isHov = hoveredId === node.id

          return (
            <button
              key={node.id}
              className={`sb-dot${isBranch ? ' is-branch' : ''}`}
              style={{ left: `${node.ratio * 100}%` }}
              onClick={() => onJumpTo?.(node.id)}
              onMouseEnter={() => setHoveredId(node.id)}
              onMouseLeave={() => setHoveredId(null)}
              aria-label={truncate(node.content)}
            >
              {/* tooltip */}
              {isHov && (
                <div className="sb-tooltip">
                  <p className="sb-tooltip-text">{truncate(node.content)}</p>
                  <p className="sb-tooltip-time">
                    {node.createdAt ? fmtTime(node.createdAt) : '—'}
                  </p>
                </div>
              )}
            </button>
          )
        })}

        {/* playhead */}
        <div
          className="sb-playhead"
          style={{ left: phLeft }}
          onMouseDown={handlePhDown}
        />
      </div>

      {/* ── Date label ───────────────────────────────────── */}
      <span className="sb-date">{fmtDate()}</span>
    </div>
  )
}
