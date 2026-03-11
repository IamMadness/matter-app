import { useMemo, useRef } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/store'

/**
 * useMatters — Custom hook wrapping Dexie live queries.
 *
 * Exposes:
 *   allMatters        — live list of all matters (topics)
 *   activeThread(id)  — live sorted node list for a given matter
 *   isLoading         — true while initial queries are resolving
 *
 * KEY FIX: useLiveQuery deps are compared with strict reference
 * equality (like useEffect). Array deps that change reference on
 * every render cause the live-query subscription to tear down and
 * re-create — producing an `undefined` flash between cycles.
 * For useEdges we stabilise the deps via a JSON key.
 */

/** Live list of all matters, sorted newest-first. */
export function useAllMatters() {
  const matters = useLiveQuery(
    () => db.matters.orderBy('createdAt').reverse().toArray(),
    [], // no deps — runs once, Dexie liveQuery auto-updates on table changes
  )

  return {
    matters: matters ?? [],
    isLoading: matters === undefined,
  }
}

/**
 * Live sorted node list for a single matter (thread).
 * Nodes are ordered by their `order` field so the thread
 * renders left-to-right in creation sequence.
 *
 * @param {number|null} matterId — the matter to load nodes for
 */
export function useActiveThread(matterId) {
  const nodes = useLiveQuery(
    () => {
      if (matterId == null) return []
      return db.nodes
        .where('matterId')
        .equals(matterId)
        .sortBy('order')
    },
    [matterId], // primitive — stable across renders
  )

  return {
    nodes: nodes ?? [],
    isLoading: nodes === undefined,
  }
}

/**
 * Live query for all edges belonging to a matter's nodes.
 * Useful for rendering SVG connector / branch lines.
 *
 * FIX: `nodeIds` is an array whose *reference* changes on every
 * render even when the *contents* are identical. Passing it
 * directly as a dep causes useLiveQuery to unsubscribe →
 * resubscribe every frame, returning `undefined` in between.
 * The UI sees `edges ?? [] → []`, wipes the connector lines,
 * and — critically — Thread re-computes adjacency as "no edges,"
 * so every node appears as a disconnected root.
 *
 * Fix: derive a stable string key from the sorted ids and use
 * that as the dep instead.
 *
 * @param {number[]} nodeIds — ids of the nodes currently in view
 */
export function useEdges(nodeIds) {
  // Derive a stable scalar key so useLiveQuery deps don't churn.
  const idsKey = useMemo(
    () => (nodeIds && nodeIds.length > 0 ? nodeIds.slice().sort((a, b) => a - b).join(',') : ''),
    [nodeIds],
  )

  // Keep the latest nodeIds in a ref so the querier closure
  // always reads the current value without needing it as a dep.
  const idsRef = useRef(nodeIds)
  idsRef.current = nodeIds

  const edges = useLiveQuery(
    () => {
      const ids = idsRef.current
      if (!ids || ids.length === 0) return []
      return db.edges
        .where('sourceId')
        .anyOf(ids)
        .toArray()
    },
    [idsKey], // stable string — only changes when the set of ids actually changes
  )

  return {
    edges: edges ?? [],
    isLoading: edges === undefined,
  }
}

/**
 * Convenience wrapper combining matter + thread + edges.
 *
 * @param {number|null} matterId
 */
export function useMatters(matterId) {
  const { matters, isLoading: mattersLoading } = useAllMatters()
  const { nodes, isLoading: nodesLoading } = useActiveThread(matterId)
  const nodeIds = useMemo(
    () => nodes.map((n) => n.id).filter(Boolean),
    [nodes],
  )
  const { edges, isLoading: edgesLoading } = useEdges(nodeIds)

  return {
    matters,
    nodes,
    edges,
    isLoading: mattersLoading || nodesLoading || edgesLoading,
  }
}
