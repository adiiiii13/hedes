# Hedes Studio audit — 1 October 2026

## Verified in this checkout

- TypeScript typecheck, seven focused algorithm/path/agent tests, and Remix production build pass.
- Electron development window launches and serves the app on loopback.
- GitHub import clones a public test repository into a new project and preserves `.git`; malformed URLs are rejected.
- Project initialization creates starter files once and refuses to overwrite a populated project.
- File API rejects traversal outside the project, and terminal requests ignore a working directory outside the active project.
- Memory create, edit, recall, and delete work through the local API. Local skills save and delete through their API.
- The built-in local plugin installs, starts its MCP server, lists `list_projects` and `search_memory`, and responds to a tool call.
- Cross-origin writes return HTTP 403. A missing model key returns HTTP 400.
- MCP, Skills, and Memory GET endpoints return HTTP 200 in the production server. The desktop development app launches with the current code.
- The configured Groq key can list available models, including the selected default model. No completion request was sent during this audit.
- The Windows packaged executable starts, loads the Remix server build and renderer assets, and serves local API requests. The NSIS installer is built with the app icon; a desktop shortcut launches the packaged executable.

## Repairs and design changes

- GitHub import now uses `execFile` with a strict GitHub URL and a temporary clone directory before moving it into place. Existing project files are preserved on failure.
- Project IDs and file paths are validated; symlink traversal is rejected for file writes and deletes. Project initialization no longer kills the process on port 5173.
- File scans skip `.env` and hidden Hedes files and cap file size and total context. Model prompt context is bounded.
- The shell route is restricted to the active project working directory, and sensitive local routes reject cross-origin writes.
- Memory is stored as an editable parent/child tree. Keyword recall selects relevant notes with parent paths, and note contents enter the model prompt only when relevant.
- MCP client, MCP server, local plugin manifest, and SKILL.md support are available in Settings. Model-triggered MCP tool execution is off by default per server.
- Swarm and relay now call the selected model separately for each enabled persona and stream each actual response. A final synthesis uses only successful responses. Failed calls are shown as failures, never counted as completed.
- Direct Council chat returns real model output or an explicit error; scripted fallback responses were removed.
- A bounded background review after a completed chat turn adds durable facts to a tree memory branch and can save a reusable skill when app actions completed successfully. Existing skills are not overwritten.
- MCP and Skills settings show built-in recommended options with Install buttons. MCP presets use the official open source reference servers.
- Existing layout remains; fonts, text contrast, and focus colors were refined.
- Appearance now offers eight dark palettes, six editable color tokens, font controls, three bundled Unsplash wallpapers, and a compressed custom image upload. The slash-command chip row was removed and its toggle reads "100 Bots".
- Custom OpenAI-compatible endpoints can list models through `/v1/models`; the model ID is optional when discovery succeeds. A local mock endpoint returned two models through the production API. Custom providers retain the scanned choices and use their own endpoint during chat. Wallpaper assets returned HTTP 200; image layering was adjusted to make the selected wallpaper visible behind the workspace.

## Limits of verification

- The 100-persona runner's call count, relay context, and failure accounting are verified with a mocked model. An actual 100-call cloud run has not been performed, so provider rate limits and output quality remain unverified. These are AI perspectives, not real humans or objective votes.
- Ollama is not installed on this machine. An attempted official Windows package install stalled before downloading data and was stopped. Local model generation remains unverified until Ollama and a model are installed.
- A valid Groq key and model listing were confirmed without generating text. Cloud completion quality, cost tier, and rate limits were not tested. Cloud providers may charge according to the account plan.
- Automatic review adds one additional model request after a successful chat turn. Free use requires a local model or a provider tier that permits the workload; 100 cloud requests cannot be promised free.
- The Windows installer was built but not installed; all provider adapters, image understanding, Flutter and React Native projects, all templates, accessibility, and long-running generated dev servers were not end-to-end certified. The installer is unsigned.
- User API keys remain in browser local storage for the existing settings flow. The backend settings file no longer copies them. For sensitive work, select local Ollama once available; cloud providers receive the prompt and relevant file/memory context.
- MCP only supports local stdio servers at present. Plugin manifests are local files, with the built-in Hedes plugin included. Remote plugin marketplaces and remote MCP HTTP transport are not implemented.

## Commands

```powershell
pnpm test
pnpm run typecheck
pnpm run build
pnpm run electron:dev
pnpm mcp:serve
```
