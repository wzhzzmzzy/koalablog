# Koalablog Files

Koalablog Files defines the plain-text files stored and edited in the online workspace and the rules used to initialise and render them.

## Language

**File**:
A server-persisted plain-text unit with an absolute path, renderer mode, and content. Its content always exists as text, with an empty string representing a blank File; the File exists independently of whether that text is complete, valid, or renderable.
_Avoid_: Document, draft, markdown record

**Path Prefix**:
The normalised absolute file-path namespace under which a creation template applies, such as `/memo/`. Prefixes follow path-segment boundaries, may use `/` as a catch-all, and never address parent or recycle-bin segments.
_Avoid_: Folder, directory

**Creation Template**:
A reusable rule that supplies the initial renderer mode, absolute path, derived title, and content for a new file created under a path prefix.
_Avoid_: File template, page template

**Template Catalog**:
The configured collection of creation templates. A new catalog initially contains the ordinary `/memo/` creation template as a preset; an empty catalog applies no template.
_Avoid_: Built-in templates, implicit templates

**Applicable Creation Template**:
The unique creation template with the most specific path prefix matching the location where a file is created. A path prefix identifies at most one creation template.
_Avoid_: First template, ordered template

**Template Instantiation**:
The one-time creation of initial file values from the applicable creation template. Instantiated values remain independent of later edits to the template, while title always remains derived from path.
_Avoid_: Binding, synchronisation

**File Creation**:
The server operation that immediately persists a new file after resolving its applicable template or blank-creation values. Creation does not introduce a draft or publication state.
_Avoid_: Client placeholder, draft creation, unsaved file

**Edit Buffer**:
The recoverable, client-local modifications made after a file exists and before the user saves it back to the server. It is editor state, not a file, draft, or lifecycle state.
_Avoid_: Draft, temporary file, client file

**Blank Creation**:
The ordinary new-file fallback used when no creation template applies. It chooses an available absolute path ending in `unnamed` or a numbered variant and leaves content empty.
_Avoid_: Default template, empty template

**Template Placeholder**:
A declarative token resolved during template instantiation without executing user-supplied code. Title placeholders resolve first, followed by absolute-path placeholders and then content placeholders.
_Avoid_: Expression, script, binding

**Unique Suffix**:
The smallest shared suffix that makes an instantiated file path distinct from existing files. The same suffix is reflected in its derived title; a path collision without a unique-suffix placeholder prevents creation rather than silently changing the template result.
_Avoid_: Random suffix, automatic rename

**Absolute Path Template**:
The path pattern within a creation template that resolves under the template's path prefix and whose final segment is the instantiated title. The title pattern cannot contain a slash, and the path pattern uses `{{title}}` as its complete final segment.
_Avoid_: Relative path, link template

**File Path**:
The unique, visitable, slash-leading absolute path of a file. Koalablog paths are extensionless because rendering format is selected by file metadata rather than the filename.
_Avoid_: Link, directory path

**Title**:
The extensionless file name derived strictly from the final segment of a file path. It cannot differ from or change independently of that path.
_Avoid_: Display title, subject, metadata title

**Post Display Title**:
The reader-facing title of a Markdown Post, resolved from a non-empty string `title` in its leading YAML frontmatter and otherwise falling back to the derived File Title. It affects the Post header, browser/SEO title, post lists, RSS, and editor preview. It is not persisted as independent File metadata, does not affect paths or references, and is preserved as ordinary Source during import, export, and sync.
_Avoid_: File Title, subject, a second database title

**File Reference**:
An explicit, literal reference to another file by its absolute file path, such as `[[/project/foo]]`. Titles are never resolved as shorthand references, and moving or renaming the target does not rewrite referring files.
_Avoid_: Title link, ambiguous link, implicit file

**Visibility Default**:
The initial public or private state assigned by Dashboard File Creation from the file's path category, independently of its creation template. Files under `/memo/` start private; files under other paths start public. Local Workspace Creation instead always starts private.
_Avoid_: Template privacy, content privacy

**Source**:
The persisted listing category of a File — Post or Memo — that determines which list it appears in. It is assigned from the Path Prefix at creation and is never re-derived from the File Path on save, so list membership can differ from the path namespace.
_Avoid_: Preset source, path category, document type

**User**:
A registered account identified by a username, with a password stored only as a salted hash. The first User holds the Admin role and manages site-wide settings; every User owns Files and logs in through Sessions.
_Avoid_: Account, guest

**Owner**:
The User a File belongs to. Every File has exactly one Owner, assigned at creation or migration, and ownership never changes implicitly.
_Avoid_: Author, creator

