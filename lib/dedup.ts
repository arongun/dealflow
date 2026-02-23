export function generateDedupHash(
  title: string,
  descriptionSnippet: string | null
): string {
  const titlePart = title.toLowerCase().trim().slice(0, 50)
  const descPart = (descriptionSnippet || '').toLowerCase().trim().slice(0, 100)
  return `${titlePart}|${descPart}`
}

/**
 * Split raw pasted Upwork text into individual job chunks.
 * Each chunk starts at a "Posted X ago" / "Posted X hours ago" line.
 */
export function splitRawTextIntoChunks(rawText: string): string[] {
  // Split on lines that start with "Posted" (e.g. "Posted 2 hours ago", "Posted yesterday")
  // Use lookahead so the "Posted..." line stays with the chunk it starts
  const chunks = rawText.split(/(?=^Posted\s.+)/m).filter((c) => c.trim().length > 0)
  return chunks
}

/**
 * Extract a rough title + description from a raw chunk for pre-AI dedup hashing.
 * Returns null if we can't reliably extract identity (chunk will be sent to Claude).
 *
 * Reliable anchors from Upwork paste format:
 *   Title  → always the line immediately after "Posted X ago"
 *   Desc   → starts on the line after "Est. budget: <value>" or "Est. time: <value>"
 *   End    → skills + "Proposals: X" at bottom (irrelevant — we only need first 200 chars)
 */
export function extractChunkIdentity(
  chunk: string
): { title: string; descSnippet: string } | null {
  const lines = chunk.split('\n').map((l) => l.trim()).filter((l) => l.length > 0)

  // Title: line immediately after "Posted ..."
  const postedIdx = lines.findIndex((l) => /^Posted\s/i.test(l))
  if (postedIdx === -1 || postedIdx + 1 >= lines.length) return null

  const title = lines[postedIdx + 1]
  if (!title || title.length < 5) return null

  // Description: starts after "Est. budget:" or "Est. time:" + its value line
  const estIdx = lines.findIndex((l) => /^Est\.\s*(budget|time):/i.test(l))
  let descStartIdx = -1

  if (estIdx !== -1) {
    // The "Est." line itself might contain the value (e.g. "Est. budget: $1,000")
    // or the value is on the next line. Description starts after the value.
    descStartIdx = estIdx + 2
  }

  let descSnippet = ''
  if (descStartIdx > 0 && descStartIdx < lines.length) {
    // Take lines from description start, skip short skill-like lines at the end
    const descLines = lines.slice(descStartIdx)
    descSnippet = descLines.join(' ').slice(0, 200)
  } else {
    // Fallback: find first line > 80 chars after title
    for (let i = postedIdx + 2; i < lines.length; i++) {
      if (lines[i].length > 80) {
        descSnippet = lines[i].slice(0, 200)
        break
      }
    }
    // Last resort: concatenate everything after title
    if (!descSnippet) {
      descSnippet = lines.slice(postedIdx + 2).join(' ').slice(0, 200)
    }
  }

  return { title, descSnippet }
}
