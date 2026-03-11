import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Brain,
  BookOpen,
  Lightbulb,
  Rocket,
  Code2,
  Palette,
  Music,
  FlaskConical,
  Plus,
} from 'lucide-react'

/**
 * Icon lookup map — maps a matter.icon string to a Lucide component.
 * 8 default icons; falls back to Brain if not found.
 */
const ICON_MAP = {
  brain: Brain,
  book: BookOpen,
  lightbulb: Lightbulb,
  rocket: Rocket,
  code: Code2,
  palette: Palette,
  music: Music,
  flask: FlaskConical,
}

const COLLAPSED_W = 60
const EXPANDED_W = 220

/**
 * Sidebar — "The Spine"
 *
 * Fixed left sidebar that expands on hover.
 * Pure props + callbacks, no external state.
 *
 * @param {{ matters: Array, activeMatterId: number|null, onSelect: Function, onCreateMatter: Function }}
 */
export default function Sidebar({ matters, activeMatterId, onSelect, onCreateMatter }) {
  const [hovered, setHovered] = useState(false)

  return (
    <motion.aside
      className="fixed left-0 top-0 h-screen z-50 flex flex-col
                 bg-black/60 backdrop-blur-md border-r border-white/10
                 select-none"
      initial={false}
      animate={{ width: hovered ? EXPANDED_W : COLLAPSED_W }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* ── Matter list ─────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden py-3 space-y-1">
        {matters.map((matter) => {
          const isActive = matter.id === activeMatterId
          const IconComponent = ICON_MAP[matter.icon] || Brain
          const color = matter.color || '#6366f1'

          return (
            <button
              key={matter.id}
              onClick={() => onSelect(matter.id)}
              className="relative w-full flex items-center gap-3 px-3 py-2
                         group cursor-pointer transition-colors duration-150
                         hover:bg-white/5"
            >
              {/* Active accent bar */}
              {isActive && (
                <motion.div
                  layoutId="sidebar-accent"
                  className="absolute left-0 top-1 bottom-1 w-[3px] rounded-r-full"
                  style={{ backgroundColor: color }}
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                />
              )}

              {/* Icon circle */}
              <div
                className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center
                           transition-shadow duration-200"
                style={{
                  backgroundColor: `${color}20`,
                  boxShadow: isActive
                    ? `0 0 12px 2px ${color}80, 0 0 4px 1px ${color}40`
                    : 'none',
                }}
              >
                <IconComponent
                  size={18}
                  style={{ color }}
                  strokeWidth={isActive ? 2.4 : 1.8}
                />
              </div>

              {/* Title — only visible when expanded */}
              <AnimatePresence>
                {hovered && (
                  <motion.span
                    className="text-sm truncate whitespace-nowrap"
                    style={{ color: isActive ? color : 'rgba(255,255,255,0.7)' }}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -6 }}
                    transition={{ duration: 0.15 }}
                  >
                    {matter.title}
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
          )
        })}
      </div>

      {/* ── Create button ───────────────────────────────── */}
      <div className="border-t border-white/10 p-2">
        <button
          onClick={onCreateMatter}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg
                     text-white/40 hover:text-white/80 hover:bg-white/5
                     transition-colors duration-150 cursor-pointer"
        >
          <div className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center
                          border border-dashed border-white/20">
            <Plus size={18} />
          </div>
          <AnimatePresence>
            {hovered && (
              <motion.span
                className="text-sm whitespace-nowrap"
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -6 }}
                transition={{ duration: 0.15 }}
              >
                New Matter
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>
    </motion.aside>
  )
}
