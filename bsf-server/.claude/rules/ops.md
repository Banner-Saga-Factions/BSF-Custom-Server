---
paths:
  - "deploy/**"
  - "scripts/**"
  - "docs/Deployment.md"
  - "Dockerfile"
  - "docker-compose.yml"
  - "*.ps1"
  - "*.bat"
---

# Traps when deploying, or writing a command someone else will paste

> Deep protocol, security and persistence traps live in [`gotchas.md`](gotchas.md), which is read only for work under `src/` and `test/`. This file owns the operational ones, and it holds **the instruction only** — the evidence for each is in the guide it links to. Add a one-line title to the *Deep traps* index in [`docs/FAQ.md`](../../docs/FAQ.md) when you add one here.

- **Say which shell a command block expects, and quote every value that contains a comma.** A block written for one shell and pasted into the other fails in a way that accuses the wrong thing. PowerShell reads a bare comma as its list-building operator, so a comma-joined value is taken apart and handed over as one invalid item — and the error blames your list, which was correct. A trailing `\` joins two lines in Bash and does nothing in PowerShell, so a multi-line Linux-style command runs its first line alone. Not one of the error messages mentions quoting. Why, and the three commands this has already bitten: [`docs/Deployment.md`](../../docs/Deployment.md#know-which-shell-you-are-in) → *Know which shell you are in*.
- **Name the account, project and zone on every cloud command.** No command in the deployment guide names a project — each one uses whichever your tools are currently pointed at. With more than one, a command meant for a test machine can quietly succeed against the live one. The other mistakes on this page fail loudly; this one does not. [`docs/Deployment.md`](../../docs/Deployment.md#know-which-project-you-are-aimed-at) → *Know which project you are aimed at*.
- **Two game clients on one machine need `--versus_start --versus_countdown 0`.** Audio only starts for the first client on a machine; the second runs silent. Without these flags the client that got audio hangs at the battle loading screen for ever and never tells the server it is ready. Not optional for a local test, and not a problem between two real machines. [`docs/Development.md`](../../docs/Development.md#two-player-local-test-same-machine) → *Two-Player Local Test*.
