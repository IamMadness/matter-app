import Dexie from 'dexie'

// ── Database singleton (module-level — instantiated ONCE) ───────
export const db = new Dexie('MattersDB')

// ── Schema versions ─────────────────────────────────────────────
//
// v1 — original schema (may exist in user browsers).
// v2 — same tables, no structural change, but bumped to force
//       Dexie to re-validate the schema and clear any stale
//       version locks from prior dev iterations.
//
// IMPORTANT: Dexie silently fails if the schema definition
// changes *within* the same version number. Always bump the
// version when indexes change.

db.version(1).stores({
  matters: '++id, title, createdAt',
  nodes: '++id, matterId, *tags, order, createdAt',
  edges: '++id, sourceId, targetId, [sourceId+targetId]',
})

db.version(2).stores({
  // matters: unchanged
  matters: '++id, title, createdAt',
  // nodes: same indexed fields — isBranch/updatedAt are stored
  //        but not indexed (no need to query by them directly)
  nodes: '++id, matterId, *tags, order, createdAt',
  // edges: unchanged
  edges: '++id, sourceId, targetId, [sourceId+targetId]',
}).upgrade((_tx) => {
  // No data migration needed — schema indexes are identical.
  // This upgrade block exists so Dexie acknowledges the version
  // bump and doesn't skip the open handshake.
})

// ── Eagerly open & surface errors ───────────────────────────────
//
// Without this, Dexie auto-opens lazily on first query. If
// a VersionError or QuotaExceededError occurs, it surfaces
// inside a useLiveQuery where it's silently swallowed
// (the query just returns `undefined` forever and isLoading
// never flips to false → the UI appears empty / "data lost").
//
// By opening eagerly we crash-fast with a visible console error.

db.open().catch((err) => {
  console.error(
    '[MattersDB] Failed to open IndexedDB. ' +
    'Data will NOT persist this session.',
    err,
  )
})

// ── Matter CRUD ─────────────────────────────────────────────────

/**
 * Create a new Matter (topic/thread).
 *
 * @param {{ title: string, color?: string, icon?: string }} data
 * @returns {Promise<number>} the new matter's id
 */
export async function createMatter({ title, color = '#6366f1', icon = 'brain' }) {
  const id = await db.matters.add({
    title,
    color,
    icon,
    createdAt: new Date(),
  })
  return id
}

/**
 * Delete a matter and all its nodes + edges.
 *
 * @param {number} matterId
 */
export async function deleteMatter(matterId) {
  await db.transaction('rw', db.matters, db.nodes, db.edges, async () => {
    const nodes = await db.nodes.where('matterId').equals(matterId).toArray()
    const nodeIds = nodes.map((n) => n.id)

    // Delete edges that reference any of these nodes
    if (nodeIds.length > 0) {
      await db.edges.where('sourceId').anyOf(nodeIds).delete()
      await db.edges.where('targetId').anyOf(nodeIds).delete()
    }

    // Delete nodes
    await db.nodes.where('matterId').equals(matterId).delete()

    // Delete the matter itself
    await db.matters.delete(matterId)
  })
}

// ── Node CRUD ───────────────────────────────────────────────────

/**
 * Create a new Node inside a matter.
 * If `parentId` is provided, an edge is also created.
 *
 * @param {{
 *   matterId: number,
 *   content?: string,
 *   tags?: string[],
 *   order?: number,
 *   isBranch?: boolean,
 *   parentId?: number|null,
 * }} data
 * @returns {Promise<number>} the new node's id
 */
export async function createNode({
  matterId,
  content = '',
  tags = [],
  order = 0,
  isBranch = false,
  parentId = null,
}) {
  const now = new Date()

  const nodeId = await db.transaction('rw', db.nodes, db.edges, async () => {
    const id = await db.nodes.add({
      matterId,
      content,
      tags,
      order,
      isBranch,
      createdAt: now,
      updatedAt: now,
    })

    // Create parent → child edge if this node has a parent
    if (parentId != null) {
      await db.edges.add({
        sourceId: parentId,
        targetId: id,
        type: isBranch ? 'branch' : 'child',
      })
    }

    return id
  })

  return nodeId
}

/**
 * Update a node's content/tags.
 *
 * @param {number} nodeId
 * @param {{ content?: string, tags?: string[], isBranch?: boolean }} changes
 */
export async function updateNode(nodeId, changes) {
  await db.nodes.update(nodeId, {
    ...changes,
    updatedAt: new Date(),
  })
}

/**
 * Delete a node and any edges that reference it.
 * Also cleans up orphaned subtrees (cascading delete).
 *
 * @param {number} nodeId
 */
export async function deleteNode(nodeId) {
  await db.transaction('rw', db.nodes, db.edges, async () => {
    // Find all descendants via BFS so we cascade-delete the subtree
    const toDelete = [nodeId]
    const queue = [nodeId]

    while (queue.length > 0) {
      const current = queue.shift()
      const childEdges = await db.edges.where('sourceId').equals(current).toArray()
      for (const edge of childEdges) {
        toDelete.push(edge.targetId)
        queue.push(edge.targetId)
      }
    }

    // Remove all edges involving these nodes
    await db.edges.where('sourceId').anyOf(toDelete).delete()
    await db.edges.where('targetId').anyOf(toDelete).delete()

    // Remove the nodes themselves
    await db.nodes.bulkDelete(toDelete)
  })
}

// ── Search ──────────────────────────────────────────────────────

/**
 * Full-text search across node content.
 * Uses a case-insensitive substring match.
 *
 * @param {string} query
 * @param {number} [limit=50]
 * @returns {Promise<Array>}
 */
export async function searchNodes(query, limit = 50) {
  if (!query || !query.trim()) return []

  const lower = query.toLowerCase().trim()
  const all = await db.nodes.toArray()

  return all
    .filter((n) => (n.content || '').toLowerCase().includes(lower))
    .slice(0, limit)
}

/**
 * Find nodes that contain a specific tag.
 * Uses Dexie's multi-entry index on `tags`.
 *
 * @param {string} tag — tag name (without the # prefix)
 * @param {number} [limit=50]
 * @returns {Promise<Array>}
 */
export async function getNodesByTag(tag, limit = 50) {
  if (!tag || !tag.trim()) return []

  const lower = tag.toLowerCase().trim()

  // Multi-entry index allows exact match per tag entry.
  // For partial match, fall back to manual filter.
  const all = await db.nodes.where('tags').equals(lower).limit(limit).toArray()

  if (all.length > 0) return all

  // Fallback: partial tag match
  const everything = await db.nodes.toArray()
  return everything
    .filter((n) =>
      (n.tags || []).some((t) => t.toLowerCase().includes(lower)),
    )
    .slice(0, limit)
}
