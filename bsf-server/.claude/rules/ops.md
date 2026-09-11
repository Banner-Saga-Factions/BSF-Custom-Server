---
paths:
  - "deploy/**"
  - "scripts/**"
  - "docs/Deployment.md"
  - "Dockerfile"
  - "docker-compose.yml"
  - "*.ps1"
  - "*.bat"
  - "*.sh"
---

# Traps when deploying, or writing a command someone else will paste

> Code-level traps live in [`gotchas.md`](gotchas.md). Keep the instruction here and the reasoning in the guide each entry links to, and add a one-line title to the *Deep traps* index in [`docs/FAQ.md`](../../docs/FAQ.md) when you add one.

- **Say which shell a command block expects, and quote every value that contains a comma.** Pasted into the other shell it fails in a way that accuses the wrong thing, and no error message mentions quoting. A trailing `\` also joins two lines in Bash and does nothing in PowerShell. [`docs/Deployment.md`](../../docs/Deployment.md#know-which-shell-you-are-in) → *Know which shell you are in*.
- **Name the account, project and zone on any cloud command that changes something.** A command that names none of them acts on whichever project your tools are currently pointed at, so with more than one, a command meant for a test machine can quietly succeed against the live one. This failure does not announce itself. [`docs/Deployment.md`](../../docs/Deployment.md#know-which-project-you-are-aimed-at) → *Know which project you are aimed at*.
- **Two game clients on one machine need `--versus_start --versus_countdown 0`.** Audio starts only for the first, and without these flags the one that got it hangs at the battle loading screen for ever without telling the server it is ready. Two separate machines do not appear to hit this. [`docs/Development.md`](../../docs/Development.md#two-player-local-test-same-machine) → *Two-Player Local Test*.
