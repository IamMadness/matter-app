import Dexie from 'dexie'

// ── Database singleton (module-level — instantiated ONCE) ───────
export const db = new Dexie('MattersDB')

// ── Schema versions ─────────────────────────────────────────────
//
// v1 — original schema.
// v2 — version bump to re-validate schema.
// v3 — added `links` table for cross-matter linking.

db.version(1).stores({
  matters: '++id, title, createdAt',
  nodes: '++id, matterId, *tags, order, createdAt',
  edges: '++id, sourceId, targetId, [sourceId+targetId]',
})

db.version(2).stores({
  matters: '++id, title, createdAt',
  nodes: '++id, matterId, *tags, order, createdAt',
  edges: '++id, sourceId, targetId, [sourceId+targetId]',
}).upgrade((_tx) => {
  // No data migration needed.
})

db.version(3).stores({
  matters: '++id, title, createdAt',
  nodes: '++id, matterId, *tags, order, createdAt',
  edges: '++id, sourceId, targetId, [sourceId+targetId]',
  // links: cross-matter node references
  //   sourceNodeId / targetNodeId — indexed for backlink/outlink queries
  //   sourceMatterId / targetMatterId — stored (not indexed) for JOINs
  links: '++id, sourceNodeId, targetNodeId',
}).upgrade((_tx) => {
  // No migration — new table starts empty.
})

// ── Eagerly open & surface errors ───────────────────────────────
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
 * Delete a matter and all its nodes + edges + links.
 *
 * @param {number} matterId
 */
