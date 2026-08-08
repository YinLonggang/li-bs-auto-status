# Auto Status SPA Instructions

These rules add to the repository-root `AGENTS.md` for `li-bs-auto-status`.

## API and resource URL boundary

- Components, hooks, utilities, and domain modules must not call `fetch`, `XMLHttpRequest`, or `EventSource` directly. Put network I/O in `src/services`.
- Treat every backend-provided `*_url`, `content_url`, `preview_url`, and `download_url` as potentially relative. Resolve requests through `API_BASE_URL` or a service wrapper that uses it; never resolve a protected API path against `window.location` or the SPA origin.
- Protected previews, downloads, and binary content must be fetched with credentials by a service helper. Do not bind a protected relative API URL directly to `src`, `href`, `window.open`, or a parser.
- Binary consumers must reject HTML/JSON success responses before parsing and validate a file signature when one exists. A Vite `/api` proxy proves only development behavior; every new resource URL requires a production-style regression with different SPA and API origins.
