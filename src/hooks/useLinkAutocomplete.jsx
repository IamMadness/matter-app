import { useState, useEffect, useRef, useCallback } from 'react'
import { db } from '../db/store'

/**
 * useLinkAutocomplete — custom hook for [[WikiLink]] autocomplete.
 *
 * Watches a textarea value for the `[[` trigger pattern and returns
 * a filterable dropdown + keyboard handler. Selecting a result
 * inserts `[[NodeTitle]]` at the cursor position.
 *
 * @param {{
 *   textareaRef: React.RefObject<HTMLTextAreaElement>,
 *   value: string,
 *   onChange: (newValue: string) => void,
 *   nodeId: number,
 * }}
 * @returns {{ handleKeyDown: (e: KeyboardEvent) => boolean, dropdown: JSX.Element | null }}
 */
export default function useLinkAutocomplete({ textareaRef, value, onChange, nodeId }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [activeIdx, setActiveIdx] = useState(0)
  const [bracketStart, setBracketStart] = useState(-1)
  const debounceRef = useRef(null)
  const dropdownRef = useRef(null)

  // ── Detect [[ trigger ────────────────────────────────────────
  const detectTrigger = useCallback(() => {
    const ta = textareaRef.current
    if (!ta) return

    const cursor = ta.selectionStart
    const textBefore = value.substring(0, cursor)

    const lastOpen = textBefore.lastIndexOf('[[')
    if (lastOpen === -1) {
      if (open) setOpen(false)
      return
    }

    // Ensure no ]] between [[ and cursor
    const afterBracket = textBefore.substring(lastOpen + 2)
    if (afterBracket.includes(']]')) {
      if (open) setOpen(false)
      return
    }

    setBracketStart(lastOpen)
    setQuery(afterBracket)
    setActiveIdx(0)
    if (!open) setOpen(true)
  }, [value, open, textareaRef])

  // Re-detect on value change
  useEffect(() => {
    detectTrigger()
  }, [value, detectTrigger])

  // ── Search nodes (debounced 120ms) ───────────────────────────
  useEffect(() => {
    if (!open) {
      setResults([])
      return
    }

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        const lower = query.toLowerCase().trim()
        let nodes

        if (!lower) {
          nodes = await db.nodes.orderBy('createdAt').reverse().limit(8).toArray()
        } else {
          const all = await db.nodes.toArray()
          nodes = all
            .filter((n) => {
              if (n.id === nodeId) return false
              const title = (n.content || '').split('\n')[0].toLowerCase()
              return title.includes(lower)
            })
            .slice(0, 8)
        }

        // Filter self + enrich with matter metadata
        const enriched = await Promise.all(
          nodes
            .filter((n) => n.id !== nodeId)
            .map(async (n) => {
              const matter = await db.matters.get(n.matterId)
              const title = (n.content || '').substring(0, 60).split('\n')[0].trim()
              return {
                id: n.id,
                title: title || 'Untitled',
                matterTitle: matter?.title ?? 'Unknown',
                matterColor: matter?.color ?? '#6366f1',
              }
            }),
        )

        setResults(enriched)
      } catch (err) {
        console.error('[LinkAutocomplete] search error:', err)
      }
    }, 120)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, open, nodeId])

  // ── Insert a selected result ─────────────────────────────────
  const insertResult = useCallback(
    (result) => {
      const title = result.title
      if (!title || title === 'Untitled') return

      const before = value.substring(0, bracketStart)
      const ta = textareaRef.current
      const cursor = ta ? ta.selectionStart : bracketStart + 2 + query.length
      const after = value.substring(cursor)

      const inserted = `[[${title}]]`
      const newValue = before + inserted + after
      onChange(newValue)

      setOpen(false)
      setQuery('')
      setResults([])

      requestAnimationFrame(() => {
        if (ta) {
          const newPos = before.length + inserted.length
          ta.focus()
          ta.setSelectionRange(newPos, newPos)
        }
      })
    },
    [value, bracketStart, query, onChange, textareaRef],
  )

  // ── Scroll active into view ──────────────────────────────────
  useEffect(() => {
    if (!open || !dropdownRef.current) return
    const el = dropdownRef.current.children[activeIdx]
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIdx, open])

  // ── Keyboard handler ─────────────────────────────────────────
  const handleKeyDown = useCallback(
    (e) => {
      if (!open || results.length === 0) return false

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIdx((i) => (i + 1) % results.length)
        return true
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIdx((i) => (i - 1 + results.length) % results.length)
        return true
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        insertResult(results[activeIdx])
        return true
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setOpen(false)
        return true
      }

      return false
    },
    [open, results, activeIdx, insertResult],
  )

  // ── Build dropdown JSX ───────────────────────────────────────
  const dropdown =
    open && results.length > 0 ? (
      <div ref={dropdownRef} className="link-autocomplete">
        {results.map((r, i) => (
          <div
            key={r.id}
            className={`link-ac-row${i === activeIdx ? ' is-active' : ''}`}
            onMouseEnter={() => setActiveIdx(i)}
            onMouseDown={(e) => {
              e.preventDefault()
              insertResult(r)
            }}
          >
            <span
              className="link-ac-dot"
              style={{
                background: r.matterColor,
                boxShadow: `0 0 6px ${r.matterColor}`,
              }}
            />
            <span className="link-ac-title">{r.title}</span>
            <span className="link-ac-matter">{r.matterTitle}</span>
          </div>
        ))}
      </div>
    ) : null

  return { handleKeyDown, dropdown }
}
