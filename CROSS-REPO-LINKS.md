# Cross-repo doc links

When a Markdown link in one published repo (`bsf-server` or `bsf-client`) targets a file in the other, write it in **dual-link** form so it works locally (Ctrl+click in VS Code) **and** on github.com (where each repo is viewed in isolation, with no sibling on disk):

```
`<path>` ([local](<relative-path>) | [GitHub](https://github.com/Banner-Saga-Factions/<repo>/<blob|tree>/<branch>/<path>))
```

- **Why**: relative paths like `../../bsf-server/...` resolve under the parent BSF/ checkout but 404 on github.com — the standalone repo has no sibling.
- **`[local]`** keeps Ctrl+click navigation working in VS Code; **`[GitHub]`** is what github.com readers follow.
- **Files use `/blob/<branch>/`**; **directories use `/tree/<branch>/`**.
- **Branch is the _other_ repo's default**: `BSF-Custom-Server` → `main`, `BSF-Client` → `master`.
- If the file doesn't exist on the other side, drop the reference — don't ship a link that 404s in either context.

Example (from `bsf-client/docs/wire-protocol.md`):

```markdown
See `bsf-server/docs/protocol-cross-reference.md` ([local](./bsf-server/docs/protocol-cross-reference.md) | [GitHub](https://github.com/Banner-Saga-Factions/BSF-Custom-Server/blob/main/bsf-server/docs/protocol-cross-reference.md)).
```

Reference: BSF-Client issue #6 / PR #10 converted the existing docs to this pattern.
