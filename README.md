# Koalablog

> Self-host bearblog alternative

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
