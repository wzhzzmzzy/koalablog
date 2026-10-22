---
status: accepted
---

# Remove captured HTML and support D1 / R2 Artifact storage

Svelte Files remain trusted client-built application code. Deploy no longer mounts a component to capture HTML, waits for browser paint, canonicalizes a Snapshot, or stores a static body. Editor Preview remains interactive and independent from Deploy. Public pages show explicit loading, failure and JavaScript-required messages; content indexing and no-script rendering of the application body are no longer provided. Page Shell titles remain File-derived.

This supersedes ADR-0008 and the Snapshot-specific parts of ADR-0002 and ADR-0004. ADR-0015's explicit deployment, Dependency Drift confirmation and Source independence remain unchanged. Renderer Replacement and recycle-bin behavior remain unchanged.

Artifact schema v2 excludes captured HTML from its input and hash. Migration removes the old column for all rows, including recycled Files, but preserves existing opaque Artifact Hashes and representation hashes: migration is not a rebuild or a deployment. Already-open v1 editors must reload before deploying.

Each deployed Artifact supports two storage modes. D1 retains inline JavaScript and CSS; R2 retains their exact delivered bytes under internal content-addressed keys while D1 retains metadata and current references. Editable Source always stays in D1 (SQLite for local installations). Both modes use the same authenticated resource URLs, validators and lifecycle checks. R2 objects must not be exposed through a public bucket domain or the legacy OSS route.

New deployments default to D1; ordinary redeployment preserves the current storage mode. Deploy offers an explicit mode selector and independent, Owner-scoped transfers of existing deployments. Transfers run one File at a time in the open browser tab, verify both representations before atomically switching references with Artifact identity, prior mode and Owner guards, and never update Source, revisions or deployment timestamps. A conflict or failed transfer leaves the prior representation available; the batch stops and retains completed transfers.

R2 writes precede database CAS. Failed CAS and R2-to-D1 transfers do not immediately delete objects: another request may still be streaming them, and objects may be needed by a recoverable database backup. No background queue, automatic garbage collector, rebuild or write-on-read migration is introduced. Resource retirement requires a separate reference-aware retention policy covering backups; it is not authorized by a storage transfer.

Settings exposes an Admin-only, explicit database migration. It requires backup and Snapshot-removal acknowledgement, reports aggregate affected bytes without exposing private content, and records the schema migration in the appropriate migration ledger. Until that migration, legacy inline artifacts remain readable without captured HTML; new Deploy and storage transfers explain that migration is required. Read requests never initialize or migrate the database.
