import './Sidebar.css'

/**
 * Map hex colour → CSS accent class defined in index.css.
 * Falls back to 'm-indigo' when there's no match.
 */
const HEX_TO_CLASS = {
  '#FF3B5C': 'm-rose',
  '#00D4FF': 'm-cyan',
  '#00FF9F': 'm-mint',
  '#A855F7': 'm-purple',
  '#FBBF24': 'm-amber',
  '#F472B6': 'm-pink',
  '#6366F1': 'm-indigo',
  '#84CC16': 'm-lime',
}

function colorClass(hex) {
  if (!hex) return 'm-indigo'
  return HEX_TO_CLASS[hex.toUpperCase()] ?? 'm-indigo'
}

/**
 * Sidebar — "The Spine"
 *
 * Fixed 68 px left rail. Shows matter emoji buttons, a logo mark,
 * and a create-matter button. Never expands.
 *
 * @param {{
 *   matters: Array,
 *   activeMatterId: number|null,
 *   onSelect: Function,
 *   onCreateMatter: Function,
 * }}
 */
export default function Sidebar({ matters, activeMatterId, onSelect, onCreateMatter }) {
  return (
    <aside className="sidebar-rail">
      {/* ── Logo ──────────────────────────────────────────── */}
      <span className="sidebar-logo">MTR</span>

      {/* ── Matter buttons ────────────────────────────────── */}
      {matters.map((matter) => {
        const isActive = matter.id === activeMatterId
        const cls = `matter-btn ${colorClass(matter.color)}${isActive ? ' is-active' : ''}`

        return (
          <button
            key={matter.id}
            className={cls}
            data-tip={matter.title}
            onClick={() => onSelect(matter.id)}
          >
            {matter.icon ?? '🧠'}
          </button>
        )
      })}

      {/* ── Divider ───────────────────────────────────────── */}
      <div className="sidebar-divider" />

      {/* ── Add button (pinned to bottom via margin-top:auto) */}
      <button className="sidebar-add" onClick={onCreateMatter}>
        +
      </button>
    </aside>
  )
}
