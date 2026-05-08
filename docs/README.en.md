[日本語](https://github.com/Trippy3/ephemeral_board/blob/main/docs/README.md) | **English**

# Ephemeral Board

<img width="1788" height="875" alt="Screenshot from 2026-05-06 17-03-59" src="https://github.com/user-attachments/assets/0ea68581-1000-4b0e-9098-d19bf104369d" />


A real-time collaborative sticky-note board, similar to Miro / FigJam.
Runs on your local network and lets teammates collaborate together via an HTTP tunnel.

Board state can be saved and restored as Markdown, so it can be carried over between sessions.

---

## Table of Contents

- [Quick Start](#quick-start)
- [Auto-generate Boards with the Claude Code Skill](#auto-generate-boards-with-the-claude-code-skill)
- [How to Operate](#how-to-operate)
- [Markdown Export / Import](#markdown-export--import)
- [Caveats](#caveats)
- [Developer Documentation](#developer-documentation)

---

## Quick Start

### Prerequisites

- Node.js v20 or later

### Install and Run

```bash
cd ephemeral_board
pnpm install
pnpm dev
```

Open http://localhost:3000 in your browser.

### Share with Teammates (pnpm share)

```bash
pnpm share              # Streams cloudflared connection diagnostics to stderr by default
pnpm share --qr         # Also render the tunnel URL as a QR code in the terminal
pnpm share --quiet      # Suppress the diagnostics and print only the URL banner
```

This single command brings up everything:

1. Production-builds the client (equivalent to `pnpm build`)
2. Starts the server
3. Starts a Cloudflare Tunnel (the `cloudflared` binary is auto-downloaded on first run)
4. Prints both the `Local` URL and the `Tunnel` URL (`*.trycloudflare.com`) to the terminal
5. With `--qr` (or `-q`), also renders a QR code of the tunnel URL — scan it with your phone

After startup, the following keys work in the terminal:

| Key | Action |
|------|------|
| `b` | Open the tunnel URL in your default browser |
| `c` | Copy the tunnel URL to the clipboard (Linux requires `xclip` or `wl-copy`) |
| `q` / `Ctrl+C` | Cleanly stop the server and tunnel in order |

#### Command-line Options

| Flag | Action |
|--------|------|
| `--qr` / `-q` | Render a QR code of the tunnel URL in the terminal |
| `--quiet` / `-s` | Suppress cloudflared diagnostic logs and only print the URL banner |

When the tunnel URL doesn't appear or the connection drops, the cloudflared diagnostic logs streamed to stderr (on by default) usually contain the clue. The diagnostic log format, running cloudflared yourself, the production-style (no-watch) run, and migrating to a Named Tunnel are covered in [DEVELOPMENT.md (Japanese)](https://github.com/Trippy3/ephemeral_board/blob/main/docs/DEVELOPMENT.md).

---

## Auto-generate Boards with the Claude Code Skill

If you use [Claude Code](https://claude.com/claude-code), you can **auto-generate** an organized board (sticky notes, color coding, frames, and arrows) from messy inputs like meeting minutes, brainstorm notes, requirement lists, or article summaries.

The repository ships the `create-sticky-board` skill at `.claude/skills/create-sticky-board/`. Claude Code picks it up automatically when launched at the project root.

### How to Use

Inside a Claude Code session, invoke `/create-sticky-board` as a slash command and pass the content you want to board:

```text
/create-sticky-board Please turn the following meeting notes into a board.
- Target: in-house engineers
- Pain points: docs are scattered / search returns stale info
- Ideas: a Slack-resident Q&A bot / score document freshness
- Actions: a 2-week PoC / interview 5 users
```

The skill automatically:

1. Reads the input's structure and decides categories (e.g., premise / problems / ideas / actions)
2. Picks a layout (category grid / flowchart / mind map / matrix / timeline)
3. Designs a legend frame and color coding (3–5 of the 10 available colors mapped to categories)
4. Emits a single `.md` file containing notes, frames, and connectors

Load the generated `.md` from **Import MD** to restore the organized board as-is.

### When It Helps

- You want to lay out meeting minutes / brainstorm notes as sticky notes
- You want to classify points / problems / ideas with colors and frames
- You want to visualize causality, dependencies, or flow with arrows
- You want to mind-map a long article or document summary

If you only need to edit an already-exported `.md`, or you just want a plain text summary, normal editing is enough.

### Output Format and Customization

The `.md` the skill produces conforms to this repository's Markdown import format (YAML fences). The skill itself, format spec, and a sample output live under `.claude/skills/create-sticky-board/`:

- `SKILL.md` — design guidelines: layout rules, color usage, ID conventions
- `references/example_output.md` — a complete sample output
- `references/format_spec.md` — field-by-field validation spec

For the Markdown import format itself, see [DEVELOPMENT.md — Markdown Output Format Spec (Japanese)](https://github.com/Trippy3/ephemeral_board/blob/main/docs/DEVELOPMENT.md#markdown-出力フォーマット仕様).

---

## How to Operate

Opening the URL shows a name-input dialog. Enter your name and click "Join" (or press Enter) to join the board and start collaborating.

The URL path becomes the board ID. Visiting a different URL automatically creates an independent board.

| URL | Board ID |
|-----|----------|
| `http://localhost:3000/` | `default` |
| `http://localhost:3000/sprint-retro` | `sprint-retro` |
| `http://localhost:3000/brainstorm-2026` | `brainstorm-2026` |

### Sticky Notes

#### Creating and Editing

| Action | How |
|------|------|
| Create a note | Double-click an empty area of the board |
| Edit text | Click the text area inside a note and type directly |
| Bold | While editing, Ctrl+B (⌘+B on Mac) toggles bold on the selection |
| Text alignment | Hover over a note → ⯇ / ≡ / ⯈ buttons |
| Font size | Hover over a note → A− / A+ buttons (12 / 14 / 18 / 24 px) |
| Move | Drag the note's header or any non-text margin |
| Resize | Drag the bottom-right corner |
| Change color | Hover → click the 🎨 button → pick a color |
| Delete | Hover → ✕ button, or press Delete while selected |
| Undo delete | Ctrl+Z (up to 20 of your own deletes) |
| Copy / Paste | Select then Ctrl+C → Ctrl+V at the cursor position |

#### Selecting

| Action | How |
|------|------|
| Single-select | Click a note |
| Add to selection | Shift + click a note |
| Marquee select | Left-drag on empty space |
| Marquee add to selection | Shift + left-drag on empty space |
| Deselect | Esc / single-click empty space |
| Move as a group | Drag any note in the selection |
| Delete in bulk | Delete key |

#### Connecting with Arrows

There's no need to switch into a dedicated mode.

1. **Hover** over the source note → blue **● (edge anchors)** appear at the midpoints of the four edges
2. Start **dragging** from any ● → **all notes' anchors become visible** (drop targets)
3. Drop on a target note's **●** (which highlights green) → an arrow is drawn between the two anchors
4. The line is **anchored** to both edge midpoints and follows the notes when they move  
   * If you drop on a note's body (not on a ●), the closest edge is chosen automatically

Clicking an existing connector opens a mini menu where you can independently switch the shape (straight `━` / orthogonal `⌐` / curved `⌒`) and the end (arrowhead `→` / plain line `—`), or delete it with `✕`.

If you don't drop on anything, or drop on the same note, the action is canceled. Deleting either endpoint note automatically removes the corresponding connector.

#### Framing an Area

1. Click the ⬜ toolbar button (or press `F`) → enters frame-drawing mode
2. Left-drag on empty space to draw a rectangle
3. The mode auto-exits after drawing
4. Edit title / hover → ✕ to delete / drag the bottom-right to resize / drag the body to move

#### Choosing the Default Color

Pick a color from the palette on the left of the toolbar; the next note you create uses that color. 10 colors are available (Yellow / Red / Green / Blue / Purple / Orange / Pink / White / Gray / Black). White notes get a faint border so they don't blend into the background, and black notes automatically switch their text to white.

### The Board

#### Pan and Zoom

| Action | How |
|------|------|
| Pan (default) | **Right-click + drag** or **middle-click + drag** |
| Pan (temporary) | **Hold Space and left-drag** |
| Zoom in / out | Mouse wheel, or the +/- buttons in the toolbar |
| Reset zoom | The `100%` button in the toolbar |
| Exit mode / deselect | Esc |

Zoom centers on the mouse cursor (range: 0.2x–3.0x). The right-click context menu is suppressed inside the board (it's used for panning).

#### Seeing Other Users

- User-initial avatars are shown on the right of the toolbar
- Other users' cursors (colored arrow + name label) are rendered live on the board

#### Mobile (Touch) Operation

Since PC shortcuts and right-click aren't available, gesture-based equivalents are provided.

| Action | Touch |
|------|--------|
| Pan | **Drag with one finger** (on empty space) |
| Zoom | **Pinch with two fingers** + two-finger pan during pinch |
| Create a note | **Long-press** empty space (~0.5s), or **double-tap** |
| Select a note | Tap the note |
| Deselect | Single tap on empty space |
| Move a note | Drag a note with one finger |
| Show action buttons | While a note is selected (`B` / alignment / font size / 🎨 / ✕ etc. become visible) |
| Edit note text | Tap the body → enter text via the soft keyboard |
| Create a connector | Select a note to expose its edge anchors (●) → drag from a ● to another note |
| Resize a note | Drag the bottom-right handle while selected |
| Draw a frame | ⬜ button → drag empty space with one finger |

On touch devices, touch targets are automatically enlarged (edge anchors / action buttons / resize handles, etc.).

**Limitations**: Marquee select is not supported because one-finger drag is mapped to pan (multi-select by tapping notes one at a time). Keyboard shortcuts like Undo (Ctrl+Z), copy-paste, and bold (Ctrl+B) don't fire from the soft keyboard, so they're PC-only. Note deletion goes through the ✕ button.

---

## Markdown Export / Import

The toolbar's **Export MD** button downloads the entire board state as a Markdown file.
**Import MD** loads a file in the same format and fully restores the board.

The output includes a YAML front-matter block and a re-importable data block.
For the full format spec, see [DEVELOPMENT.md — Markdown Output Format Spec (Japanese)](https://github.com/Trippy3/ephemeral_board/blob/main/docs/DEVELOPMENT.md#markdown-出力フォーマット仕様).

### Import Behavior

1. Click **Import MD** → choose a file
2. A confirmation dialog shows the counts of notes / connectors / frames
3. Pressing "Replace" **fully replaces** the current board, and the change is reflected immediately for every connected client
4. Invalid YAML or unknown schemas are rejected up front by validation (an alert appears before the dialog)

Export beforehand to be safe — import is replace-only and cannot be undone (see "Caveats" at the end for details).

### Limits and Safeguards

- File size limit: 1 MB
- Element count limit: 1000 (notes + connectors + frames combined)
- Connectors that reference nonexistent notes are dropped automatically
- Note text is sanitized on both client (DOMPurify) and server. Allowed tags: `<b> <strong> <br> <div> <span> <p>`. Allowed attributes: a restricted `style` only (`text-align` / `font-size`)

---

## Caveats

- **No persistence**: All data is lost when the server restarts (by design — use MD export/import).
- **Auto-cleanup**: Boards untouched for 24 hours since the last operation are deleted automatically.
- **No authentication**: This app is designed for ephemeral collaboration (workshops, retros, brainstorms) and is **not** intended for handling confidential data. Anyone with the URL can access the board. If you need robust security, set up an alternative yourself — e.g. a Named Tunnel with Cloudflare Access.
- **Text conflicts**: Concurrent edits of the same note follow LWW (last write wins).
- **Undo scope**: Only your own deletes, up to 20.
- **Import is replace-only**: Merging into an existing board is not supported.
- **Practical scale**: Because rendering is DOM-based, a few hundred notes per board is the realistic ceiling.

---

## Developer Documentation

To make code changes or learn the internals and architecture, see [DEVELOPMENT.md (Japanese)](https://github.com/Trippy3/ephemeral_board/blob/main/docs/DEVELOPMENT.md).

- Project layout, pnpm scripts, dependencies
- Markdown output format spec (the YAML fence schema)
- Configuration and customization (env vars, code-constant changes)
- Architecture overview (sync flow, text editing, connector updates)
- Background of technical decisions
- Candidate extensions
