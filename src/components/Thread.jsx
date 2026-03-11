import { useState, useRef, useMemo, useCallback, createRef, useEffect } from 'react'
import { AnimatePresence } from 'framer-motion'
import { useActiveThread, useEdges } from '../hooks/useMatters'
import { useKeyboard } from '../hooks/useKeyboard'
import { createNode, deleteNode } from '../db/store'
import Node from './Node'
import BranchConnector from './BranchConnector'
import BacklinksPanel from './BacklinksPanel'
import './Thread.css'

/**
 * Thread — Main horizontal canvas.
 *
 * Renders a matter's nodes as a recursive tree laid out left-to-right,
 * vertically centered in the viewport. Connector elements sit between
 * sibling nodes with a gradient line, arrow-head, and branch mid-dot.
 *
 * @param {{
 *   matterId: number,
 *   matterColor: string,
 *   focusEnabled: boolean,
 *   onNavigate: Function,
 * }}
 */
export default function Thread({ matterId, matterColor, focusEnabled = true, onNavigate }) {
  const { nodes, isLoading } = useActiveThread(matterId)
  const nodeIds = useMemo(() => nodes.map((n) => n.id).filter(Boolean), [nodes])
  const { edges } = useEdges(nodeIds)

  const [activeNodeId, setActiveNodeId] = useState(null)
  const containerRef = useRef(null)

  // ── Build adjacency structures ──────────────────────────────
  const { childrenMap, parentMap, rootIds } = useMemo(() => {
    const cMap = {}
    const pMap = {}
    const allChildIds = new Set()

    for (const edge of edges) {
      if (!cMap[edge.sourceId]) cMap[edge.sourceId] = []
      cMap[edge.sourceId].push(edge.targetId)
      pMap[edge.targetId] = edge.sourceId
      allChildIds.add(edge.targetId)
    }

    const roots = nodeIds.filter((id) => !allChildIds.has(id))
    return { childrenMap: cMap, parentMap: pMap, rootIds: roots }
  }, [edges, nodeIds])

  // ── Node lookup map ─────────────────────────────────────────
  const nodeMap = useMemo(() => {
    const m = {}
    for (const n of nodes) m[n.id] = n
    return m
  }, [nodes])

  // ── Focus mode: ancestors & descendants of active node ──────
  const { ancestorIds, descendantIds } = useMemo(() => {
    const anc = new Set()
    const desc = new Set()
    if (activeNodeId == null) return { ancestorIds: anc, descendantIds: desc }

    let cur = activeNodeId
    while (parentMap[cur] != null) {
      cur = parentMap[cur]
      anc.add(cur)
    }

    const queue = [...(childrenMap[activeNodeId] || [])]
    while (queue.length) {
      const id = queue.shift()
      desc.add(id)
      const kids = childrenMap[id]
      if (kids) queue.push(...kids)
    }

    return { ancestorIds: anc, descendantIds: desc }
  }, [activeNodeId, parentMap, childrenMap])

  const activePathIds = useMemo(() => {
    if (activeNodeId == null) return new Set()
    return new Set([...ancestorIds, activeNodeId, ...descendantIds])
  }, [activeNodeId, ancestorIds, descendantIds])

  // ── Refs map for node positioning ───────────────────────────
  const nodeRefsMap = useRef({})

  function getNodeRef(id) {
    if (!nodeRefsMap.current[id]) nodeRefsMap.current[id] = createRef()
    return nodeRefsMap.current[id]
  }

  // ── Handlers ────────────────────────────────────────────────
  const handleSelect = useCallback((id) => {
    setActiveNodeId((prev) => (prev === id ? null : id))
  }, [])

  const handleClearFocus = useCallback((e) => {
    if (e.target === e.currentTarget) setActiveNodeId(null)
  }, [])

  const handleAddChild = useCallback(
    async (parentId, isBranch = false) => {
      const parent = nodeMap[parentId]
      if (!parent) return
      const siblings = (childrenMap[parentId] || []).map((id) => nodeMap[id]).filter(Boolean)
      const maxOrder = siblings.reduce((m, n) => Math.max(m, n.order ?? 0), parent.order ?? 0)
      await createNode({ matterId, content: '', tags: [], order: maxOrder + 1, isBranch, parentId })
    },
    [matterId, nodeMap, childrenMap],
  )

  const handleAddAtEnd = useCallback(async () => {
    const maxOrder = nodes.reduce((m, n) => Math.max(m, n.order ?? 0), 0)
    const lastRoot = rootIds.length > 0 ? rootIds[rootIds.length - 1] : null
    await createNode({ matterId, content: '', tags: [], order: maxOrder + 1, isBranch: false, parentId: lastRoot })
  }, [matterId, nodes, rootIds])

  const handleDelete = useCallback(
    async (nodeId) => {
      if (activeNodeId === nodeId) setActiveNodeId(null)
      await deleteNode(nodeId)
    },
    [activeNodeId],
  )

  // ── Keyboard navigation ────────────────────────────────────
  const getSiblings = useCallback(
    (nodeId) => {
      const pid = parentMap[nodeId]
      return pid != null ? childrenMap[pid] || [] : rootIds
    },
    [parentMap, childrenMap, rootIds],
  )

  useKeyboard({
    ArrowRight: () => {
      if (activeNodeId == null) return
      const children = childrenMap[activeNodeId]
      if (children?.length) { setActiveNodeId(children[0]); return }
      const sibs = getSiblings(activeNodeId)
      const idx = sibs.indexOf(activeNodeId)
      if (idx < sibs.length - 1) setActiveNodeId(sibs[idx + 1])
    },
    ArrowLeft: () => {
      if (activeNodeId == null) return
      const pid = parentMap[activeNodeId]
      if (pid != null) setActiveNodeId(pid)
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

  // ── Connector element between two horizontally-adjacent nodes
  function Connector({ sourceNodeId }) {
    return (
      <div className="conn">
        <div className="conn-line" />
        <div
          className="conn-mid"
          onClick={(e) => {
            e.stopPropagation()
            handleAddChild(sourceNodeId, true)
          }}
          data-tip="branch"
        />
        <span className="conn-add-hint">branch here</span>
      </div>
    )
  }

  // ── Running index counter for stagger ───────────────────────
  let nodeIndex = 0

  // ── Recursive subtree renderer ──────────────────────────────
  function renderSubtree(nodeId, isFirst = false) {
    const node = nodeMap[nodeId]
    if (!node) return null

    const children = childrenMap[nodeId] || []
    const nodeRef = getNodeRef(nodeId)
    const childRefs = children.map((cid) => getNodeRef(cid))

    const isActive = nodeId === activeNodeId
    const isAncestor = ancestorIds.has(nodeId)
    const isDescendant = descendantIds.has(nodeId)
    const hasFocus = focusEnabled && activeNodeId != null

    // Capture and increment the running index for stagger delay
    const currentIndex = nodeIndex++

    return (
      <div key={nodeId} className="flex items-center" style={{ gap: 0 }}>
        {/* Node card */}
        <div ref={nodeRef} data-node-id={nodeId} className="relative shrink-0">
          <Node
            node={node}
            index={currentIndex}
            isActive={isActive}
            isAncestor={hasFocus && isAncestor}
            isDescendant={hasFocus && isDescendant}
            matterColor={matterColor}
            onSelect={handleSelect}
            onAddChild={handleAddChild}
            onDelete={handleDelete}
            onNavigate={(title) => onNavigate?.(null, null, title)}
          />
        </div>

        {/* Children with connectors */}
        {children.length > 0 && (
          <>
            {children.length === 1 ? (
              <>
                <Connector sourceNodeId={nodeId} />
                {renderSubtree(children[0])}
              </>
            ) : (
              <>
                <BranchConnector
                  parentRef={nodeRef}
                  childRefs={childRefs}
                  containerRef={containerRef}
                  matterColor={matterColor}
                />
                <div className="flex flex-col gap-6">
                  {children.map((childId) => renderSubtree(childId))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    )
  }

  // ── Render ──────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm" style={{ color: 'var(--txt-4)' }}>
        Loading…
      </div>
    )
  }

  // ── Flatten rootIds into a linked sequence for connectors ──
  function renderRootSequence() {
    nodeIndex = 0 // reset stagger counter per render
    const elements = []
    rootIds.forEach((rootId, i) => {
      if (i > 0) {
        elements.push(
          <Connector key={`conn-root-${i}`} sourceNodeId={rootIds[i - 1]} />,
        )
      }
      elements.push(
        <div key={rootId}>{renderSubtree(rootId, i === 0)}</div>,
      )
    })
    return elements
  }

  return (
    <div
      ref={containerRef}
      className="thread-canvas"
      style={{ '--matter-color': matterColor || 'var(--cc)' }}
      onClick={handleClearFocus}
    >
      {/* ── Nodes exist → render track ─────────────────────── */}
      {nodes.length > 0 && (
        <div className="thread-track">
          <AnimatePresence mode="popLayout">
            {renderRootSequence()}
          </AnimatePresence>

          <Connector sourceNodeId={rootIds[rootIds.length - 1]} />

          <button
            className="thread-add-end"
            onClick={(e) => { e.stopPropagation(); handleAddAtEnd() }}
          >
            <div className="thread-add-circle">+</div>
            <span className="thread-add-label">new node</span>
          </button>
        </div>
      )}

      {/* ── Empty state ────────────────────────────────────── */}
      {nodes.length === 0 && (
        <div className="thread-empty">
          <div className="thread-empty-ring" />
          <h2>Start your first thread</h2>
          <p>Click below to add your first node</p>
          <button
            className="thread-empty-cta"
            onClick={(e) => { e.stopPropagation(); handleAddAtEnd() }}
          >
            Add first node
          </button>
        </div>
      )}

      {/* ── Backlinks panel ────────────────────────────────── */}
      <BacklinksPanel
        nodeId={activeNodeId}
        onNavigate={(mid, nid) => onNavigate?.(mid, nid)}
        onClose={() => setActiveNodeId(null)}
      />
    </div>
  )
}
