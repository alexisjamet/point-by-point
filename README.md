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

## Install

The server is hosted once for everyone (or [run your own copy](#run-your-own-copy-of-the-server));
there is nothing to install on your computer. You add two
things to your Claude account: a **connector** (the server) and a **skill** (which tells Claude to
use it). You need both, in any order.

### claude.ai, Claude Desktop and the mobile apps

Do this once on [claude.ai](https://claude.ai) in a browser; it then applies everywhere you use
Claude with that account.

1. **Add the connector.** Go to **Settings → Connectors → Add custom connector**, give it a name
   (for example `point-by-point`) and paste this URL:

   ```
   https://point-by-point.brols.workers.dev/mcp
   ```

2. **Add the skill.** Download
   [`point-by-point-skill.zip`](https://github.com/alexisjamet/point-by-point/releases/latest/download/point-by-point-skill.zip),
   then upload it in **Settings → Capabilities → Skills**. Upload the `.zip` as it is: do not
   unzip it (if your browser unzipped it on its own, zip the `point-by-point` folder again).

Menu names move from time to time; look for "Connectors" and "Skills" in the settings.

### Try it

Start a **new conversation** and ask anything. Instead of plain text, Claude's answer appears in
an interface:

1. Click a sentence (or select a passage) and type your reply under it. Repeat for as many
   sentences as you like.
2. Press **Send**. On Claude Desktop the message lands in your message box first: press Enter to
   send it.
3. Claude answers each of your points, in a new interface.

### If it doesn't work

- **Claude answers in plain text.** Check that the connector is turned on for this conversation
  (the tools menu in the message box), and that the skill is turned on in **Settings → Capabilities
  → Skills**. Then start a new conversation.
- **No "Skills" or "Add custom connector" in the settings.** These depend on your plan, and in a
  Team or Enterprise organisation an admin may have to allow them. Skills may also require code
  execution to be turned on in **Settings → Capabilities**.
- **The interface is blank or shows an error.** Reload the page; your notes are kept as a draft.

### Run your own copy of the server

The hosted server sees the text of Claude's responses (see [Privacy and security](#privacy-and-security)).
To keep it to yourself, deploy your own copy on a free [Cloudflare](https://dash.cloudflare.com/sign-up)
account. You need Node 22 or later and a terminal:

```sh
git clone https://github.com/alexisjamet/point-by-point.git
cd point-by-point
npm install -g pnpm
pnpm install
pnpm --filter @point-by-point/server exec wrangler login   # opens Cloudflare in your browser
pnpm run deploy
```

The last command prints your server's address, `https://point-by-point.<your-subdomain>.workers.dev`.
On a new Cloudflare account you may first have to choose that subdomain, under **Workers & Pages**
in the dashboard. Then follow the steps above with your address plus `/mcp` as the connector URL;
the skill is the same. To get a new release later: `git pull && pnpm run deploy`.

### For an organisation

A Team or Enterprise admin adds the plugin from this repository to the organisation's plugin
catalogue; skill and connector reach everyone at once.

### Anthropic's plugin directory

Planned once the v1 is stable, through the
[plugin directory submission form](https://clau.de/plugin-directory-submission).

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
- **Send** hands the message to the host. Claude Desktop places it in your message box under a
  caution banner it shows for every message an interactive app proposes; read it and press Enter
  to send it. If you discard it, **Restore notes** brings your notes back.
- After sending, a mark appears and the widget stays usable. A widget from an earlier
  response can still send: its message starts with "(About an earlier response)".
- Every keystroke is saved as a draft and restored if the page reloads before sending.
- Keyboard: Tab / Shift+Tab move between sentences, Enter opens a note, Escape leaves a note,
  Cmd/Ctrl+Enter sends.
- Mobile: creating a note does not open the keyboard; fields are 16 px (no iOS zoom). Opening a
  note asks the host for fullscreen; if the host refuses, a focus mode keeps only the quote, the
  field and a **Done** button above the keyboard. In fullscreen, **Done** shows the whole response
  at the note, still fullscreen, so you can go on to the next point; **Send** or **Back to the
  conversation** returns inline.
- English and French, following the host's locale. Light and dark, following the host's theme.
- Links open through the host. Images are shown as links (the interface loads nothing remote).

## Privacy and security

The text of Claude's responses goes through the server, and so do your notes whenever Claude quotes
them back. Your notes themselves go from the interface to the conversation through the host, not
through the server.

The guarantees below hold for the code in this repository. The hosted server
(`point-by-point.brols.workers.dev`) is run by the author, and nothing lets you check that it runs
this code: using it means trusting the author, as you trust Anthropic with the conversation itself.
To trust no one but Cloudflare, [run your own copy](#run-your-own-copy-of-the-server).

What the code guarantees:

- **No storage, no content logs.** No KV, D1, R2 or Durable Objects. The Worker logs errors and one fixed
  line when it serves a tool list without the tool (to diagnose a connector that shows no tools),
  never the markdown or anything else from the request.
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
The URIs of earlier releases keep being served, with the current interface, so widgets already in
conversations keep loading.
Deploying needs the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` repository secrets;
without them the release is still published, the deploy step is skipped with a warning, and the
Worker is deployed by hand with `pnpm run deploy`.

## License

[MIT](LICENSE)
