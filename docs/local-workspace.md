# Local Workspace Sync

`koala` is a one-shot command-line tool. It does not run a watcher, daemon, service, or automatic startup routine. One workspace belongs to one API-token Owner and needs two external environment variables:

```sh
export KOALABLOG_WORKSPACE="$HOME/KoalaWorkspace"
export KOALABLOG_URL="https://koala.example"
export KOALABLOG_BEARER_TOKEN="..."
koala workspace init "$KOALABLOG_WORKSPACE"
koala sync --once --json
```

The token stays outside the workspace; do not put it in `.koala/`, Source, archives, or shell output. `sync --once` returns a nonzero status when any individual item fails. Successful items are retained and the next scheduled call retries only what remains unconfirmed.

## Schedule every ten minutes

On macOS, use a user LaunchAgent that calls the installed CLI. Store credentials in a permissions-restricted environment file and source it from a small wrapper script; do not put the token in the plist.

```xml
<!-- ~/Library/LaunchAgents/com.example.koala-sync.plist -->
<plist version="1.0"><dict>
  <key>Label</key><string>com.example.koala-sync</string>
  <key>StartInterval</key><integer>600</integer>
  <key>ProgramArguments</key><array><string>/path/to/koala-sync-once</string></array>
</dict></plist>
```

```sh
#!/bin/sh
. "$HOME/.config/koalablog/sync.env"
exec /usr/local/bin/koala sync --once --json
```

On Linux, use a `systemd` timer with `OnUnitActiveSec=10min` and a matching `Type=oneshot` service that invokes the same wrapper. The scheduler owns recurrence; Koalablog does not install or manage it.

## Content Exchange and preview

`koala exchange export archive.zip` and `koala exchange import archive.zip` exchange only `.md`, `.svelte`, and `attachments/`. Existing destination paths are skipped. New imported Sources are private when synchronized. A Svelte Source may report `rebuild_required`; use Dashboard Build to create its online Artifact.

`koala preview widgets/example.svelte` starts a temporary localhost-only Vite preview. Stopping the command removes its temporary runtime and never uploads Source or creates an Artifact.
