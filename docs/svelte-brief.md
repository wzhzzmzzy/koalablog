# Svelte page brief

Every Svelte File created or updated through the Koalablog skills must include one non-empty brief in a leading HTML comment:

```svelte
<!-- @brief: 交互式桌面布线规划工具，可调整设备位置、连接关系和线材长度。 -->
<script lang="ts">
  let count = $state(0)
</script>

<button onclick={() => count += 1}>Count: {count}</button>
```

Write a short, reader-facing description of the page's purpose and useful interactions. Keep it accurate when changing the page. Use plain text, including literal Unicode and punctuation; HTML, Markdown, entities, and Svelte expressions are not interpreted. The comment must not contain `-->` in its text.

## Reading rules

- The marker is the exact, case-sensitive `@brief:` at the start of a leading HTML comment's text.
- Place it before `<script>`, `<style>`, markup, or Svelte blocks. Whitespace, a BOM, and other HTML comments may precede it. Tags inside scripts, styles, markup, or string literals are ignored.
- A brief may span several lines. Surrounding whitespace is trimmed and internal whitespace collapses to a single space.
- The first brief comment wins. Author exactly one; an empty, missing, or unclosed brief yields an empty summary.

## Consumers and persistence

The public Post and Memo lists display this brief for Svelte Files. Markdown Memo previews and Markdown Post listings keep their existing behavior.

RSS uses the brief as the Svelte item's description and as escaped text in its content paragraph. It never renders Svelte Source as Markdown or falls back to scripts, styles, or template markup. Existing Svelte Files without a brief retain their RSS title and link with no summary. Files at `/data` or below `/data/` remain excluded from RSS.

The brief is ordinary Source in the existing `content` field, so it survives editing, import/export, and sync. There is no separate database field or migration. Lists and RSS read the latest saved Source; they do not depend on a deployed Render Artifact. Changing a brief changes the Source Hash like any other Source edit. Updating the deployed page still follows the normal Build/Deploy workflow.

Skills require the brief when authoring Svelte Files, but server-side Save continues to accept blank, incomplete, and older Source. Existing database content is not automatically rewritten.