**Visibility**:
A File's persisted public or private state. Public Files are readable by anyone; Private Files are readable only by their Owner. The initial state comes from the Visibility Default.
_Avoid_: Hidden, published, draft

**Session**:
A server-side login state for one User on one device, identified by an opaque cookie token. A User may hold many Sessions at once, each expiring or being revoked independently of the others.
_Avoid_: JWT, login cookie, token

**API Token**:
A credential owned by exactly one User for API access; many API Tokens can exist at once, and a request bearing one acts with that User's identity. Every remote operation in a Sync Cycle authenticates with its Owner's API Token through Bearer authorization.
_Avoid_: Bearer token, global token

**Sync Credential Configuration**:
The per-user, workspace-external configuration that supplies a Sync Cycle's API Token from its process environment or personal configuration. It is never stored in a Local Workspace, Sync State, or Source-controlled file.
_Avoid_: Workspace secret, checked-in token, sync metadata secret

**Svelte File**:
A self-contained file whose content is trusted, executable Svelte source owned by the site operator rather than prose to be rendered as Markdown. It owns the blog page's body region while the surrounding page shell remains site-owned, and may depend on the platform Svelte runtime, absolute web modules, or browser runtime requests rather than neighbouring files.
_Avoid_: Svelte snippet, untrusted component

**Renderer Mode**:
The persisted file metadata that selects whether content is interpreted as Markdown or Svelte. It belongs to the source file, remains meaningful without a render artifact, and changes only when the file is saved.
_Avoid_: Renderer directive, file extension, content detection, artifact renderer

**Source Hash**:
A deterministic fingerprint of the Renderer Mode and content saved in a File. A Render Artifact is current only when it names the File's current Source Hash; this is distinct from the optimistic File revision and the Artifact Hash.
_Avoid_: File revision, Artifact Hash, security signature

**Renderer**:
The interpretation applied to a file body independently of its path category. It does not determine the file's URL, listing, visibility, or date.
_Avoid_: Document type, path type, page category

**Page Shell**:
The site-owned frame around a file body, including document-head metadata, blog navigation, theme, and footer. A Svelte File receives no supported document-head surface and owns only the body mount target.
_Avoid_: Svelte page, file content

**SEO Snapshot**:
The saved, script-free HTML representation of a Svelte File's initial body. It contains no executable code or embedded browsing context but may preserve native safe navigation and form submission; it remains through initial load or mount failure, then is permanently replaced once the live body starts successfully rather than serving as later runtime recovery state.
_Avoid_: Server rendering, cache, screenshot

**Render Artifact**:
The versioned compiled browser bundle, component and generated utility styles, and SEO snapshot derived entirely in the client from one saved Source Hash of a Svelte File. It identifies its artifact schema, Svelte and style-toolchain versions, and Source Hash, but its presence or validity never determines whether the Source File exists or can be saved. A synchronized Svelte Source without a Current Render Artifact is `rebuild_required`, not a failed synchronization.
_Avoid_: Source file, generated file, publication state

**Local Svelte Preview**:
A temporary localhost-only Vite runtime that compiles and displays one Local Workspace Svelte Source. It neither uploads Source nor creates a Render Artifact; Dashboard Build remains the only way to attach an online Artifact.
_Avoid_: Dashboard Build, artifact compiler, online preview

**Current Render Artifact**:
A Render Artifact whose Renderer Mode and Source Hash match the current Svelte File. File revision, Path, and visibility are not currentness inputs, so an exact Source reversion may make a preserved Artifact current again; a missing or stale Artifact makes the File unrenderable without changing or hiding its Source.
_Avoid_: Published version, current file, draft

**Site Stylesheet**:
The style payload for shared static UI — the Page Shell, public pages, and reusable Editor UI.
_Avoid_: Static Tailwind, global CSS

**Dashboard Stylesheet**:
The additional style payload for Dashboard-owned UI and its component library.
_Avoid_: dashboard-ui.css, shadcn styles

**Artifact Stylesheet**:
The style payload persisted and delivered as part of a Render Artifact.
_Avoid_: Artifact CSS, Worker UnoCSS output

**Disk Representation**:
The extension-bearing path used when exchanging source files with a local directory or ZIP archive. Markdown uses `.md` and Svelte uses `.svelte`; import removes that renderer extension to recover the extensionless absolute file path.
_Avoid_: File path, public URL, render artifact

**Attachment**:
A binary object referenced by a File Source and stored separately from that Source. A Local Workspace may upload Attachments, while a Render Artifact is derived separately in the Dashboard and is never synchronized as an Attachment.
_Avoid_: File Source, Svelte artifact, embedded binary

