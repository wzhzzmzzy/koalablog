import { DrizzleQueryError } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { isActivePathConstraintError } from '@/db/markdown'

describe('active File Path constraint errors', () => {
  it('recognizes the SQLite cause wrapped by Drizzle', () => {
    const error = new DrizzleQueryError('insert into markdown ...', [], new Error('UNIQUE constraint failed: markdown.path'))

    expect(isActivePathConstraintError(error)).toBe(true)
  })

  it('recognizes the nested D1 cause wrapped by Drizzle', () => {
    const cause = new Error('UNIQUE constraint failed: markdown.path: SQLITE_CONSTRAINT')
    const error = new DrizzleQueryError('insert into markdown ...', [], new Error(`D1_ERROR: ${cause.message}`, { cause }))

    expect(isActivePathConstraintError(error)).toBe(true)
  })

  it('does not treat File content in a failed query as a constraint error', () => {
    const error = new DrizzleQueryError('insert into markdown ...', ['UNIQUE constraint failed: markdown.path'], new Error('database is locked'))

    expect(isActivePathConstraintError(error)).toBe(false)
  })

  it('does not classify another unique constraint as a File Path conflict', () => {
    expect(isActivePathConstraintError(new Error('UNIQUE constraint failed: user.username'))).toBe(false)
  })

  it('terminates on cyclic error causes', () => {
    const error = new Error('query failed')
    error.cause = error

    expect(isActivePathConstraintError(error)).toBe(false)
  })
})
