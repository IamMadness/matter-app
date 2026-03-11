import './TopBar.css'

/**
 * Inline search icon — no external library needed.
 */
function SearchIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  )
}

/**
 * TopBar — Thread-level navigation bar.
 *
 * Shows matter title, node/branch counts, focus toggle, and search trigger.
 *
 * @param {{
 *   matterTitle: string,
 *   nodeCount: number,
 *   branchCount: number,
 *   focusEnabled: boolean,
 *   onToggleFocus: Function,
 *   onOpenSearch: Function,
 * }}
 */
export default function TopBar({
  matterTitle,
  nodeCount,
  branchCount,
  focusEnabled,
  onToggleFocus,
  onOpenSearch,
}) {
  const badge = `${nodeCount} node${nodeCount !== 1 ? 's' : ''} · ${branchCount} branch${branchCount !== 1 ? 'es' : ''}`

  return (
    <div className="topbar">
      {/* 1. Matter title */}
      <span className="topbar-title">{matterTitle}</span>

      {/* 2. Separator */}
      <span className="topbar-sep">/</span>

      {/* 3. Node count badge */}
      <span className="topbar-badge">{badge}</span>

      {/* 4. Spacer */}
      <div style={{ flex: 1 }} />

      {/* 5. Focus toggle */}
      <button
        className={`topbar-focus${focusEnabled ? ' is-on' : ''}`}
        onClick={onToggleFocus}
      >
        Focus
      </button>

      {/* 6. Search trigger */}
      <button className="topbar-search" onClick={onOpenSearch}>
        <SearchIcon />
        <span>Search</span>
        <span className="kbd">⌘K</span>
      </button>
    </div>
  )
}
