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
The initial public or private state assigned from the file's path category, independently of its creation template. Files under `/memo/` start private; files under other paths start public.
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
A credential owned by exactly one User for API access; many API Tokens can exist at once, and a request bearing one acts with that User's identity.
_Avoid_: Bearer token, global token

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
The versioned compiled browser bundle, component and generated utility styles, and SEO snapshot derived entirely in the client from one saved Source Hash of a Svelte File. It identifies its artifact schema, Svelte and style-toolchain versions, and Source Hash, but its presence or validity never determines whether the Source File exists or can be saved.
_Avoid_: Source file, generated file, publication state

**Current Render Artifact**:
A Render Artifact whose Renderer Mode and Source Hash match the current Svelte File. File revision, Path, and visibility are not currentness inputs, so an exact Source reversion may make a preserved Artifact current again; a missing or stale Artifact makes the File unrenderable without changing or hiding its Source.
_Avoid_: Published version, current file, draft

**Disk Representation**:
The extension-bearing path used when exchanging source files with a local directory or ZIP archive. Markdown uses `.md` and Svelte uses `.svelte`; import removes that renderer extension to recover the extensionless absolute file path.
_Avoid_: File path, public URL, render artifact
