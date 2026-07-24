# 10 — User-creating onboarding

Status: ready-for-agent

## What to build

Rework onboarding for the multi-user model: a fresh site initializes by creating the first User — operator-chosen username and password, PBKDF2-hashed, Admin role — and immediately establishing a Session for them. The admin-key and guest-key concepts disappear from onboarding and from the global config shape. Existing sites are covered by issue 05's migration and are out of scope here.

## Acceptance criteria

- [ ] Fresh install: onboarding collects username + password, creates the Admin user, starts a Session, marks the site ready
- [ ] No admin key or guest key fields or config entries remain anywhere
- [ ] Visiting onboarding on an already-initialized site redirects away as today
- [ ] Onboarding works on both the D1 and sqlite paths

## Blocked by

- 06 (onboarding creates a Session through the new login machinery)
