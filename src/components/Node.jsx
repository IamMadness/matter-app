import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import React from 'react'
import { motion } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Trash2, Check } from 'lucide-react'
import { updateNode } from '../db/store'
import useLinkAutocomplete from '../hooks/useLinkAutocomplete.jsx'
import './Node.css'
import './LinkAutocomplete.css'

/* ── Helpers ─────────────────────────────────────────────────── */

/** Format a Date as "MAR 11 · 09:12" */
function formatTimestamp(ts) {
  const d = ts instanceof Date ? ts : new Date(ts)
  const month = d.toLocaleString('en-US', { month: 'short' }).toUpperCase()
  const day = d.getDate()
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  return `${month} ${day} · ${h}:${m}`
}

/** Simple hash → 0..4 for tag colour variant */
function tagVariant(tag) {
  let h = 0
  for (let i = 0; i < tag.length; i++) h = ((h << 5) - h + tag.charCodeAt(i)) | 0
  return Math.abs(h) % 5
}

/** Replace [[Title]] in React children with styled chips */
const WIKI_RE = /(\[\[.+?\]\])/

function injectWikiLinks(children, onNavigate) {
  return React.Children.map(children, (child) => {
    if (typeof child !== 'string') return child
    const parts = child.split(WIKI_RE)
    if (parts.length === 1) return child
    return parts.map((part, i) => {
      const m = part.match(/^\[\[(.+?)\]\]$/)
      if (m) {
        return (
          <span
            key={i}
            className="wiki-link-chip"
            role="link"
            onClick={(e) => { e.stopPropagation(); onNavigate?.(m[1]) }}
          >
            {m[1]}
          </span>
        )
      }
      return part
    })
  })
}

/** Markdown component overrides — design-token aware */
function buildMdComponents(onNavigate) {
  const wl = (Tag, cls, style) => ({ children, ...props }) => (
    <Tag className={cls} style={style} {...props}>{injectWikiLinks(children, onNavigate)}</Tag>
  )

  return {
    h1: wl('h1', 'text-lg font-bold mb-1', { color: 'var(--txt)', fontFamily: 'var(--font-display)' }),
    h2: wl('h2', 'text-base font-semibold mb-1', { color: 'var(--txt)', fontFamily: 'var(--font-display)' }),
    h3: wl('h3', 'text-sm font-semibold mb-1', { color: 'var(--txt)', fontFamily: 'var(--font-display)' }),
    p: wl('p', 'text-sm leading-relaxed mb-2 last:mb-0', { color: 'var(--txt-2)' }),
    strong: wl('strong', 'font-semibold', { color: 'var(--txt)' }),
    em: wl('em', 'italic', { color: 'var(--txt-3)' }),
    ul: (props) => <ul className="list-disc list-inside text-sm mb-2 space-y-0.5" style={{ color: 'var(--txt-2)' }} {...props} />,
    ol: (props) => <ol className="list-decimal list-inside text-sm mb-2 space-y-0.5" style={{ color: 'var(--txt-2)' }} {...props} />,
    li: wl('li', 'text-sm', { color: 'var(--txt-2)' }),
    a: (props) => <a className="underline underline-offset-2" style={{ color: 'var(--cc)' }} {...props} />,
    blockquote: (props) => (
      <blockquote className="pl-3 my-2 text-sm italic" style={{ borderLeft: '2px solid var(--border-lit)', color: 'var(--txt-3)' }} {...props} />
    ),
    code: ({ className, children, ...props }) => {
      const isInline = !className && typeof children === 'string' && !children.includes('\n')
      if (isInline) {
        return (
          <code
            className="text-xs px-1.5 py-0.5 rounded"
            style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--cc)', fontFamily: 'var(--font-mono)', borderRadius: '4px', padding: '0.1em 5px' }}
            {...props}
          >{children}</code>
        )
      }
      return (
        <pre className="rounded-lg p-3 my-2 overflow-x-auto" style={{ background: 'var(--s3)' }}>
          <code className="text-xs" style={{ color: 'var(--code-block)', fontFamily: 'var(--font-mono)' }} {...props}>{children}</code>
        </pre>
      )
    },
    hr: () => <hr className="my-3" style={{ borderColor: 'var(--border)' }} />,
    table: (props) => (
      <div className="overflow-x-auto my-2">
        <table className="text-xs border-collapse w-full" style={{ color: 'var(--txt-2)' }} {...props} />
      </div>
    ),
    th: (props) => <th className="px-2 py-1 text-left font-semibold" style={{ border: '1px solid var(--border)', color: 'var(--txt)' }} {...props} />,
    td: (props) => <td className="px-2 py-1" style={{ border: '1px solid var(--border)' }} {...props} />,
  }
}

/* ═══════════════════════════════════════════════════════════════
   Node — "The Card"
   ═══════════════════════════════════════════════════════════════ */

/**
 * @param {{
 *   node: Object,
 *   index: number,
 *   isActive: boolean,
 *   isAncestor: boolean,
 *   isDescendant: boolean,
 *   matterColor: string,
 *   onSelect: Function,
 *   onAddChild: Function,
 *   onDelete: Function,
 *   onNavigate: Function,
 * }}
 */
