# 06 — KV Session login

Status: ready-for-agent

## What to build

Replace JWT authentication with server-side Sessions per ADR-0007. The login action takes a username and password, verifies against the user table, creates a Session record in KV (native TTL in Cloudflare KV, the local file store in standalone mode), and sets an opaque session cookie; logout deletes that one session. Middleware resolves the session cookie to the current User (id and role) on every request, and an API Token presented as a bearer credential resolves to its owning User through the same path. The login page gets username and password fields. The JWT helpers (sign/verify, refresh-token flow, md5 refresh key) are removed.

## Acceptance criteria

- [ ] Login sets an opaque cookie backed by a KV session record; expired or unknown sessions are rejected
- [ ] Middleware exposes the current user's id and role; no JWT code paths remain
- [ ] A valid API Token in the Authorization header authenticates as that token's User
- [ ] Logout revokes only the current session; the user's other sessions survive
- [ ] Login page submits username + password and keeps the existing redirect behavior

## Blocked by

- 05 (user and api_token tables must exist)
