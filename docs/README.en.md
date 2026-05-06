[日本語](https://github.com/Trippy3/ephemeral_board/blob/main/docs/README.md) | **English**

# Ephemeral Board

<img width="1788" height="875" alt="Screenshot from 2026-05-06 17-03-59" src="https://github.com/user-attachments/assets/0ea68581-1000-4b0e-9098-d19bf104369d" />


A real-time collaborative sticky-note board, similar to Miro / FigJam.
Runs on your local network and lets teammates collaborate together via an HTTP tunnel.

Board state can be saved and restored as Markdown, so it can be carried over between sessions.

---

## Table of Contents

- [Quick Start](#quick-start)
- [Usage](#usage)
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
pnpm share              # Print URL only
pnpm share --qr         # Also render the tunnel URL as a QR code in the terminal
pnpm share --verbose    # Stream cloudflared connection status to stderr (for diagnosis)
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
| `c` | Copy the tunnel URL to the clipboard |
| `q` / `Ctrl+C` | Cleanly stop the server and tunnel in order |

#### Command-line Options

| Flag | Action |
|--------|------|
| `--qr` / `-q` | Render a QR code of the tunnel URL in the terminal |
| `--verbose` / `-v` | Stream the cloudflared binary path / expected version, edge connect/disconnect events, stderr, and exit code to stderr. Use this when diagnosing whether the Cloudflare Tunnel is running correctly |

If you pass flags as `pnpm share <flags>`, they are forwarded directly to `tsx scripts/share.ts` (per pnpm's trailing-args convention).

Example output of `--verbose` (the leading `[cloudflared:label]` is shown in dim gray):

```
[cloudflared:bin] /home/you/.cloudflared/cloudflared
[cloudflared:version] expected 2024.10.1
[cloudflared:stderr] Starting tunnel tunnelID=xxxxx
[cloudflared:connected] id=abc ip=198.41.x.x location=NRT
[cloudflared:connected] id=def ip=198.41.y.y location=KIX
```

When the tunnel URL doesn't appear, the connection drops, or you can't reach the edge, reproduce the issue with `--verbose` and you'll see cloudflared's own diagnostic logs directly.

The `c` clipboard integration calls `pbcopy` (macOS) / `wl-copy` or `xclip` (Linux) / `clip` (Windows) per OS, so on Linux without `xclip` (etc.) installed you'll get an error (workaround: press `b` to open the URL in the browser and copy it from the address bar).

> ⚠ **Anyone with the URL can view and edit the board.**
> For boards with confidential content, protect them with tunnel-side authentication (e.g., Cloudflare Access).

#### Using cloudflared Manually

In a separate terminal (assumes you have `cloudflared` installed yourself):

```bash
pnpm dev   # or pnpm start
cloudflared tunnel --url http://localhost:3000
```

### Production-style Run (No Watch)

```bash
pnpm build   # Bundle the client JS (minified)
pnpm start   # Start the server only
```

---

## Usage

### Joining a Board

1. Opening the URL shows a name-input dialog
2. Enter your name and click "Join" (or press Enter)
3. You join the board and start collaborating with other users

### Using Multiple Boards

The URL path becomes the board ID.

| URL | Board ID |
|-----|----------|
| `http://localhost:3000/` | `default` |
| `http://localhost:3000/sprint-retro` | `sprint-retro` |
| `http://localhost:3000/brainstorm-2026` | `brainstorm-2026` |

Visiting a different URL automatically creates an independent board.

### Working with Sticky Notes

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

### Selecting Notes

| Action | How |
|------|------|
| Single-select | Click a note |
| Add to selection | Shift + click a note |
| Marquee select | Left-drag on empty space |
| Marquee add to selection | Shift + left-drag on empty space |
| Deselect | Esc / single-click empty space |
| Move as a group | Drag any note in the selection |
| Delete in bulk | Delete key |

### Connecting Notes with Arrows

There's no need to switch into a dedicated mode.

1. **Hover** over the source note → blue **● (edge anchors)** appear at the midpoints of the four edges
2. Start **dragging** from any ● → **all notes' anchors become visible** (drop targets)
3. Drop on a target note's **●** (which highlights green) → an arrow is drawn between the two anchors
4. The line is **anchored** to both edge midpoints and follows the notes when they move
   * If you drop on a note's body (not on a ●), the closest edge is chosen automatically

#### Switching Shape / Arrow / Line and Deletion

Clicking an existing connector opens a mini menu:

| Group | Button | Action |
|----------|--------|------|
| Shape | `━` | Straight line (default) |
| Shape | `⌐` | Orthogonal (right-angle bends) |
| Shape | `⌒` | Curved (arc) |
| End | `→` | With arrowhead |
| End | `—` | Plain line, no arrowhead |
| | `✕` | Delete the connector |

Shape and end are switched independently (e.g., orthogonal arrow, curved line, etc.).

If you don't drop on anything, or drop on the same note, the action is canceled.
Deleting either endpoint note automatically removes the corresponding connector.

### Framing an Area (Frames)

1. Click the ⬜ toolbar button (or press `F`) → enters frame-drawing mode
2. Left-drag on empty space to draw a rectangle
3. The mode auto-exits after drawing
4. Edit title / hover → ✕ to delete / drag the bottom-right to resize / drag the body to move

### Choosing the Default Color

Pick a color from the palette on the left of the toolbar; the next note you create uses that color.
10 colors are available: Yellow / Red / Green / Blue / Purple / Orange / Pink / White / Gray / Black

White notes get a border in the palette and a faint border on the board so they don't blend into the background.
Black notes automatically switch their text to white.

### Board-level Operations

| Action | How |
|------|------|
| Pan (default) | **Right-click + drag** or **middle-click + drag** |
| Pan (temporary) | **Hold Space and left-drag** |
| Marquee select | Left-drag on empty space |
| Move a note | Left-drag on a note |
| Zoom in / out | Mouse wheel, or the +/- buttons in the toolbar |
| Reset zoom | The `100%` button in the toolbar |
| Frame-drawing mode | ⬜ button or `F` |
| Exit mode / deselect | Esc |

Zoom centers on the mouse cursor (range: 0.2x–3.0x).
The right-click context menu is suppressed inside the board (it's used for panning).

### Keyboard Shortcuts

| Key | Function |
|------|------|
| Space (held) + left-drag | Pan the board |
| Ctrl+B | Bold the text being edited |
| Ctrl+C | Copy selected notes to clipboard |
| Ctrl+V | Paste notes at the cursor position |
| Ctrl+Z | Undo your last delete |
| Delete / Backspace | Delete selected notes |
| Esc | Exit frame mode / deselect |
| F | Toggle frame mode |

### Seeing Other Users

- User-initial avatars are shown on the right of the toolbar
- Other users' cursors (colored arrow + name label) are rendered live on the board

### Mobile (Touch) Operation

Since PC shortcuts and right-click aren't available, gesture-based equivalents are provided. The feel from a PC is preserved.

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

#### Limitations

- **Marquee select is not supported on touch** (one-finger drag is mapped to pan). To multi-select, tap notes one by one, or use a PC.
- **Keyboard shortcuts are unsupported**: Undo (Ctrl+Z) / copy-paste / bold (Ctrl+B) don't fire from the soft keyboard, so they're PC-only.
- **Note deletion goes through the ✕ button** (the Delete key isn't available).
- UI that previously required hover is replaced by "tap to select → see actions", so be mindful of the **selection state** for follow-up actions.

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

⚠ Import is **replace-only** — the current board's content is lost (cannot be undone). Export beforehand to be safe.

### Limits and Safeguards

- File size limit: 1 MB
- Element count limit: 1000 (notes + connectors + frames combined)
- Connectors that reference nonexistent notes are dropped automatically
- Note text is sanitized on both client (DOMPurify) and server. Allowed tags: `<b> <strong> <br> <div> <span> <p>`. Allowed attributes: a restricted `style` only (`text-align` / `font-size`)

---

## Caveats

- **No persistence**: All data is lost when the server restarts (by design — use MD export/import).
- **Auto-cleanup**: Boards untouched for 24 hours since the last operation are deleted automatically.
- **No authentication**: Anyone with the URL can access the board (delegate auth to the tunnel layer).
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
