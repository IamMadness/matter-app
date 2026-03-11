import { useRef, useState, useMemo, useCallback } from 'react'
import { motion } from 'framer-motion'

const BAR_H = 48
const DOT_SIZE = 6
const DIAMOND_SIZE = 9
const PADDING_X = 24

/**
 * Format a timestamp as "Mar 8 · 18:20".
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
 * Truncate text to maxLen chars, appending "…" if needed.
 */
function truncate(text, maxLen = 40) {
  if (!text) return '—'
  const clean = text.replace(/\n/g, ' ').trim()
  return clean.length > maxLen ? clean.slice(0, maxLen) + '…' : clean
}

/**
 * Scrubber — "The Chronology Bar"
 *
 * Fixed bottom bar with a proportional timeline of node dots.
 * Clicking a dot jumps the Thread to that node.
 *
 * @param {{
 *   nodes: Array,
 *   onJumpTo: (nodeId: number) => void,
 *   viewportRatio?: { start: number, end: number },
 * }}
 */
export default function Scrubber({ nodes, onJumpTo, viewportRatio }) {
  const trackRef = useRef(null)
  const [hoveredId, setHoveredId] = useState(null)
  const [tooltipPos, setTooltipPos] = useState({ x: 0 })

  // ── Compute proportional x-positions based on timestamps ───
  const positioned = useMemo(() => {
    if (!nodes || nodes.length === 0) return []

    const sorted = [...nodes].sort(
      (a, b) => new Date(a.createdAt) - new Date(b.createdAt),
    )

    const minT = new Date(sorted[0].createdAt).getTime()
    const maxT = new Date(sorted[sorted.length - 1].createdAt).getTime()
    const range = maxT - minT || 1 // avoid div-by-zero

    return sorted.map((node) => ({
      ...node,
      // 0 → 1 normalised position
      ratio: (new Date(node.createdAt).getTime() - minT) / range,
    }))
  }, [nodes])

  // ── Playhead drag constraints ──────────────────────────────
  const playheadConstraints = useRef(null)

  // ── Handle dot hover for tooltip positioning ───────────────
  const handleDotHover = useCallback((e, nodeId) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setTooltipPos({ x: rect.left + rect.width / 2 })
    setHoveredId(nodeId)
  }, [])

  const hoveredNode = hoveredId != null
    ? positioned.find((n) => n.id === hoveredId)
    : null

  // Viewport indicator (playhead) position
  const vpStart = viewportRatio?.start ?? 0
  const vpEnd = viewportRatio?.end ?? 1

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-40 flex items-center
                 bg-black/80 backdrop-blur-md border-t border-white/10"
      style={{ height: BAR_H }}
    >
      {/* ── Track ──────────────────────────────────────────── */}
      <div
        ref={(el) => {
          trackRef.current = el
          playheadConstraints.current = el
        }}
        className="relative flex-1 h-full mx-4"
        style={{ paddingLeft: PADDING_X, paddingRight: PADDING_X }}
      >
        {/* Centre line */}
        <div className="absolute top-1/2 -translate-y-1/2 left-6 right-6 h-px bg-white/8" />

        {/* ── Dots ─────────────────────────────────────────── */}
        {positioned.map((node) => {
          const isBranch = node.isBranch === true
          const isHov = hoveredId === node.id
          const leftPct = `calc(${PADDING_X}px + ${node.ratio * 100}% * (1 - ${(PADDING_X * 2)}px / 100%))`

          return (
            <button
              key={node.id}
              onClick={() => onJumpTo?.(node.id)}
              onMouseEnter={(e) => handleDotHover(e, node.id)}
              onMouseLeave={() => setHoveredId(null)}
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2
                         cursor-pointer transition-transform duration-150
                         hover:scale-150 focus:outline-none"
              style={{ left: `${node.ratio * 100}%`, marginLeft: PADDING_X }}
              aria-label={truncate(node.content)}
            >
              <div
                className={`
                  transition-all duration-150
                  ${isBranch
                    ? 'rotate-45 rounded-sm'
                    : 'rounded-full'
                  }
                `}
                style={{
                  width: isBranch ? DIAMOND_SIZE : DOT_SIZE,
                  height: isBranch ? DIAMOND_SIZE : DOT_SIZE,
                  backgroundColor: 'var(--matter-color, #6366f1)',
                  boxShadow: isHov
                    ? '0 0 8px 2px var(--matter-color, #6366f1)'
                    : 'none',
                }}
              />
            </button>
          )
        })}

        {/* ── Playhead viewport indicator ──────────────────── */}
        <motion.div
          className="absolute top-1 bottom-1 rounded-md border border-white/15
                     bg-white/5 cursor-grab active:cursor-grabbing"
          style={{
            left: `${vpStart * 100}%`,
            width: `${(vpEnd - vpStart) * 100}%`,
            marginLeft: PADDING_X,
          }}
          drag="x"
          dragConstraints={playheadConstraints}
          dragElastic={0}
          dragMomentum={false}
        />

        {/* ── Tooltip ──────────────────────────────────────── */}
        {hoveredNode && (
          <div
            className="absolute bottom-full mb-2 -translate-x-1/2
                       px-3 py-1.5 rounded-lg bg-black/90 border border-white/10
                       text-xs text-white/70 whitespace-nowrap pointer-events-none
                       shadow-lg"
            style={{ left: `${hoveredNode.ratio * 100}%`, marginLeft: PADDING_X }}
          >
            <p className="text-white/90 font-medium mb-0.5">
              {truncate(hoveredNode.content)}
            </p>
            <p className="text-white/40 text-[10px] font-mono">
              {hoveredNode.createdAt ? fmtTime(hoveredNode.createdAt) : '—'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
