# point-by-point

Reply to Claude **point by point**. Claude shows its response in a read-only interface; you click any
sentence (or select any passage), write your reply or question under it, and send everything back
in a single message.

```
`First we migrate the database.` Back it up first.

`switch traffic` When exactly?

Looks good overall.
```

It is an [MCP App](https://claude.com/blog/interactive-tools-in-claude): an MCP server that declares
one tool, `annotate_response`, whose interface is rendered inline in the conversation by hosts that
support MCP Apps (claude.ai, Claude Desktop, the Claude mobile apps).

## How it works

1. Claude calls `annotate_response` with its response in markdown, instead of writing it in the chat.
2. The host loads the interface resource (`ui://point-by-point/annotate-v<major>.<minor>.html`) in a
   sandboxed iframe and passes it the markdown.
3. The interface renders the markdown (sanitised), splits it into sentences and lets you annotate.
4. **Send** injects the composed message into the conversation as if you had typed it.
5. Claude reads the quotes, answers each point, and responds through the tool again.

The tool is only declared to clients that announce MCP Apps support
(`io.modelcontextprotocol/ui` with `text/html;profile=mcp-app`). Anywhere else — Claude Code in a
terminal, the API without an MCP Apps host — the tool does not exist and Claude answers normally,
so you never end up with an invisible response.

### What the interface does

- Click a sentence, or select a passage of more than two characters, to open a note under its
  paragraph. Click an annotated sentence again to return to its note.
- An optional general remark at the bottom; a counter; empty notes are ignored.
- Notes are sent in document order; backticks in quotes become apostrophes.
- After sending, a "Sent" mark appears and the widget stays usable. A widget from an earlier
  response can still send: its message starts with "(About an earlier response)".
- Every keystroke is saved as a draft and restored if the page reloads before sending.
- Keyboard: Tab / Shift+Tab move between sentences, Enter opens a note, Escape leaves a note,
  Cmd/Ctrl+Enter sends.
- Mobile: creating a note does not open the keyboard; fields are 16 px (no iOS zoom). Opening a
  note asks the host for fullscreen; if the host refuses, a focus mode keeps only the quote, the
  field and a **Done** button above the keyboard.
- English and French, following the host's locale. Light and dark, following the host's theme.
- Links open through the host. Images are shown as links (the interface loads nothing remote).

## Install

The server is hosted once for everyone; there is nothing to install locally.

Server URL: `https://point-by-point.brols.workers.dev/mcp`

### Claude Code (plugin marketplace)

```
/plugin marketplace add alexisjamet/point-by-point
/plugin install point-by-point@point-by-point
```

This installs the skill and the connector together. Claude Code's terminal does not render MCP
Apps, so there the tool stays hidden and responses are normal; the plugin is useful in hosts that
render interfaces.

### claude.ai, for yourself

1. **Settings → Connectors → Add custom connector**, paste the server URL.
2. Download `point-by-point-skill.zip` from the
   [latest release](https://github.com/alexisjamet/point-by-point/releases/latest), then upload it
   in **Settings → Capabilities → Skills**.

The connector and the skill then apply on claude.ai, Claude Desktop and the mobile apps. Menu names
move from time to time; look for "Connectors" and "Skills" in the settings.

### claude.ai, for an organisation

A Team or Enterprise admin adds the plugin from this repository to the organisation's plugin
catalogue; skill and connector reach everyone at once.

### Anthropic's plugin directory

Planned once the v1 is stable, through the
[plugin directory submission form](https://clau.de/plugin-directory-submission).

## Privacy and security

The text of Claude's responses goes through the server. These guarantees hold by construction and
can be checked in this repository:

- **No storage, no content logs.** No KV, D1, R2 or Durable Objects. The Worker logs errors only,
  never the markdown.
- **No outbound calls**, from the server or the interface. Everything is inlined in one HTML file:
  no CDN script, font or image.
- **Sanitised rendering.** Markdown goes through `marked` then DOMPurify with a strict allow-list;
  if DOMPurify cannot run, the text is shown as plain text, never as raw HTML.
- **No authentication and no personal data.** A Cloudflare rate limit (1000 requests per minute per
  IP — generous, because claude.ai users share a few Anthropic egress IPs) caps abusive clients.
- **Minimal, pinned dependencies** (exact versions, lockfile), reviewed before each update.
- **MIT licence**, reproducible build from this repository.

Drafts are kept in the interface's own `localStorage` (inside the host's sandbox, on your device)
and deleted after a successful send.

## Development

TypeScript monorepo, pnpm workspaces, Node 22+.

```
packages/
  server/   Cloudflare Worker: MCP server (tool + interface resource)
  ui/       the annotation interface, built to a single HTML file
plugin/     Claude plugin: .claude-plugin/plugin.json, .mcp.json, skills/point-by-point
.claude-plugin/marketplace.json   this repository as a plugin marketplace
```

```sh
pnpm install
pnpm build        # interface → packages/ui/dist/index.html, embedded into the Worker
pnpm test         # unit tests (segmentation, message format, drafts, server guards)
pnpm e2e          # Playwright: the built interface in a test host (desktop and mobile)
pnpm dev          # wrangler dev on http://localhost:8787/mcp
```

The server answers both MCP protocol eras without keeping state: 2026-07-28 requests carry the
client capabilities in every request; for 2025 clients the session id handed out at `initialize`
encodes whether the client renders interfaces.

### Testing in claude.ai

The real iframe and host context only exist in a real host. Expose the dev server with a
Cloudflare tunnel and add the tunnel URL as a custom connector:

```sh
pnpm dev
cloudflared tunnel --url http://localhost:8787
# add https://<random>.trycloudflare.com/mcp as a custom connector in claude.ai
```

### Mobile diagnostic

Ask Claude to call `annotate_response` with the markdown `/point-by-point-diagnostic`. Instead of a
response, the widget shows the display modes and device capabilities the host announces, can request
fullscreen, and can send its report back to the conversation.

### Deploy

```sh
pnpm run deploy   # builds, then wrangler deploy; prints the workers.dev URL
```

A fork deployed to another Cloudflare account gets its own URL: put it (with `/mcp`) in
`plugin/.mcp.json` and in your custom connector.

### Release

Bump `version` in `package.json`, `plugin/.claude-plugin/plugin.json` and
`.claude-plugin/marketplace.json`, then push a `v<version>` tag. The release workflow runs every
check, builds the interface under its versioned URI (a new URI per release, so no host serves a
stale cached interface), deploys the Worker and attaches the skill archive to the GitHub release.
It needs the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` repository secrets.

## License

[MIT](LICENSE)
