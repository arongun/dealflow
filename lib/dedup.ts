export function generateDedupHash(
  title: string,
  descriptionSnippet: string | null
): string {
  const titlePart = title.toLowerCase().trim().slice(0, 50)
  const descPart = (descriptionSnippet || '').toLowerCase().trim().slice(0, 100)
  return `${titlePart}|${descPart}`
}
