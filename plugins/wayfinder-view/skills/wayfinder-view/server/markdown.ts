// Shared markdown-section parsing, used by both tracker adapters — the map
// body template (`## Destination`, `## Decisions so far`, ...) is the same
// convention whether that body is a GitHub issue or a local-markdown file,
// so the extraction logic itself has no tracker-specific knowledge.

// Pulls a `## <heading>` section's body out of a markdown document — runs
// until the next `##` heading, matching the wayfinder skill's map-body
// template.
export function extractSection(markdown: string, heading: string): string {
  const match = new RegExp(`^##\\s+${heading}\\s*$`, "im").exec(markdown);
  if (!match) return "";
  const rest = markdown.slice(match.index + match[0].length);
  const next = /^##\s+/m.exec(rest);
  return (next ? rest.slice(0, next.index) : rest).trim();
}
