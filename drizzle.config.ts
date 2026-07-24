import process from 'node:process'
import { defineConfig } from 'drizzle-kit'

const d1DriverConfig = {
  driver: 'd1-http',
  dbCredentials: {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
    databaseId: process.env.CLOUDFLARE_DATABASE_ID!,
    token: process.env.CLOUDFLARE_D1_TOKEN!,
  },
}

const sqliteDriverConfig = {
  url: process.env.SQLITE_URL,
}
const dataSource: string | undefined = process.env.DATA_SOURCE

export default defineConfig({
  out: './migrations',
  schema: './src/db/schema.ts',
  dialect: 'sqlite',
  ...(dataSource === 'd1' ? d1DriverConfig : {}),
  ...(dataSource === 'sqlite' ? sqliteDriverConfig : {}),
})
