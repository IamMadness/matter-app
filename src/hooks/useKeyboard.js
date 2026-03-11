import { useEffect, useRef } from 'react'

/**
 * useKeyboard — Global keyboard shortcut handler.
 *
 * Accepts a keymap object and registers / unregisters
 * window-level keydown listeners on mount / unmount.
 *
 * Handles both Mac (metaKey) and Windows/Linux (ctrlKey)
 * for "cmd" shortcuts.
 *
 * @example
 *   useKeyboard({
 *     'cmd+k':   () => openPalette(),
 *     'Escape':  () => closePalette(),
 *     'cmd+n':   () => createNode(),
 *   })
 *
 * Supported modifier prefixes (case-insensitive, combinable with +):
 *   cmd   → metaKey (Mac) OR ctrlKey (Win/Linux)
 *   shift → shiftKey
 *   alt   → altKey
 *
 * The final segment is matched against event.key (case-insensitive).
 */
export function useKeyboard(keymap) {
  // Keep a stable ref so the listener always sees the latest handlers
  // without needing to re-register on every render.
  const keymapRef = useRef(keymap)
  keymapRef.current = keymap

  useEffect(() => {
    function handleKeyDown(event) {
      const map = keymapRef.current
      if (!map) return

      for (const [combo, handler] of Object.entries(map)) {
        if (typeof handler !== 'function') continue
        if (matchesCombo(event, combo)) {
          event.preventDefault()
          event.stopPropagation()
          handler(event)
          return // first match wins
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, []) // mount/unmount only — handlers tracked via ref
}

// ── Internal helpers ────────────────────────────────────────────

/**
 * Parse a combo string like "cmd+shift+k" and test it against
 * a KeyboardEvent.
 */
function matchesCombo(event, combo) {
  const parts = combo.toLowerCase().split('+').map((s) => s.trim())
  const key = parts.pop() // last segment is the actual key

  const needCmd = parts.includes('cmd')
  const needShift = parts.includes('shift')
  const needAlt = parts.includes('alt')

  // "cmd" maps to Meta on Mac, Ctrl on everything else
  const cmdPressed = event.metaKey || event.ctrlKey

  if (needCmd && !cmdPressed) return false
  if (needShift && !event.shiftKey) return false
  if (needAlt && !event.altKey) return false

  // Guard: if user didn't ask for cmd but cmd is pressed,
  // avoid misfiring plain-key handlers (e.g. "k" shouldn't
  // fire when the user presses Cmd+K).
  if (!needCmd && (event.metaKey || event.ctrlKey)) return false

  return event.key.toLowerCase() === key
}

export default useKeyboard
