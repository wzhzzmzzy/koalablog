---
status: accepted
---

# Require explicit Svelte Artifact deployment

Saving a Svelte File persists Source but never deploys its Render Artifact. The last successfully Deployed Render Artifact remains public while newer saved Svelte Source has Deployment Drift, and Deploy accepts only the current saved Source; a dirty Edit Buffer must be saved first. An exact Source reversion that restores the deployed Source Hash clears the drift without another Deploy, while a failed or superseded Deploy leaves the prior Artifact online. This is an executable-artifact deployment rule only, not a draft or publication lifecycle for Markdown or Files generally.

This supersedes ADR-0002 only where ADR-0002 makes a Render Artifact unavailable as soon as saved Source changes. Artifact derivation, client-side compilation, one-Artifact storage, Source independence, access control, and explicit failure instead of Source exposure remain unchanged.

Renderer Replacement follows ADR-0016. Replacing a Svelte File with Markdown moves the Svelte predecessor and its Render Artifact to the recycle bin, where lifecycle access checks keep the Artifact unavailable; the new Markdown File inherits no Artifact. Replacing Markdown with Svelte likewise creates a new File without an Artifact and therefore requires an explicit Deploy.

Deploy continues replacing the single stored Artifact row. The replacement is authoritative for subsequent Page requests, but an already-returned Page is not guaranteed to finish loading resources from the replaced Artifact. Retaining immutable Artifact versions or guaranteeing an uninterrupted old-resource window is outside this decision.
