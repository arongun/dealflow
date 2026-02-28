const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
  'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
  'could', 'should', 'may', 'might', 'shall', 'can', 'our', 'their',
  'this', 'that', 'these', 'those', 'it', 'its', 'we', 'they', 'you',
  'i', 'my', 'your', 'his', 'her', 'am', 'not', 'no', 'so', 'if',
  'about', 'up', 'out', 'as', 'into', 'also', 'just', 'than', 'then',
  'each', 'every', 'all', 'any', 'both', 'few', 'more', 'most', 'other',
  'some', 'such', 'only', 'own', 'same', 'very',
])

/**
 * Normalize description for hashing: strip non-alpha, remove stop words,
 * filter out short/truncated words, sort remaining words alphabetically,
 * and take the first N words (not chars) to avoid truncation artifacts.
 *
 * This makes the hash immune to:
 * - Word-order changes ("for exclusive CEO use" vs "for the exclusive use of our CEO")
 * - Stop-word insertion/removal ("a", "the", "of", etc.)
 * - Snippet truncation at different boundaries
 */
function normalizeDescForHash(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w))  // >2 chars to skip truncation fragments
    .sort()
    .slice(0, 8)  // take first 8 sorted content words — enough to differentiate, stable across snippets
    .join('')
}

/**
 * Primary dedup hash: title (exact, normalized) + description (stop-word-free, sorted words).
 * Title is the anchor; description is the tiebreaker for same-title jobs.
 */
export function generateDedupHash(
  title: string,
  descriptionSnippet: string | null
): string {
  const titlePart = title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 80)
  const descPart = normalizeDescForHash(descriptionSnippet || '')
  return `${titlePart}|${descPart}`
}

/**
 * Title-only hash for fallback dedup. Used as a candidate signal —
 * when title matches, we compare descriptions to confirm it's truly
 * the same job (not a different job with the same title).
 */
export function generateTitleHash(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * Extract content words from description text (stop-word-free, lowercase, >2 chars).
 */
function getDescriptionWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w))
  )
}

/**
 * Jaccard similarity between two description texts.
 * Returns 0-1 (0 = no overlap, 1 = identical word sets).
 * Used as a tiebreaker when title_hash matches but dedup_hash doesn't.
 */
export function descriptionOverlap(a: string, b: string): number {
  const wordsA = getDescriptionWords(a)
  const wordsB = getDescriptionWords(b)
  if (wordsA.size === 0 && wordsB.size === 0) return 1
  if (wordsA.size === 0 || wordsB.size === 0) return 0
  let intersection = 0
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++
  }
  const union = new Set([...wordsA, ...wordsB]).size
  return intersection / union
}

/** Overlap threshold above which a title-match is treated as a duplicate */
export const OVERLAP_THRESHOLD = 0.4

/**
 * Split raw pasted Upwork text into individual job chunks.
 * Each chunk starts at a "Posted X ago" / "Posted X hours ago" line.
 */
export function splitRawTextIntoChunks(rawText: string): string[] {
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

  if (postedIdx === -1 || postedIdx + 1 >= lines.length) {
    // Fallback: try first non-trivial line as title (no description)
    const candidateTitle = lines.find((l) => l.length >= 10 && l.length <= 150)
    if (candidateTitle) {
      return { title: candidateTitle, descSnippet: '' }
    }
    return null
  }

  const title = lines[postedIdx + 1]
  if (!title || title.length < 5) return null

  // Description: starts after "Est. budget:" or "Est. time:" + its value line
  const estIdx = lines.findIndex((l) => /^Est\.\s*(budget|time):/i.test(l))
  let descStartIdx = -1

  if (estIdx !== -1) {
    descStartIdx = estIdx + 2
  }

  let descSnippet = ''
  if (descStartIdx > 0 && descStartIdx < lines.length) {
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
