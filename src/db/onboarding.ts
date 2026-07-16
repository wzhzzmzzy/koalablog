import { connectD1 } from '@/db'
import { sql } from 'drizzle-orm'

const RESET_STATEMENTS = [
  'DROP INDEX IF EXISTS markdown_link_unique',
  'DROP INDEX IF EXISTS markdown_subject_unique',
  'DROP INDEX IF EXISTS markdown_active_link_unique',
  'DROP INDEX IF EXISTS markdown_active_subject_unique',
  'DROP INDEX IF EXISTS markdown_active_path_unique',
  'DROP TABLE IF EXISTS markdown',
  'DROP INDEX IF EXISTS oss_access_date_unique',
  'DROP TABLE IF EXISTS oss_access',
  'DROP INDEX IF EXISTS blob_storage_key_unique',
  'DROP TABLE IF EXISTS blob_storage',
  'DROP TABLE IF EXISTS creation_template_catalog',
]

function migrationStatements(migrations: string[]): string[] {
  return migrations.flatMap(migration => migration
    .split('--> statement-breakpoint')
    .map(statement => statement.trim())
    .filter(Boolean))
}

export async function resetD1ForOnboarding(env: Env, migrations: string[]): Promise<void> {
  const db = connectD1(env.DB)
  for (const statement of [...RESET_STATEMENTS, ...migrationStatements(migrations)])
    await db.run(sql.raw(statement))
}
