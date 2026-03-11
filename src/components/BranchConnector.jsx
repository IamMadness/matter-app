import { useState, useEffect, useCallback, useId, useRef } from 'react'

/**
 * BranchConnector — SVG fork connector for multi-child nodes.
 *
 * Renders a 56px-wide connector area with cubic bézier paths from a single
 * parent exit-point to each child entry-point. The first (top) child gets a
 * solid accent-coloured line; additional children get dashed purple lines
 * to visually indicate a fork.
 *
 * Props:
 * @param {React.RefObject}   parentRef    - Ref to the parent node element
 * @param {React.RefObject[]} childRefs    - Refs to each child node element
 * @param {React.RefObject}   containerRef - Ref to the scroll-container (thread-canvas)
 * @param {string}            matterColor  - CSS color string for --cc
 */
export default function BranchConnector({ parentRef, childRefs, containerRef, matterColor }) {
  const [geometry, setGeometry] = useState(null)
  const filterId = useId()
  const wrapRef = useRef(null)

  /* ── Recalculate SVG geometry ─────────────────────────── */
  const recalc = useCallback(() => {
    const wrap = wrapRef.current
    const parent = parentRef?.current
    if (!wrap || !parent || !childRefs?.length) {
      setGeometry(null)
      return
    }

    const wrapRect = wrap.getBoundingClientRect()

    // Source: right-center of parent, mapped into the wrapper's coordinate space
    const pRect = parent.getBoundingClientRect()
    const sx = 0                                       // left edge of the 56px wrapper
    const sy = pRect.top + pRect.height / 2 - wrapRect.top

    const items = childRefs
      .map((ref, idx) => {
        const el = ref?.current
        if (!el) return null
        const cRect = el.getBoundingClientRect()
        const ex = 56                                  // right edge of the wrapper
        const ey = cRect.top + cRect.height / 2 - wrapRect.top
        return { ex, ey, idx }
      })
      .filter(Boolean)

    if (items.length === 0) { setGeometry(null); return }

    // SVG viewBox height = farthest child bottom + some padding
    const minY = Math.min(sy, ...items.map((i) => i.ey))
    const maxY = Math.max(sy, ...items.map((i) => i.ey))
    const padY = 12
    const vbTop = minY - padY
    const vbH = maxY - minY + padY * 2

    const paths = items.map(({ ex, ey, idx }) => {
      const cpx = 56 * 0.55   // control-point x offset (≈30px)
      const d = `M ${sx} ${sy} C ${sx + cpx} ${sy}, ${ex - cpx} ${ey}, ${ex} ${ey}`
      const isMain = idx === 0
      return { d, ex, ey, isMain }
    })

    setGeometry({ sx, sy, paths, vbTop, vbH })
  }, [parentRef, childRefs])

  /* ── Observe layout changes ───────────────────────────── */
  useEffect(() => {
    recalc()

    const ro = new ResizeObserver(recalc)
    const parent = parentRef?.current
    if (parent) ro.observe(parent)
    childRefs.forEach((r) => { if (r?.current) ro.observe(r.current) })
    const container = containerRef?.current
    if (container) ro.observe(container)

    window.addEventListener('resize', recalc, { passive: true })
    container?.addEventListener('scroll', recalc, { passive: true })

    return () => {
      ro.disconnect()
      window.removeEventListener('resize', recalc)
      container?.removeEventListener('scroll', recalc)
    }
  }, [recalc, parentRef, childRefs, containerRef])

  if (!geometry) return null

  const { sx, sy, paths, vbTop, vbH } = geometry
  const accentColor = matterColor || 'var(--cc)'
  const forkColor = '#B06EF7'

  return (
    <div
      ref={wrapRef}
      className="branch-conn-wrap"
      style={{
        width: 56,
        flexShrink: 0,
        position: 'relative',
        alignSelf: 'stretch',
        zIndex: 0,
        pointerEvents: 'none',
      }}
    >
      <svg
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: 56,
          height: '100%',
          overflow: 'visible',
          pointerEvents: 'none',
        }}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          {/* Glow filter */}
          <filter id={`${filterId}-glow`} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Drop-shadow for dots */}
          <filter id={`${filterId}-dot`} x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="1.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* ── Paths ────────────────────────────────────────── */}
        {paths.map((p, i) => (
          <path
            key={i}
            d={p.d}
            fill="none"
            stroke={p.isMain
              ? `color-mix(in srgb, ${accentColor} 42%, transparent)`
              : `color-mix(in srgb, ${forkColor} 42%, transparent)`
            }
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeDasharray={p.isMain ? 'none' : '5 4'}
            filter={`url(#${filterId}-glow)`}
          />
        ))}

        {/* ── Source dot (left, on parent) ──────────────────── */}
        <circle
          cx={sx}
          cy={sy}
          r={3.5}
          fill={accentColor}
          filter={`url(#${filterId}-dot)`}
        />

        {/* ── Target dots (right, on each child) ───────────── */}
        {paths.map((p, i) => (
          <circle
            key={`dot-${i}`}
            cx={p.ex}
            cy={p.ey}
            r={3}
            fill={p.isMain ? accentColor : forkColor}
            filter={`url(#${filterId}-dot)`}
          />
        ))}
      </svg>
    </div>
  )
}
