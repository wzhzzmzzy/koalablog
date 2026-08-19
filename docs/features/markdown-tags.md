# Markdown Tags

Markdown Files support two tag locations:

- leading YAML frontmatter: `tags: ["existing", "project"]`;
- body syntax: `#project`.

Frontmatter accepts a string array, a YAML block string sequence, one string, or the legacy comma-separated string. Effective Tags preserve frontmatter order, then append body tags in first-seen order with exact case-sensitive de-duplication.

Saving reconciles body tags into frontmatter. A frontmatter-only tag is retained even if it does not occur in the body. To intentionally remove a tag, remove it from both frontmatter and the body before Save. Invalid, duplicate, or unsupported frontmatter remains byte-preserved; Save succeeds and the Editor shows a non-blocking warning.

The Markdown Editor suggests existing body-representable tags after a legal `#`. Empty input shows frequently used and recently updated tags; typed input ranks case-insensitive prefix before substring, then File count, recency, and label. Tags containing whitespace or `#` remain valid Effective Tags but are not suggested because body syntax cannot represent them faithfully.

Public tag filtering uses exact tag identity: `java` does not match `javascript`. Existing CSV stored rows and new JSON stored rows remain readable during gradual migration.
