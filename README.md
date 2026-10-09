# Koalablog

> Self-host bearblog alternative

## LLM-readable content

Two public endpoints are enabled by default, independently of the RSS switch:

- `/llms.txt` lists public Files with their titles and absolute URLs.
- `/llms-full.txt` includes the same Files with their complete Markdown bodies, excluding leading YAML frontmatter. Svelte Files include a title, URL, and a note instead of component source.

Both endpoints list Posts before Memos, newest first within each group, with ties ordered by path. Private and deleted Files are excluded even for signed-in Owners. Responses are generated on request with `Cache-Control: no-store`, so visibility changes apply to subsequent requests. The site title comes from page settings; the description and canonical site URL use the RSS settings, with the site URL falling back to Astro's site URL or the request origin.

## Attachment API from browser pages

`GET`, `PUT`, and `DELETE /api/sync/attachments/<path>` accept either an Owner's API Token or their existing Session cookie. Objects remain scoped to `sync-attachments/<userId>/<path>`; URL paths cannot select a different Owner. Downloads send `Cache-Control: private, no-store` to avoid reusing a cached response after switching accounts.

Same-origin browser pages can use `fetch(url, { method: 'PUT', credentials: 'same-origin', body: bytes })` without creating an API Token. Cookie-authenticated writes require an `Origin` matching the request URL's scheme, host, and port; cross-origin Fetch Metadata is also rejected. Cookie reads may omit `Origin`, as normal same-origin GET requests do. Rejected credentials return 401; rejected origins return 403.

CLI requests continue using `Authorization: Bearer <API Token>` without requiring `Origin`. Any explicit `Authorization` header must authenticate successfully and cannot fall back to a Session. File and manifest sync endpoints remain API Token-only. This does not change the separate Admin-only OSS upload endpoints or the public OSS download route; confidential Attachment payloads still need encryption if their storage keys could be exposed.

## Development

### 1. Cloudflare Pages Mode

#### Prerequirments

- Cloudflare Pages / KV / D1
- Node 22+

#### Local prepare

1. add local environment var to `.env` file

```env
DATA_SOURCE=d1
DEPLOY_MODE=cloudflare
CLOUDFLARE_ACCOUNT_ID=<your-cloudflare-account-id>
CLOUDFLARE_DATABASE_ID=<your-cloudflare-d1-id>
CLOUDFLARE_D1_TOKEN=<your-cloudflare-d1-token>
```

2. run local dev scripts

```bash
pnpm i
pnpm run dev:d1
```

### 2. Standalone Mode

#### Prerequirments

- Sqlite3 or alternative
- Node 22+

#### Local prepare

1. add local environment var to `.env` file

```env
DATA_SOURCE=sqlite
SQLITE_URL=file:local.db
```

2. run local dev scripts

```bash
pnpm i
pnpm run dev:sqlite
```
