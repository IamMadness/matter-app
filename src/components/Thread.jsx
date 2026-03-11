import { useState, useRef, useMemo, useCallback, createRef, useEffect } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Plus } from 'lucide-react'
import { useActiveThread, useEdges } from '../hooks/useMatters'
import { useKeyboard } from '../hooks/useKeyboard'
import { createNode, deleteNode } from '../db/store'
import Node from './Node'
import BranchLine from './BranchLine'

/**
 * Thread — Main horizontal canvas.
 *
 * Renders a matter's nodes as a recursive tree laid out left-to-right.
 * Handles focus mode (ancestor/descendant highlighting), branching,
 * keyboard navigation, and BranchLine SVG overlays.
 *
 * @param {{ matterId: number, matterColor: string }}
 */
export default function Thread({ matterId, matterColor }) {
  const { nodes, isLoading } = useActiveThread(matterId)
  const nodeIds = useMemo(() => nodes.map((n) => n.id).filter(Boolean), [nodes])
  const { edges } = useEdges(nodeIds)

  const [activeNodeId, setActiveNodeId] = useState(null)
  const containerRef = useRef(null)

  // ── Build adjacency structures ──────────────────────────────
  const { childrenMap, parentMap, rootIds } = useMemo(() => {
    const cMap = {} // parentId → [childId, …]
    const pMap = {} // childId → parentId
    const allChildIds = new Set()

    for (const edge of edges) {
      if (!cMap[edge.sourceId]) cMap[edge.sourceId] = []
      cMap[edge.sourceId].push(edge.targetId)
      pMap[edge.targetId] = edge.sourceId
      allChildIds.add(edge.targetId)
    }

    // Root nodes have no incoming edge
    const roots = nodeIds.filter((id) => !allChildIds.has(id))
    return { childrenMap: cMap, parentMap: pMap, rootIds: roots }
  }, [edges, nodeIds])

  // ── Node lookup map ─────────────────────────────────────────
  const nodeMap = useMemo(() => {
    const m = {}
    for (const n of nodes) m[n.id] = n
    return m
  }, [nodes])

  // ── Focus mode: compute ancestors & descendants of active ──
  const { ancestorIds, descendantIds } = useMemo(() => {
    const anc = new Set()
    const desc = new Set()

    if (activeNodeId == null) return { ancestorIds: anc, descendantIds: desc }

    // Walk up to find ancestors
    let cur = activeNodeId
    while (parentMap[cur] != null) {
      cur = parentMap[cur]
      anc.add(cur)
    }

    // Walk down to find descendants (BFS)
    const queue = [...(childrenMap[activeNodeId] || [])]
    while (queue.length) {
      const id = queue.shift()
      desc.add(id)
      const kids = childrenMap[id]
      if (kids) queue.push(...kids)
    }

    return { ancestorIds: anc, descendantIds: desc }
  }, [activeNodeId, parentMap, childrenMap])

  // Active path = ancestors + active + descendants (for BranchLine glow)
  const activePathIds = useMemo(() => {
    if (activeNodeId == null) return new Set()
    return new Set([...ancestorIds, activeNodeId, ...descendantIds])
  }, [activeNodeId, ancestorIds, descendantIds])

  // ── Refs map for BranchLine positioning ─────────────────────
  const nodeRefsMap = useRef({})

  function getNodeRef(id) {
    if (!nodeRefsMap.current[id]) {
      nodeRefsMap.current[id] = createRef()
    }
    return nodeRefsMap.current[id]
  }

  // ── Handlers ────────────────────────────────────────────────
  const handleSelect = useCallback((id) => {
    setActiveNodeId((prev) => (prev === id ? null : id))
  }, [])

  const handleClearFocus = useCallback((e) => {
    // Only clear when clicking the canvas background itself
    if (e.target === e.currentTarget) {
      setActiveNodeId(null)
    }
  }, [])

  const handleAddChild = useCallback(
    async (parentId, isBranch = false) => {
      const parent = nodeMap[parentId]
      if (!parent) return

      // Determine order: max child order + 1
      const siblings = (childrenMap[parentId] || [])
        .map((id) => nodeMap[id])
        .filter(Boolean)
      const maxOrder = siblings.reduce((m, n) => Math.max(m, n.order ?? 0), parent.order ?? 0)

      await createNode({
        matterId,
        content: '',
        tags: [],
        order: maxOrder + 1,
        isBranch,
        parentId,
      })
    },
    [matterId, nodeMap, childrenMap],
  )

  const handleAddAtEnd = useCallback(async () => {
    const maxOrder = nodes.reduce((m, n) => Math.max(m, n.order ?? 0), 0)
    // If there are root nodes, attach to the last root; otherwise create a fresh root
    const lastRoot = rootIds.length > 0 ? rootIds[rootIds.length - 1] : null

    await createNode({
      matterId,
      content: '',
      tags: [],
      order: maxOrder + 1,
      isBranch: false,
      parentId: lastRoot,
    })
  }, [matterId, nodes, rootIds])

  const handleDelete = useCallback(
    async (nodeId) => {
      if (activeNodeId === nodeId) setActiveNodeId(null)
      await deleteNode(nodeId)
    },
    [activeNodeId],
  )

  // ── Keyboard: Left/Right to navigate siblings ──────────────
  const getSiblings = useCallback(
    (nodeId) => {
      const pid = parentMap[nodeId]
      if (pid != null) return childrenMap[pid] || []
      return rootIds
    },
    [parentMap, childrenMap, rootIds],
  )

  useKeyboard({
    ArrowRight: () => {
      if (activeNodeId == null) return
      const sibs = getSiblings(activeNodeId)
      const idx = sibs.indexOf(activeNodeId)
      // Try moving to first child first, then next sibling
      const children = childrenMap[activeNodeId]
      if (children?.length) {
        setActiveNodeId(children[0])
      } else if (idx < sibs.length - 1) {
        setActiveNodeId(sibs[idx + 1])
      }
    },
    ArrowLeft: () => {
      if (activeNodeId == null) return
      // Move to parent
      const pid = parentMap[activeNodeId]
      if (pid != null) {
        setActiveNodeId(pid)
      }
    },
    ArrowDown: () => {
      if (activeNodeId == null) return
      const sibs = getSiblings(activeNodeId)
      const idx = sibs.indexOf(activeNodeId)
      if (idx < sibs.length - 1) setActiveNodeId(sibs[idx + 1])
    },
    ArrowUp: () => {
      if (activeNodeId == null) return
      const sibs = getSiblings(activeNodeId)
      const idx = sibs.indexOf(activeNodeId)
      if (idx > 0) setActiveNodeId(sibs[idx - 1])
    },
    Escape: () => setActiveNodeId(null),
  })

  // ── Scroll active node into view ───────────────────────────
  useEffect(() => {
    if (activeNodeId == null) return
    const ref = nodeRefsMap.current[activeNodeId]
    ref?.current?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }, [activeNodeId])

  // ── Recursive subtree renderer ──────────────────────────────
  function renderSubtree(nodeId) {
    const node = nodeMap[nodeId]
    if (!node) return null

    const children = childrenMap[nodeId] || []
    const nodeRef = getNodeRef(nodeId)
    const childRefs = children.map((cid) => getNodeRef(cid))

    const isActive = nodeId === activeNodeId
    const isAncestor = ancestorIds.has(nodeId)
    const isDescendant = descendantIds.has(nodeId)
    const hasFocus = activeNodeId != null

    return (
      <div key={nodeId} className="flex items-center gap-8">
        {/* Parent node */}
        <div ref={nodeRef} data-node-id={nodeId} className="relative shrink-0">
          <Node
            node={node}
            isActive={isActive}
            isAncestor={hasFocus && isAncestor}
            isDescendant={hasFocus && isDescendant}
            matterColor={matterColor}
            onSelect={handleSelect}
            onAddChild={handleAddChild}
            onDelete={handleDelete}
          />
        </div>

        {/* Children */}
        {children.length > 0 && (
          <div className="relative flex flex-col gap-6">
            {/* BranchLine SVG from this parent to its children */}
            <BranchLine
              fromRef={nodeRef}
              toRefs={childRefs}
              containerRef={containerRef}
              activeIds={activePathIds}
            />

            {children.map((childId) => renderSubtree(childId))}
          </div>
        )}
      </div>
    )
  }

  // ── Render ──────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center text-white/20 text-sm">
        Loading…
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="relative flex-1 overflow-x-auto overflow-y-hidden"
      style={{ '--matter-color': matterColor || '#6366f1' }}
      onClick={handleClearFocus}
    >
      {/* Inner scroll track */}
      <div className="flex items-center gap-8 px-8 py-6 min-h-full min-w-max">
        <AnimatePresence mode="popLayout">
          {rootIds.map((rootId) => renderSubtree(rootId))}
        </AnimatePresence>

        {/* "Add node" button at thread end */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            handleAddAtEnd()
          }}
          className="shrink-0 flex items-center gap-2 px-4 py-3 rounded-xl
                     border border-dashed border-white/15 text-white/25
                     hover:border-white/30 hover:text-white/50 hover:bg-white/3
                     transition-colors duration-150 cursor-pointer"
        >
          <Plus size={16} />
          <span className="text-sm">Add note</span>
        </button>
      </div>

      {/* Empty state */}
      {nodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center space-y-2">
            <p className="text-white/20 text-sm">No notes yet</p>
            <p className="text-white/10 text-xs">
              Click "Add note" to start this thread
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
