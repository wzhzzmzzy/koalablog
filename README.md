# Koalablog

> Self-host bearblog alternative

## LLM-readable content

Two public endpoints are enabled by default, independently of the RSS switch:

- `/llms.txt` lists public Files with their titles and absolute URLs.
- `/llms-full.txt` includes the same Files with their complete Markdown bodies, excluding leading YAML frontmatter. Svelte Files include a title, URL, and a note instead of component source.

Both endpoints list Posts before Memos, newest first within each group, with ties ordered by path. Private and deleted Files are excluded even for signed-in Owners. Responses are generated on request with `Cache-Control: no-store`, so visibility changes apply to subsequent requests. The site title comes from page settings; the description and canonical site URL use the RSS settings, with the site URL falling back to Astro's site URL or the request origin.

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
