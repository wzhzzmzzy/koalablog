<script lang="ts">
  import { onMount } from 'svelte'
  import { ActionError, isOwnerAccessError, readOwnedMarkdown, saveOwnedMarkdown } from '@koala/page-runtime'

  type Icon = 'done' | 'todo' | 'chevron' | 'external' | 'note' | 'edit' | 'plus' | 'refresh'
  type SvgNode = [string, Record<string, string | number>]
  type Filter = 'all' | 'todo' | 'done'
  type Note = { type: 'comment'; text: string } | { type: 'reference'; label: string; href: string }
  type Item = { id: string; title: string; done: boolean; url?: string; notes: Note[] }
  type Category = { title: string; description?: string; items: Item[] }
  type StateFile = { id: number; path: string; renderer: 'markdown'; content: string; private: true; revision: number }
  type Draft = { id: string; title: string; url: string; comments: string; references: string }

  // Keep this path aligned with the private Markdown companion File, not this
  // Svelte Source. Its parent is the sole read scope used by the shared runtime.
  const statePath = '/data/to-be-read'
  const statePrefix = statePath.slice(0, statePath.lastIndexOf('/')) || '/'
  let categories = $state<Category[]>([])
  let activeIndex = $state(0)
  let filter = $state<Filter>('all')
  let expandedId = $state<string | null>(null)
  let draft = $state<Draft | null>(null)
  let stateFile = $state<StateFile | null>(null)
  let status = $state<'loading' | 'ready' | 'saving' | 'error' | 'conflict'>('loading')
  let statusMessage = $state('Loading your private list…')
  let iconNodes = $state<Partial<Record<Icon, SvgNode[]>>>({})
  let saveRequested = false

  const activeCategory = $derived(categories[activeIndex])
  const allItems = $derived(categories.flatMap(category => category.items))
  const completedCount = $derived(allItems.filter(item => item.done).length)
  const visibleItems = $derived.by(() => !activeCategory ? [] : activeCategory.items.filter((item) => {
    return filter === 'all' || (filter === 'done' ? item.done : !item.done)
  }))

  onMount(() => {
    // The Artifact Snapshot is produced in an opaque preview iframe without the
    // owner's session. Keep its neutral loading shell instead of recording a
    // misleading authentication failure; the mounted private page loads normally.
    if (window.location.origin !== 'null')
      void loadState()
    void import('https://esm.sh/lucide@0.546.0?bundle').then(({ icons }) => {
      iconNodes = {
        done: icons.CircleCheckBig, todo: icons.Circle, chevron: icons.ChevronDown,
        external: icons.ExternalLink, note: icons.MessageSquareText, edit: icons.Pencil,
        plus: icons.Plus, refresh: icons.RefreshCw,
      }
    }).catch(() => {})
  })

  async function loadState(message = 'Loading your private list…') {
    status = 'loading'
    statusMessage = message
    try {
      const file = await readOwnedMarkdown({
        path: statePath,
        prefix: statePrefix,
      }) as StateFile
      const next = parseMarkdown(file.content)
      if (!next.length) throw new Error('Companion Markdown has no categories')
      stateFile = file
      categories = next
      activeIndex = Math.min(activeIndex, next.length - 1)
      expandedId = null
      draft = null
      status = 'ready'
      statusMessage = 'Saved'
    }
    catch (error) {
      status = 'error'
      statusMessage = isOwnerAccessError(error)
        ? 'Sign in as this list owner to access its private Markdown.'
        : messageOf(error)
    }
  }

  function parseMarkdown(source: string): Category[] {
    const result: Category[] = []
    let category: Category | null = null
    let current: Item | null = null
    let categoryIndex = -1
    let itemIndex = 0
    for (const line of source.replace(/\r\n?/g, '\n').split('\n')) {
      const heading = /^##\s+(.+?)\s*$/.exec(line)
      if (heading) {
        categoryIndex += 1
        itemIndex = 0
        category = { title: heading[1], items: [] }
        result.push(category)
        current = null
        continue
      }
      if (!category) continue
      const item = /^-\s+\[([ xX])\]\s+(.+?)\s*$/.exec(line)
      if (item) {
        current = { id: String(categoryIndex) + ':' + String(itemIndex++), done: item[1].toLowerCase() === 'x', notes: [], ...parseItemText(item[2]) }
        category.items.push(current)
        continue
      }
      const reference = /^\s{2,}-\s+\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)\s*$/.exec(line)
      if (reference && current) {
        current.notes.push({ type: 'reference', label: reference[1], href: reference[2] })
        continue
      }
      const comment = /^>\s?(.*)$/.exec(line)
      if (comment && comment[1].trim()) {
        if (current) current.notes.push({ type: 'comment', text: comment[1].trim() })
        else category.description = category.description ? category.description + '\n' + comment[1].trim() : comment[1].trim()
      }
    }
    return result
  }

  function parseItemText(value: string): Pick<Item, 'title' | 'url'> {
    const link = /^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)\s*$/.exec(value)
    if (link) return { title: link[1], url: link[2] }
    const url = /\s+(https?:\/\/\S+)\s*$/.exec(value)
    return url ? { title: value.slice(0, url.index).trim(), url: url[1] } : { title: value.trim() }
  }

  function toMarkdown(value: Category[]) {
    const lines = []
    for (const category of value) {
      lines.push('', '## ' + category.title)
      if (category.description) {
        lines.push('')
        for (const description of category.description.split('\n')) lines.push('> ' + description)
      }
      for (const item of category.items) {
        lines.push('', '- [' + (item.done ? 'x' : ' ') + '] ' + item.title + (item.url ? ' ' + item.url : ''))
        for (const note of item.notes) if (note.type === 'reference') lines.push('  - [' + note.label + '](' + note.href + ')')
        for (const note of item.notes) if (note.type === 'comment') for (const text of note.text.split('\n')) lines.push('> ' + text)
      }
    }
    return lines.join('\n').trimEnd() + '\n'
  }

  function updateItem(id: string, update: (item: Item) => Item) {
    categories = categories.map(category => ({ ...category, items: category.items.map(item => item.id === id ? update(item) : item) }))
  }

  function toggleDone(id: string) {
    updateItem(id, item => ({ ...item, done: !item.done }))
    requestSave()
  }

  function selectCategory(index: number) {
    activeIndex = index
    expandedId = null
    draft = null
  }

  function toggleNotes(item: Item) {
    if (!item.notes.length) return
    expandedId = expandedId === item.id ? null : item.id
    if (expandedId !== item.id) draft = null
  }

  function edit(item: Item) {
    expandedId = item.id
    draft = {
      id: item.id,
      title: item.title,
      url: item.url ?? '',
      comments: item.notes.filter(note => note.type === 'comment').map(note => note.text).join('\n\n'),
      references: item.notes.filter(note => note.type === 'reference').map(note => note.label + ' | ' + note.href).join('\n'),
    }
  }

  function addItem() {
    if (!activeCategory) return
    const item: Item = { id: 'new-' + Date.now().toString(36), title: '', done: false, notes: [] }
    categories = categories.map((category, index) => index === activeIndex ? { ...category, items: [...category.items, item] } : category)
    edit(item)
  }

  function saveDraft(event: SubmitEvent) {
    event.preventDefault()
    if (!draft) return
    const title = draft.title.trim()
    if (!title) {
      status = 'error'
      statusMessage = 'An item needs a title'
      return
    }
    const references = draft.references.split('\n').map(line => line.trim()).filter(Boolean).flatMap((line): Note[] => {
      const separator = line.indexOf('|')
      const label = separator > 0 ? line.slice(0, separator).trim() : ''
      const href = separator > 0 ? line.slice(separator + 1).trim() : ''
      return label && /^https?:\/\//.test(href) ? [{ type: 'reference', label, href }] : []
    })
    const comments = draft.comments.split(/\n\s*\n/).map(text => text.trim()).filter(Boolean).map((text): Note => ({ type: 'comment', text }))
    updateItem(draft.id, item => ({ ...item, title, url: draft!.url.trim() || undefined, notes: [...references, ...comments] }))
    expandedId = draft.id
    draft = null
    requestSave()
  }

  function removeDraft() {
    if (!draft) return
    const id = draft.id
    categories = categories.map(category => ({ ...category, items: category.items.filter(item => item.id !== id) }))
    expandedId = null
    draft = null
    requestSave()
  }

  function requestSave() {
    saveRequested = true
    void saveWhileNeeded()
  }

  async function saveWhileNeeded() {
    if (status === 'saving' || status === 'conflict' || !stateFile) return
    status = 'saving'
    statusMessage = 'Saving…'
    while (saveRequested) {
      saveRequested = false
      try {
        const baseline = stateFile
        stateFile = await saveOwnedMarkdown(baseline, toMarkdown(categories)) as StateFile
      }
      catch (error) {
        if (isSourceConflict(error)) {
          status = 'conflict'
          statusMessage = 'Changed in another tab. Loading the latest Markdown…'
          await loadState(statusMessage)
          return
        }
        status = 'error'
        statusMessage = isOwnerAccessError(error)
          ? 'Your session can no longer edit this private list.'
          : messageOf(error)
        return
      }
    }
    status = 'ready'
    statusMessage = 'Saved'
  }

  function isSourceConflict(error: unknown) {
    return error instanceof ActionError
      && error.code === 'CONFLICT'
      && error.message.includes('"source_conflict"')
  }

  function retry() {
    if (status === 'error') void loadState('Reloading your private list…')
    else requestSave()
  }

  function completedIn(category: Category) {
    return category.items.filter(item => item.done).length
  }

  function messageOf(error: unknown) {
    return error instanceof Error ? error.message : 'Unexpected error'
  }

  function escapeAttribute(value: string | number) {
    return String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;')
  }

  function icon(name: Icon, className = '') {
    const fallback: Record<Icon, string> = { done: '✓', todo: '○', chevron: '⌄', external: '↗', note: '✦', edit: '✎', plus: '+', refresh: '↻' }
    const nodes = iconNodes[name]
    if (!nodes) return '<span class="' + escapeAttribute(className) + '" aria-hidden="true">' + fallback[name] + '</span>'
    const content = nodes.map(([tag, attributes]) => '<' + tag + ' ' + Object.entries(attributes).map(([key, value]) => key + '="' + escapeAttribute(value) + '"').join(' ') + ' />').join('')
    return '<svg class="' + escapeAttribute(className) + '" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + content + '</svg>'
  }
