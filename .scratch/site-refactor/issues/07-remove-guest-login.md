# 07 — Remove the guest-login system

Status: ready-for-agent

## What to build

Delete the guest-login page, the guest API endpoints, the guest role, and every reference to the guest passkey (global config, settings form field, middleware branches, docs). Private files visited while logged out now redirect to `/login` with the target path carried through, replacing the old `?id=` guest flow — after logging in, the visitor lands back on the file.

## Acceptance criteria

- [ ] No guest-login route, guest API endpoint, guest role, or guestKey reference remains anywhere
- [ ] A private file URL visited logged-out redirects to `/login` and returns to the file after login
- [ ] Middleware CSRF/origin handling for unauthenticated form posts still works
- [ ] Settings no longer shows a guest passkey field

## Blocked by

- 06 (the `/login` flow must work before it becomes the redirect target)