export async function deleteMatter(matterId) {
  await db.transaction('rw', db.matters, db.nodes, db.edges, db.links, async () => {
    const nodes = await db.nodes.where('matterId').equals(matterId).toArray()
    const nodeIds = nodes.map((n) => n.id)

    if (nodeIds.length > 0) {
      await db.edges.where('sourceId').anyOf(nodeIds).delete()
      await db.edges.where('targetId').anyOf(nodeIds).delete()
      // Clean up cross-matter links referencing these nodes
      await db.links.where('sourceNodeId').anyOf(nodeIds).delete()
      await db.links.where('targetNodeId').anyOf(nodeIds).delete()
    }

    await db.nodes.where('matterId').equals(matterId).delete()
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
 * Automatically syncs [[WikiLink]] cross-matter links after saving.
 *
 * @param {number} nodeId
 * @param {{ content?: string, tags?: string[], isBranch?: boolean }} changes
 */
export async function updateNode(nodeId, changes) {
  await db.nodes.update(nodeId, {
    ...changes,
    updatedAt: new Date(),
  })

  // If content was updated, sync cross-matter links from [[...]] tokens
  if (changes.content != null) {
    const node = await db.nodes.get(nodeId)
    if (node) {
      await parseAndSyncLinks(nodeId, node.matterId, changes.content)
    }
  }
}

/**
 * Delete a node, its edges, its cross-matter links,
 * and cascade-delete orphaned subtrees.
 *
 * @param {number} nodeId
 */
export async function deleteNode(nodeId) {
  await db.transaction('rw', db.nodes, db.edges, db.links, async () => {
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

    await db.edges.where('sourceId').anyOf(toDelete).delete()
    await db.edges.where('targetId').anyOf(toDelete).delete()

    // Clean up cross-matter links for every deleted node
    await db.links.where('sourceNodeId').anyOf(toDelete).delete()
    await db.links.where('targetNodeId').anyOf(toDelete).delete()

    await db.nodes.bulkDelete(toDelete)
  })
}

// ── Cross-Matter Links ──────────────────────────────────────────

/**
 * Create a cross-matter link between two nodes.
 * De-duplicates: if the exact sourceNodeId→targetNodeId link
 * already exists, returns the existing one instead.
 *
 * @param {number} sourceNodeId
 * @param {number} targetNodeId
 * @param {number} sourceMatterId
 * @param {number} targetMatterId
 * @returns {Promise<Object>} the link object (new or existing)
 */
export async function createLink(sourceNodeId, targetNodeId, sourceMatterId, targetMatterId) {
  // Check for existing duplicate
  const existing = await db.links
    .where('sourceNodeId')
    .equals(sourceNodeId)
    .filter((l) => l.targetNodeId === targetNodeId)
    .first()

  if (existing) return existing

  const id = await db.links.add({
    sourceNodeId,
    targetNodeId,
    sourceMatterId,
    targetMatterId,
    createdAt: new Date(),
  })

  return db.links.get(id)
}

/**
 * Delete ALL cross-matter links where the given node is
 * either the source or target.
 *
 * @param {number} nodeId
 */
export async function deleteLinksForNode(nodeId) {
  await db.links.where('sourceNodeId').equals(nodeId).delete()
  await db.links.where('targetNodeId').equals(nodeId).delete()
}

/**
 * Get all backlinks pointing TO a node.
 * Returns enriched objects with the full source node and its matter.
 *
 * @param {number} nodeId
 * @returns {Promise<Array<{ link: Object, sourceNode: Object, sourceMatter: Object }>>}
 */
export async function getBacklinks(nodeId) {
  const links = await db.links.where('targetNodeId').equals(nodeId).toArray()
  if (links.length === 0) return []

  const results = []
  for (const link of links) {
    const sourceNode = await db.nodes.get(link.sourceNodeId)
    if (!sourceNode) continue // orphaned link — skip
    const sourceMatter = await db.matters.get(sourceNode.matterId)
    results.push({ link, sourceNode, sourceMatter: sourceMatter ?? null })
  }
  return results
}

/**
 * Get all outgoing links FROM a node.
 * Returns enriched objects with the full target node and its matter.
 *
 * @param {number} nodeId
 * @returns {Promise<Array<{ link: Object, targetNode: Object, targetMatter: Object }>>}
 */
export async function getOutlinks(nodeId) {
  const links = await db.links.where('sourceNodeId').equals(nodeId).toArray()
  if (links.length === 0) return []

  const results = []
  for (const link of links) {
    const targetNode = await db.nodes.get(link.targetNodeId)
    if (!targetNode) continue // orphaned link — skip
    const targetMatter = await db.matters.get(targetNode.matterId)
    results.push({ link, targetNode, targetMatter: targetMatter ?? null })
  }
  return results
}

/**
 * Parse [[WikiLink]] tokens from node content and sync the
 * cross-matter links table to match.
 *
 * - Adds links for new [[Title]] references found in content.
 * - Removes stale links whose [[Title]] was deleted from content.
 *
 * Match logic: for each [[Title]], find the first node (across
 * all matters) whose content starts with or includes that title
 * within its first 60 characters (case-insensitive).
 *
 * @param {number} nodeId     — the node whose content was edited
 * @param {number} matterId   — the matter this node belongs to
 * @param {string} content    — the raw markdown content
 */
export async function parseAndSyncLinks(nodeId, matterId, content) {
  if (!content) {
    // Content cleared — remove all outgoing links from this node
    await db.links.where('sourceNodeId').equals(nodeId).delete()
    return
  }

  // 1. Extract all [[...]] tokens
  const regex = /\[\[(.+?)\]\]/g
  const titles = []
  let match
  while ((match = regex.exec(content)) !== null) {
    titles.push(match[1].trim())
  }

  // 2. Resolve each title to a target node
  const allNodes = await db.nodes.toArray()
  const resolvedTargetIds = new Set()

  for (const title of titles) {
    const lower = title.toLowerCase()
    // Find first node whose first 60 chars of content include the title
    const target = allNodes.find((n) => {
      if (n.id === nodeId) return false // don't self-link
      const snippet = (n.content || '').substring(0, 60).toLowerCase()
      return snippet.includes(lower)
    })
    if (target) {
      resolvedTargetIds.add(target.id)
      // Create link if it doesn't exist yet
      await createLink(nodeId, target.id, matterId, target.matterId)
    }
  }

  // 3. Delete stale links (in DB but no longer in content)
  const existingLinks = await db.links
    .where('sourceNodeId')
    .equals(nodeId)
    .toArray()

  const staleIds = existingLinks
    .filter((l) => !resolvedTargetIds.has(l.targetNodeId))
    .map((l) => l.id)

  if (staleIds.length > 0) {
    await db.links.bulkDelete(staleIds)
  }
}

// ── Search ──────────────────────────────────────────────────────

/**
 * Full-text search across node content.
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
 *
 * @param {string} tag — tag name (without the # prefix)
 * @param {number} [limit=50]
 * @returns {Promise<Array>}
 */
export async function getNodesByTag(tag, limit = 50) {
  if (!tag || !tag.trim()) return []

  const lower = tag.toLowerCase().trim()

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
