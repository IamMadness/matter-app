import { useState, useCallback, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Plus, Trash2, Pencil, Check } from 'lucide-react'
import { updateNode } from '../db/store'
import './Node.css'

/**
 * Format a Date (or timestamp number) as "Mar 11 · 09:12".
 */
function formatTimestamp(ts) {
  const d = ts instanceof Date ? ts : new Date(ts)
  const month = d.toLocaleString('en-US', { month: 'short' })
  const day = d.getDate()
  const hours = String(d.getHours()).padStart(2, '0')
  const mins = String(d.getMinutes()).padStart(2, '0')
  return `${month} ${day} · ${hours}:${mins}`
}

/**
 * Custom markdown components for dark-theme rendering.
 */
const mdComponents = {
  h1: (props) => <h1 className="text-lg font-bold text-white/90 mb-1" {...props} />,
  h2: (props) => <h2 className="text-base font-semibold text-white/85 mb-1" {...props} />,
  h3: (props) => <h3 className="text-sm font-semibold text-white/80 mb-1" {...props} />,
  p: (props) => <p className="text-sm text-white/70 leading-relaxed mb-2 last:mb-0" {...props} />,
  strong: (props) => <strong className="text-white/90 font-semibold" {...props} />,
  em: (props) => <em className="text-white/60 italic" {...props} />,
  ul: (props) => <ul className="list-disc list-inside text-sm text-white/70 mb-2 space-y-0.5" {...props} />,
  ol: (props) => <ol className="list-decimal list-inside text-sm text-white/70 mb-2 space-y-0.5" {...props} />,
  li: (props) => <li className="text-sm text-white/70" {...props} />,
  a: (props) => <a className="text-blue-400 underline underline-offset-2 hover:text-blue-300" {...props} />,
  blockquote: (props) => (
    <blockquote
      className="border-l-2 border-white/20 pl-3 my-2 text-sm text-white/50 italic"
      {...props}
    />
  ),
  code: ({ className, children, ...props }) => {
    const isInline = !className && typeof children === 'string' && !children.includes('\n')
    if (isInline) {
      return (
        <code
          className="bg-white/10 text-pink-300 text-xs px-1.5 py-0.5 rounded font-mono"
          {...props}
        >
          {children}
        </code>
      )
    }
    return (
      <pre className="bg-black/40 rounded-lg p-3 my-2 overflow-x-auto">
        <code className="text-xs text-green-300 font-mono" {...props}>
          {children}
        </code>
      </pre>
    )
  },
  hr: () => <hr className="border-white/10 my-3" />,
  table: (props) => (
    <div className="overflow-x-auto my-2">
      <table className="text-xs text-white/70 border-collapse w-full" {...props} />
    </div>
  ),
  th: (props) => <th className="border border-white/10 px-2 py-1 text-left text-white/80 font-semibold" {...props} />,
  td: (props) => <td className="border border-white/10 px-2 py-1" {...props} />,
}

/**
 * Node — "The Card"
 *
 * Individual note card with markdown content, tags, and timestamp.
 * Redesigned to match the Matters visual system.
 *
 * @param {{
 *   node: Object,
 *   isActive: boolean,
 *   isAncestor: boolean,
 *   isDescendant: boolean,
 *   matterColor: string,
 *   onSelect: Function,
 *   onAddChild: Function,
 *   onDelete: Function,
 * }}
 */