</script>

<section class="consume-list" aria-labelledby="consume-list-title">
  <header class="topbar">
    <div><p class="eyebrow">Private library</p><h1 id="consume-list-title">Reading List</h1></div>
    <p class="progress" aria-label={String(completedCount) + ' of ' + String(allItems.length) + ' completed'}><strong>{completedCount}</strong><span>/{allItems.length}</span></p>
  </header>

  {#if categories.length}
    <div class="tabs" role="tablist" aria-label="Consume list categories">
      {#each categories as category, index}
        <button type="button" role="tab" aria-selected={activeIndex === index} class:active={activeIndex === index} onclick={() => selectCategory(index)}>
          <span>{category.title}</span><small>{completedIn(category)}/{category.items.length}</small>
        </button>
      {/each}
    </div>

    {#if activeCategory}
      <section class="category" aria-labelledby={'category-' + String(activeIndex)}>
        <header class="category-header">
          <div><h2 id={'category-' + String(activeIndex)}>{activeCategory.title}</h2>{#if activeCategory.description}<p>{activeCategory.description}</p>{/if}</div>
          <button class="add-button" type="button" onclick={addItem} aria-label={'Add an item to ' + activeCategory.title}>{@html icon('plus', 'icon')}<span>Add</span></button>
        </header>
        <div class="toolbar">
          <div class="filters" aria-label="Filter items">
            <button type="button" class:active={filter === 'all'} onclick={() => filter = 'all'}>All</button>
            <button type="button" class:active={filter === 'todo'} onclick={() => filter = 'todo'}>To do</button>
            <button type="button" class:active={filter === 'done'} onclick={() => filter = 'done'}>Done</button>
          </div>
          <span class:error={status === 'error'} class:saving={status === 'saving'} class="save-state">{statusMessage}{#if status === 'error' || status === 'conflict'}<button type="button" onclick={retry} aria-label="Retry">{@html icon('refresh', 'status-icon')}</button>{/if}</span>
        </div>

        <ol class="entries">
          {#each visibleItems as item}
            {@const hasNotes = item.notes.length > 0}
            <li class:expanded={expandedId === item.id}>
              <div class="entry-row">
                <button class="status-toggle" type="button" aria-label={(item.done ? 'Mark incomplete: ' : 'Mark complete: ') + item.title} onclick={() => toggleDone(item.id)}>{@html icon(item.done ? 'done' : 'todo', 'status-icon ' + (item.done ? 'status-done' : ''))}</button>
                <button class="entry-main" class:clickable={hasNotes} type="button" aria-expanded={hasNotes ? expandedId === item.id : undefined} onclick={() => toggleNotes(item)}>
                  <span class:complete={item.done} class="entry-title">{item.title}</span>
                  {#if hasNotes}{@html icon('chevron', 'chevron ' + (expandedId === item.id ? 'open' : ''))}{/if}
                </button>
                {#if item.url}<a class="entry-action" href={item.url} target="_blank" rel="noreferrer" aria-label={'Open ' + item.title}>{@html icon('external', 'icon')}</a>{/if}
                <button class="entry-action" type="button" onclick={() => edit(item)} aria-label={'Edit ' + item.title}>{@html icon('edit', 'icon')}</button>
              </div>

              {#if hasNotes && expandedId === item.id}
                <div class="notes" id={'notes-' + item.id}>
                  {#each item.notes as note}
                    {#if note.type === 'comment'}<p>{note.text}</p>
                    {:else}<a href={note.href} target="_blank" rel="noreferrer"><span>{note.label}</span>{@html icon('external', 'reference-icon')}</a>{/if}
                  {/each}
                </div>
              {/if}

              {#if draft?.id === item.id}
                <form class="item-editor" onsubmit={saveDraft}>
                  <label><span>Title</span><input bind:value={draft.title} required /></label>
                  <label><span>Link <em>optional</em></span><input bind:value={draft.url} type="url" placeholder="https://…" /></label>
                  <label><span>Comments <em>separate paragraphs with a blank line</em></span><textarea bind:value={draft.comments} rows="4" placeholder="What stayed with you?"></textarea></label>
                  <label><span>References <em>one per line: label | https://…</em></span><textarea bind:value={draft.references} rows="3" placeholder="PDF | https://example.com"></textarea></label>
                  <div class="editor-actions"><button class="delete-button" type="button" onclick={removeDraft}>Remove</button><span></span><button class="quiet-button" type="button" onclick={() => draft = null}>Cancel</button><button class="save-button" type="submit">Save item</button></div>
                </form>
              {/if}
            </li>
          {:else}
            <li class="empty-state">No {filter === 'all' ? '' : filter === 'todo' ? 'unfinished' : 'completed'} items in this category.</li>
          {/each}
        </ol>
      </section>
    {/if}
  {:else}
    <p class="loading-state">{statusMessage}</p>
  {/if}
</section>

<style>
  .consume-list, .consume-list * { box-sizing: border-box; }
  .consume-list {
    --paper: var(--koala-dashboard-panel, #fff); --ink: var(--koala-dashboard-foreground, #262833);
    --muted: var(--koala-dashboard-muted-foreground, #747784); --line: var(--koala-dashboard-border, #dedfe7);
    --accent: var(--koala-dashboard-primary, #5b5bd6); --soft: color-mix(in srgb, var(--accent) 9%, var(--paper));
    --success: var(--koala-dashboard-success, #388665);
    width: min(100%, 48rem); margin: 0 auto; padding: clamp(1rem, 4vw, 2.25rem) clamp(.85rem, 3vw, 1.4rem) 2rem;
    color: var(--ink); font-family: var(--koala-font-sans, ui-sans-serif, system-ui, sans-serif);
  }
  h1, h2, p { margin: 0; }
  .topbar { display:flex; align-items:end; justify-content:space-between; gap:1rem; padding:.2rem 0 1rem; border-bottom:1px solid var(--line); }
  .eyebrow { margin-bottom:.35rem; color:var(--muted); font-size:.65rem; font-weight:760; letter-spacing:.13em; text-transform:uppercase; }
  h1 { font-size:clamp(1.7rem, 7vw, 2.35rem); font-weight:730; letter-spacing:-.055em; line-height:1; }
  .progress { display:flex; align-items:baseline; gap:.12rem; padding-bottom:.1rem; color:var(--muted); font-size:.8rem; font-variant-numeric:tabular-nums; }
  .progress strong { color:var(--ink); font-size:1.45rem; letter-spacing:-.06em; }
  .tabs { display:flex; gap:.3rem; overflow-x:auto; margin:0 -.15rem; padding:.85rem .15rem .75rem; scrollbar-width:thin; }
  .tabs button, .filters button, .entry-action, .status-toggle, .entry-main, .add-button, .editor-actions button, .save-state button { appearance:none; border:0; font:inherit; }
  .tabs button { display:flex; flex:0 0 auto; align-items:center; gap:.38rem; padding:.4rem .58rem; border-radius:.5rem; background:transparent; color:var(--muted); cursor:pointer; font-size:.76rem; font-weight:650; }
  .tabs button:hover, .tabs button.active { background:var(--soft); color:var(--accent); }
  .tabs small { color:inherit; font-size:.66rem; font-variant-numeric:tabular-nums; opacity:.82; }
  .category { overflow:hidden; border:1px solid var(--line); border-radius:.8rem; background:var(--paper); box-shadow:0 1px 1px color-mix(in srgb, var(--ink) 4%, transparent); }
  .category-header { display:flex; align-items:start; justify-content:space-between; gap:1rem; padding:1rem 1rem .75rem; }
  .category-header h2 { font-size:1rem; letter-spacing:-.025em; }
  .category-header p { max-width:36rem; margin-top:.35rem; color:var(--muted); font-size:.76rem; line-height:1.5; white-space:pre-line; }
  .add-button { display:inline-flex; align-items:center; gap:.28rem; flex:0 0 auto; padding:.34rem .48rem; border:1px solid var(--line); border-radius:.48rem; background:var(--paper); color:var(--muted); cursor:pointer; font-size:.72rem; font-weight:680; }
  .add-button:hover { border-color:var(--accent); color:var(--accent); }
  .toolbar { display:flex; align-items:center; justify-content:space-between; gap:.7rem; min-height:2.55rem; padding:.42rem .75rem; border-top:1px solid var(--line); border-bottom:1px solid var(--line); background:color-mix(in srgb, var(--paper) 93%, var(--accent)); }
  .filters { display:flex; gap:.15rem; }
  .filters button { padding:.24rem .42rem; border-radius:.35rem; background:transparent; color:var(--muted); cursor:pointer; font-size:.68rem; font-weight:670; }
  .filters button:hover, .filters button.active { background:var(--paper); color:var(--ink); box-shadow:0 1px 2px color-mix(in srgb, var(--ink) 9%, transparent); }
  .save-state { display:inline-flex; align-items:center; gap:.32rem; color:var(--muted); font-size:.67rem; white-space:nowrap; }
  .save-state.saving { color:var(--accent); } .save-state.error { color:#bd4b4b; }
  .save-state button { display:grid; place-items:center; padding:.12rem; background:transparent; color:inherit; cursor:pointer; }
  .entries { margin:0; padding:0; list-style:none; } .entries > li + li { border-top:1px solid color-mix(in srgb, var(--line) 78%, transparent); }
  .entry-row { display:flex; align-items:stretch; min-height:2.75rem; }
  .status-toggle { display:grid; place-items:center; flex:0 0 2.65rem; background:transparent; color:var(--muted); cursor:pointer; } .status-toggle:hover { color:var(--success); }
  .entry-main { display:flex; align-items:center; gap:.45rem; min-width:0; flex:1; padding:.55rem .25rem .55rem 0; background:transparent; color:inherit; cursor:default; text-align:left; }
  .entry-main.clickable { cursor:pointer; } .expanded .entry-main, .entry-main:hover { background:color-mix(in srgb, var(--soft) 60%, transparent); }
  .entry-title { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:.82rem; font-weight:545; line-height:1.35; } .entry-title.complete { color:var(--muted); text-decoration:line-through; text-decoration-thickness:1px; }
  :global(.chevron) { flex:0 0 auto; margin-left:auto; color:var(--muted); transition:transform 150ms ease; } :global(.chevron.open) { transform:rotate(180deg); }
  .entry-action { display:grid; place-items:center; flex:0 0 2.3rem; border-left:1px solid transparent; background:transparent; color:var(--muted); cursor:pointer; }
  .entry-action:hover { border-left-color:var(--line); background:var(--soft); color:var(--accent); }
  :global(.icon), :global(.status-icon), :global(.reference-icon), :global(.chevron) { width:.94rem; height:.94rem; } :global(.status-done) { color:var(--success); }
  .notes { display:grid; gap:.46rem; padding:0 1rem .85rem 2.65rem; color:var(--muted); font-size:.76rem; line-height:1.6; }
  .notes p { white-space:pre-line; } .notes a { display:inline-flex; align-items:center; gap:.35rem; width:fit-content; color:var(--accent); font-weight:650; text-decoration:none; } .notes a:hover { text-decoration:underline; text-underline-offset:.16em; }
  .item-editor { display:grid; gap:.65rem; padding:.85rem 1rem 1rem; border-top:1px solid var(--line); background:color-mix(in srgb, var(--accent) 4%, var(--paper)); }
  .item-editor label { display:grid; gap:.28rem; color:var(--muted); font-size:.68rem; font-weight:700; } .item-editor em { font-style:normal; font-weight:500; }
  .item-editor input, .item-editor textarea { width:100%; border:1px solid var(--line); border-radius:.42rem; background:var(--paper); color:var(--ink); font:inherit; font-size:.78rem; line-height:1.45; }
  .item-editor input { height:2.25rem; padding:.4rem .55rem; } .item-editor textarea { resize:vertical; padding:.45rem .55rem; }
  .item-editor input:focus, .item-editor textarea:focus { outline:2px solid color-mix(in srgb, var(--accent) 45%, transparent); outline-offset:1px; border-color:var(--accent); }
  .editor-actions { display:grid; grid-template-columns:auto 1fr auto auto; gap:.38rem; margin-top:.1rem; } .editor-actions button { padding:.38rem .55rem; border-radius:.4rem; cursor:pointer; font-size:.7rem; font-weight:700; }
  .quiet-button { background:transparent; color:var(--muted); } .quiet-button:hover { background:var(--paper); } .save-button { background:var(--accent); color:white; } .delete-button { background:transparent; color:#bd4b4b; } .delete-button:hover { background:#bd4b4b14; }
  .empty-state, .loading-state { padding:1.3rem 1rem; color:var(--muted); font-size:.78rem; text-align:center; }
  button:focus-visible, a:focus-visible { outline:2px solid var(--accent); outline-offset:-2px; }
  @media (max-width:31rem) { .consume-list { padding-inline:.65rem; } .entry-action { flex-basis:2.1rem; } .category-header { padding-inline:.8rem; } .notes { padding-left:2.35rem; } }
  @media (prefers-reduced-motion:reduce) { :global(.chevron) { transition:none; } }
</style>
