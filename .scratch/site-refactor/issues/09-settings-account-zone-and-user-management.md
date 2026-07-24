# 09 — Settings account zone and user management

Status: ready-for-agent

## What to build

Split the Settings page into two zones. The Account zone is visible to every user: change password (requires the current password, no confirmation field; on success the user's other Sessions are revoked and the current one survives), and create/revoke their own API Tokens with the token value shown once at creation. The existing site-wide zone (title, theme, RSS, OSS, fonts, templates) becomes Admin-only, and gains user management: the Admin can create a user with a username and initial password, and reset any user's password without the old one.

## Acceptance criteria

- [ ] Password change verifies the current password and revokes the user's other sessions on success
- [ ] Users manage their own API Tokens; token value is displayed exactly once
- [ ] Non-admin users never see or submit the site-wide zone (server-enforced, not just hidden)
- [ ] Admin can create users and reset passwords from the site zone
- [ ] Site-level actions (settings save, template management) reject non-admin users

## Blocked by

- 06 (requires session identity and roles)