export default function Node({
  node,
  index = 0,
  isActive,
  isAncestor,
  isDescendant,
  matterColor,
  onSelect,
  onAddChild,
  onDelete,
  onNavigate,
}) {
  const [editing, setEditing] = useState(!node.content)
  const [editContent, setEditContent] = useState(node.content || '')
  const [editTags, setEditTags] = useState((node.tags ?? []).join(', '))
  const [saveFlash, setSaveFlash] = useState(false)
  const textareaRef = useRef(null)

  const mdComponents = useMemo(() => buildMdComponents(onNavigate), [onNavigate])

  // Link autocomplete hook
  const { handleKeyDown: acKeyDown, dropdown: acDropdown } = useLinkAutocomplete({
    textareaRef,
    value: editContent,
    onChange: setEditContent,
    nodeId: node.id,
  })

  // Focus textarea on edit-mode entry
  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus()
      const len = textareaRef.current.value.length
      textareaRef.current.setSelectionRange(len, len)
    }
  }, [editing])

  /* ── Save handler with flash feedback (#4) ─────────────────── */
  const handleSave = useCallback(async () => {
    const tags = editTags
      .split(',')
      .map((t) => t.trim().replace(/^#/, '').toLowerCase())
      .filter(Boolean)
    await updateNode(node.id, { content: editContent, tags })
    setEditing(false)

    // Show "✓ Saved" flash for 1.2 s
    setSaveFlash(true)
    setTimeout(() => setSaveFlash(false), 1200)
  }, [node.id, editContent, editTags])

  /* ── Enter edit mode ───────────────────────────────────────── */
  const enterEdit = useCallback(() => {
    setEditContent(node.content || '')
    setEditTags((node.tags ?? []).join(', '))
    setEditing(true)
  }, [node.content, node.tags])

  /* ── Derived state ─────────────────────────────────────────── */
  const dimmed = !isActive && !isAncestor && !isDescendant
  const tags = node.tags ?? []
  const isBranch = node.isBranch === true
  const parentId = node.parentId
  const orderLabel = String(node.order ?? 0).padStart(2, '0')
  const headPrefix = parentId ? 'CHILD' : 'ROOT'

  const cardCls = ['node-card', isActive && 'is-active', dimmed && 'is-dimmed']
    .filter(Boolean)
    .join(' ')

  /* #1 — Node entry animation with stagger */
  const entryDelay = index * 0.07

  return (
    <motion.div
      className="relative shrink-0"
      initial={{ opacity: 0, x: 28, scale: 0.97 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1], delay: entryDelay }}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => onSelect?.(node.id)}
        onDoubleClick={(e) => {
          e.stopPropagation()
          if (!editing) enterEdit()
        }}
        className={cardCls}
        style={{ '--cc': matterColor || undefined }}
      >
        {/* ── 1. Top Strip ─────────────────────────────────── */}
        <div className="node-strip" />

        {/* ── 2. Node Head ─────────────────────────────────── */}
        <div className="node-head">
          <span className="node-head-label">
            {headPrefix} · <span className="head-num">{orderLabel}</span>
          </span>
          {isBranch && <span className="node-fork-badge">⑂ fork</span>}
        </div>

        {/* ── 3. Tags Row (view mode only) ─────────────────── */}
        {!editing && tags.length > 0 && (
          <div className="node-tags">
            {tags.map((tag) => (
              <span key={tag} className={`tag-pill tag-v${tagVariant(tag)}`}>
                #{tag}
              </span>
            ))}
          </div>
        )}

        {/* ── 4 / 4b. Body or Textarea ─────────────────────── */}
        {editing ? (
          <div onClick={(e) => e.stopPropagation()}>
            <div className="node-textarea-wrap">
              <textarea
                ref={textareaRef}
                className="node-textarea"
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                onKeyDown={(e) => {
                  if (acKeyDown(e)) return
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
              {acDropdown}
            </div>

            {/* 5. Tags Edit Row */}
            <div className="tags-edit-row">
              <span className="te-hash">#</span>
              <input
                type="text"
                value={editTags}
                onChange={(e) => setEditTags(e.target.value)}
                placeholder="add tags, comma-separated"
              />
            </div>
          </div>
        ) : (
          /* 4. View body */
          <div className="node-body">
            <div className="node-prose">
              {node.content ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                  {node.content}
                </ReactMarkdown>
              ) : (
                <p className="node-body-placeholder">Double-click to edit…</p>
              )}
            </div>
          </div>
        )}

        {/* ── 6. Node Foot ─────────────────────────────────── */}
        <div className="node-foot">
          <span className="node-ts">
            {node.createdAt ? formatTimestamp(node.createdAt) : '—'}
          </span>

          <div className="node-foot-actions">
            {editing ? (
              <>
                <span className="node-kbd-hint">⌘↵</span>
                <button
                  className="node-save-btn"
                  onClick={(e) => { e.stopPropagation(); handleSave() }}
                >
                  <Check size={10} /> Save
                </button>
              </>
            ) : saveFlash ? (
              /* #4 — Brief "✓ Saved" flash after saving */
              <span className="node-save-btn" style={{ cursor: 'default' }}>
                <Check size={10} /> Saved
              </span>
            ) : (
              <button
                className="node-delete-btn"
                onClick={(e) => { e.stopPropagation(); onDelete?.(node.id) }}
                aria-label="Delete node"
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  )
}