export default function Node({
  node,
  isActive,
  isAncestor,
  isDescendant,
  matterColor,
  onSelect,
  onAddChild,
  onDelete,
}) {
  const [hovered, setHovered] = useState(false)
  const [editing, setEditing] = useState(!node.content) // auto-edit empty nodes
  const [editContent, setEditContent] = useState(node.content || '')
  const [editTags, setEditTags] = useState((node.tags ?? []).join(', '))
  const textareaRef = useRef(null)

  // Focus textarea when entering edit mode
  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus()
      textareaRef.current.setSelectionRange(
        textareaRef.current.value.length,
        textareaRef.current.value.length,
      )
    }
  }, [editing])

  const handleSave = useCallback(async () => {
    const tags = editTags
      .split(',')
      .map((t) => t.trim().replace(/^#/, '').toLowerCase())
      .filter(Boolean)
    await updateNode(node.id, { content: editContent, tags })
    setEditing(false)
  }, [node.id, editContent, editTags])

  // Dim nodes that are neither active, ancestor, nor descendant
  // when a focus mode is implied (i.e. there IS an active node but this isn't it).
  const dimmed = !isActive && !isAncestor && !isDescendant

  const handleDoubleClick = useCallback(
    (e) => {
      // Only trigger on the card edge (not on inner content)
      if (e.target === e.currentTarget) {
        onAddChild?.(node.id, true) // isBranch = true
      }
    },
    [node.id, onAddChild],
  )

  const tags = node.tags ?? []
  const isBranch = node.isBranch === true

  // Node label: NODE_01, NODE_02, etc.
  const nodeLabel = `NODE_${String(node.order ?? 0).padStart(2, '0')}`

  // Card class list
  const cardClasses = [
    'node-card',
    isActive && 'is-active',
    dimmed && 'is-dimmed',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <motion.div
      className="relative flex items-center group"
      initial={{ opacity: 0, x: 32 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* ── The Card ─────────────────────────────────────── */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => onSelect?.(node.id)}
        onDoubleClick={handleDoubleClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={cardClasses}
        style={{ '--matter-color': matterColor || '#6366f1' }}
      >
        {/* ── 1. Node Header ─────────────────────────────── */}
        <div className="node-header">
          <span className="node-index">{nodeLabel}</span>
          {isBranch && (
            <span className="node-branch-badge">⑂ branch</span>
          )}
        </div>

        {/* ── 2. Tags Row ────────────────────────────────── */}
        {!editing && tags.length > 0 && (
          <div className="node-tags">
            {tags.map((tag) => (
              <span key={tag} className="tag-pill">
                #{tag}
              </span>
            ))}
          </div>
        )}

        {/* ── 3. Content ─────────────────────────────────── */}
        {editing ? (
          <div onClick={(e) => e.stopPropagation()}>
            <div className="node-content is-editing">
              <textarea
                ref={textareaRef}
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault()
                    handleSave()
                  }
                  if (e.key === 'Escape') {
                    setEditContent(node.content || '')
                    setEditTags((node.tags ?? []).join(', '))
                    setEditing(false)
                  }
                }}
                placeholder="Write your note in Markdown…"
                rows={4}
                spellCheck={false}
              />
            </div>

            {/* ── 4. Tags Input Row (editing only) ─────────── */}
            <div className="tags-input-row">
              <span className="tag-icon">#</span>
              <input
                type="text"
                value={editTags}
                onChange={(e) => setEditTags(e.target.value)}
                placeholder="add tags, comma-separated"
              />
            </div>
          </div>
        ) : (
          <div
            className="node-content"
            onDoubleClick={(e) => {
              e.stopPropagation()
              setEditContent(node.content || '')
              setEditTags((node.tags ?? []).join(', '))
              setEditing(true)
            }}
          >
            <div className="node-prose">
              {node.content ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                  {node.content}
                </ReactMarkdown>
              ) : (
                <p style={{ color: 'rgba(255,255,255,0.15)', fontStyle: 'italic', fontSize: '12.5px' }}>
                  Double-click to edit…
                </p>
              )}
            </div>
          </div>
        )}

        {/* ── 5. Footer ──────────────────────────────────── */}
        <div className="node-footer">
          <span className="node-time">
            {node.createdAt ? formatTimestamp(node.createdAt) : '—'}
          </span>

          <div className="node-actions">
            {editing ? (
              <>
                <span className="kbd-hint">⌘↵</span>
                <button className="save-btn" onClick={(e) => { e.stopPropagation(); handleSave() }}>
                  <Check size={10} /> Save
                </button>
              </>
            ) : (
              <>
                <motion.button
                  initial={false}
                  animate={{ opacity: hovered ? 1 : 0 }}
                  transition={{ duration: 0.12 }}
                  onClick={(e) => {
                    e.stopPropagation()
                    setEditContent(node.content || '')
                    setEditTags((node.tags ?? []).join(', '))
                    setEditing(true)
                  }}
                  className="node-icon-btn"
                  aria-label="Edit node"
                >
                  <Pencil size={12} />
                </motion.button>
                <motion.button
                  initial={false}
                  animate={{ opacity: hovered ? 1 : 0 }}
                  transition={{ duration: 0.12 }}
                  onClick={(e) => {
                    e.stopPropagation()
                    onDelete?.(node.id)
                  }}
                  className="node-icon-btn"
                  aria-label="Delete node"
                >
                  <Trash2 size={12} />
                </motion.button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── "Add child" button — appears to the right on hover ── */}
      <motion.button
        initial={false}
        animate={{ opacity: hovered ? 1 : 0, x: hovered ? 0 : -8 }}
        transition={{ duration: 0.15 }}
        onClick={(e) => {
          e.stopPropagation()
          onAddChild?.(node.id, false)
        }}
        className="node-add-child"
        style={{ '--matter-color': matterColor || '#6366f1' }}
        aria-label="Add child node"
      >
        <Plus size={14} />
      </motion.button>
    </motion.div>
  )
}
