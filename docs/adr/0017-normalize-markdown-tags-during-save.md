# Normalize Markdown tags during Save

Koalablog keeps Markdown Source as the editable truth and treats Tag Reconciliation as an intentional Save-time Source normalization: Effective Tags are written into leading frontmatter before the canonical Source is stored and its Source Hash is calculated. Every write adapter must return or adopt that canonical Source, while the existing `markdown.tags` text column remains a rebuildable derived index rather than an independently editable field; this avoids two competing tag authorities without requiring a normalized tag table in this phase.
