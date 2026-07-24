# 05 — User and API Token schema with first-user migration

Status: ready-for-agent

## What to build

Add the `user` table (unique username, PBKDF2 password hash with per-user salt, admin/member role, timestamps), the `api_token` table (per-user API Tokens, multiple allowed per ADR-0011), and a `user_id` column on the file table. Provide PBKDF2 hash/verify helpers using WebCrypto only (no new dependency; do not reuse the existing md5 helper). Write the one-shot migration: create the first User named `admin` with the Admin role whose password is the existing admin key (hashed), assign every existing file to that user, convert the stored bearer token into an API Token for that user, and remove the guest key from config.

## Acceptance criteria

- [ ] New tables and the `user_id` column land via a drizzle migration on both the D1 and sqlite paths
- [ ] PBKDF2 helpers hash and verify correctly with unit tests
- [ ] Migration creates user `admin`, assigns all files, migrates the bearer token, and deletes guestKey
- [ ] The old admin key logs in as the admin password after migration
- [ ] Migration is guarded against accidental double execution

## Blocked by

- 01 (migration files must number sequentially; land the source migration first)
