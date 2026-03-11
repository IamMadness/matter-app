import { useState, useEffect, useCallback, useId } from 'react'

/**
 * BranchLine — SVG connector lines between nodes on the Thread.
 *
 * Draws smooth cubic bézier curves from a parent node to one or more
 * child nodes. For a single child → horizontal curve. For multiple
 * children → fork-style split.
 *
 * Pure visual component — no state side effects.
 *
 * @param {{
 *   fromRef: React.RefObject,
 *   toRefs: React.RefObject[],
 *   containerRef: React.RefObject,
 *   activeIds?: Set<number>,
 * }}
 */
export default function BranchLine({ fromRef, toRefs, containerRef, activeIds }) {
  const [paths, setPaths] = useState([])
  const filterId = useId()

  const recalc = useCallback(() => {
    const container = containerRef?.current
    const from = fromRef?.current
    if (!container || !from || !toRefs?.length) {
      setPaths([])
      return
    }

    const containerRect = container.getBoundingClientRect()

    // Source point — right-center of the parent node
    const fromRect = from.getBoundingClientRect()
    const sx = fromRect.right - containerRect.left
    const sy = fromRect.top + fromRect.height / 2 - containerRect.top

    const newPaths = toRefs
      .map((ref) => {
        const el = ref?.current
        if (!el) return null

        const toRect = el.getBoundingClientRect()
        // Target point — left-center of the child node
        const ex = toRect.left - containerRect.left
        const ey = toRect.top + toRect.height / 2 - containerRect.top

        // Control point offset — proportional to horizontal distance
        const dx = Math.abs(ex - sx)
        const cpOffset = Math.max(dx * 0.45, 40)

        // Cubic bézier: horizontal out → curve to target
        const d = `M ${sx} ${sy} C ${sx + cpOffset} ${sy}, ${ex - cpOffset} ${ey}, ${ex} ${ey}`

        // Determine if this path is on the active chain
        const nodeId = Number(el.dataset?.nodeId)
        const isActive = activeIds instanceof Set && activeIds.has(nodeId)

        return { d, isActive }
      })
      .filter(Boolean)

    setPaths(newPaths)
  }, [fromRef, toRefs, containerRef, activeIds])

  // ── Observe layout changes ──────────────────────────────────
  useEffect(() => {
    recalc()

    const container = containerRef?.current
    if (!container) return

    // ResizeObserver on the scroll container
    const ro = new ResizeObserver(recalc)
    ro.observe(container)

    // Also observe each node element for size changes
    const from = fromRef?.current
    if (from) ro.observe(from)
    toRefs.forEach((ref) => {
      if (ref?.current) ro.observe(ref.current)
    })

    // Recalc on scroll (the Thread scrolls horizontally)
    container.addEventListener('scroll', recalc, { passive: true })
    window.addEventListener('resize', recalc, { passive: true })

    return () => {
      ro.disconnect()
      container.removeEventListener('scroll', recalc)
      window.removeEventListener('resize', recalc)
    }
  }, [recalc, fromRef, toRefs, containerRef])

  if (paths.length === 0) return null

  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 0 }}
      aria-hidden="true"
    >
      <defs>
        {/* Glow filter for active paths */}
        <filter id={filterId} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Inactive paths first (behind) */}
      {paths
        .filter((p) => !p.isActive)
        .map((p, i) => (
          <path
            key={`inactive-${i}`}
            d={p.d}
            fill="none"
            stroke="rgba(255,255,255,0.12)"
            strokeWidth={1.5}
            strokeLinecap="round"
          />
        ))}

      {/* Active paths on top with glow */}
      {paths
        .filter((p) => p.isActive)
        .map((p, i) => (
          <path
            key={`active-${i}`}
            d={p.d}
            fill="none"
            stroke="var(--matter-color, #6366f1)"
            strokeWidth={2}
            strokeLinecap="round"
            filter={`url(#${filterId})`}
          />
        ))}
    </svg>
  )
}
