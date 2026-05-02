// Lightweight server-side defense-in-depth for note HTML.
// The primary sanitization happens on the client via DOMPurify; the server
// enforces a hard size cap and strips obvious dangerous tokens before storing.
// Anything that slips through is still inert because storage is in-memory and
// re-broadcast verbatim — clients re-sanitize on render.

const MAX_NOTE_HTML_LENGTH = 16_000;

// Strip the entire element (open tag through closing tag) for tags that
// must never appear, plus loose tokens (event handlers, javascript: URLs).
const FORBIDDEN_PATTERNS: RegExp[] = [
  /<\s*script\b[\s\S]*?<\s*\/\s*script\s*>/gi,
  /<\s*script\b[^>]*>/gi,
  /<\s*\/\s*script\s*>/gi,
  /<\s*iframe\b[\s\S]*?<\s*\/\s*iframe\s*>/gi,
  /<\s*iframe\b[^>]*>/gi,
  /<\s*object\b[\s\S]*?<\s*\/\s*object\s*>/gi,
  /<\s*embed\b[^>]*\/?>/gi,
  /<\s*link\b[^>]*\/?>/gi,
  /<\s*meta\b[^>]*\/?>/gi,
  /<\s*style\b[\s\S]*?<\s*\/\s*style\s*>/gi,
  /\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi,
  /javascript:/gi,
  /data:text\/html/gi,
];

export function sanitizeNoteHtmlOnServer(input: unknown): string {
  if (typeof input !== "string") return "";
  let s = input.length > MAX_NOTE_HTML_LENGTH ? input.slice(0, MAX_NOTE_HTML_LENGTH) : input;
  for (const re of FORBIDDEN_PATTERNS) {
    s = s.replace(re, "");
  }
  return s;
}
