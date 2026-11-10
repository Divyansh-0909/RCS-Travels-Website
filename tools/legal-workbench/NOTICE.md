# Provenance and limits

This is an RCS Travels local tool package. It is not an Anthropic product,
the Claude legal-artifact gallery, a law database, or a legal certification.

Unmodified source references in `references/anthropic/` were downloaded from
`anthropics/claude-for-legal` at commit
`4a6c651889c97cc9140580363c73e0eb17379c2b` on 1 November 2026:

- `policy-redraft.md`: `regulatory-legal/skills/policy-redraft/SKILL.md`.
- `gap-surfacer.md`: `regulatory-legal/skills/gap-surfacer/SKILL.md`.
- `privacy-profile.md`: `privacy-legal/CLAUDE.md`.
- `LICENSE.txt`: upstream Apache License 2.0, retained in full.

Source: https://github.com/anthropics/claude-for-legal/tree/4a6c651889c97cc9140580363c73e0eb17379c2b

The India-specific skill and deterministic tools are new RCS implementation.
They adapt the source-attribution, policy comparison, practice-profile and gap
tracking approach; Claude-specific integrations have not been ported.

The requested REA project was inspected as a packaging/runtime reference:
https://github.com/morluto/rea . Its `.codex-plugin/plugin.json`,
`.codex-plugin/mcp.json` and launcher illustrate a local Node process packaged
with agent instructions. No REA code or binary is bundled or required.
Reverse engineering is unnecessary because the relevant workflows are public.