**Attachment Root**:
The `attachments/` directory at the root of a Local Workspace and Content Exchange. Every Attachment has a stable absolute Source reference under `/attachments/`; no other local directory is treated as Attachment storage. Removing an Attachment from this directory deletes the same online Attachment, and renaming one uploads its new path then deletes its old path, without rewriting Sources that reference it.
_Avoid_: Arbitrary upload directory, source directory, generated artifact directory

**Implicit Directory**:
A Local Workspace path segment that exists only because it contains a File Source or Attachment. It is not an online record, so empty directories are neither synchronized nor restored.
_Avoid_: Folder entity, directory synchronization, empty-directory record

**Content Exchange**:
A portable import or export containing editable File Source and Attachments in their filesystem representation. Dashboard ZIP and CLI import/export use the same format. It excludes online identity, revision, credentials, recycle-bin history, and Render Artifacts; importing it creates new private Files through Local Workspace Creation. An import skips and reports an existing same-path File rather than overwriting it.
_Avoid_: Database backup, D1 dump, workspace clone

**Local Workspace**:
A user-managed filesystem tree containing editable File Source in its Disk Representation for exactly one Owner. It is the local peer of that Owner's online File workspace, not a SQLite database, D1 backup, or local implementation of the Koalablog editor and renderer.
_Avoid_: Local database, D1 mirror, vault database

**Local Workspace Creation**:
The File Creation caused by discovering a Local Workspace Source without a corresponding online File. It initializes the new File as private regardless of its File Path; the File's persisted Source is otherwise assigned by the ordinary creation rule.
_Avoid_: Dashboard creation, path-derived visibility, public local default

**Local Rename**:
The move or rename of a Local Workspace Source that is recognized as the same local filesystem object. It updates the corresponding online File Path while retaining File identity and persisted metadata; an unrecognizable cross-filesystem copy instead becomes Local Workspace Creation plus File Removal.
_Avoid_: Delete and recreate, path-derived metadata reset, implicit reference rewrite

**Sync State**:
The minimal, generated baseline held under a Local Workspace's hidden `.koala/` directory. It records only the last confirmed File identity, remote revision, and Source Hash needed to detect a concurrent change; it stores no File history, source copy, or local database.
_Avoid_: Version history, local metadata database, D1 replica

**Sync Conflict**:
The condition where a File's Local Workspace Source and online Source both changed after their last confirmed synchronization and have different Source Hashes. Synchronization leaves both Sources and the prior Sync State entry unchanged, reports the File in the Sync Cycle's `conflicted` result, and exits nonzero. It does not select a last writer, create conflict copies, or merge Source; a person resolves it by making the two Sources identical and then runs another Sync Cycle.
_Avoid_: Automatic merge, last-writer-wins, conflict copy

**File Removal**:
The synchronized lifecycle transition that moves an active File to the online recycle bin. Removing its Local Workspace Source initiates this transition, while online removal removes the corresponding local Source; restoration is initiated online and recreates the local Source.
_Avoid_: Immediate purge, permanent local deletion, untracked unlink

**Sync Cycle**:
The one-shot reconciliation of a Local Workspace and the online File workspace. An external scheduler invokes it every ten minutes without filesystem watching; the CLI provides no daemon, service, or automatic startup and then applies the File Removal and Sync Conflict rules. Each File and Attachment completes independently, so a failed or conflicted item preserves completed changes and is retried later rather than publishing a transactional workspace snapshot.
_Avoid_: File watcher, event-driven local sync, continuous disk monitoring, built-in daemon

**HDD-Friendly Scan**:
The Local Workspace pass within a Sync Cycle that traverses the workspace once and compares directory-entry metadata, modification time, and size to Sync State. It reads Source, hashes content, or uploads only a candidate whose metadata changed.
_Avoid_: File watcher, repeated full-content scan, background indexing

**Instant Search**:
A direct, non-persistent search over Local Workspace File Source that returns matching File Paths and context snippets. Attachments participate only through their filenames and Source references; their binary content is not extracted. It does not depend on embeddings, vector storage, or a semantic index.
_Avoid_: Vector search, embedding index, knowledge graph

**AI Workspace Maintenance**:
An AI's authorized Local Workspace work: searching and reading Sources, creating or updating Sources, adding Attachments, and explicitly running a Sync Cycle. Removing a Source or Attachment is excluded unless the user explicitly requests that removal in the current task.
_Avoid_: Unbounded remote administration, implicit deletion, direct token use
