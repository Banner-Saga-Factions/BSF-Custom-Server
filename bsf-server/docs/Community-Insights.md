# Community Insights: the 2022 revival discussion

> **This page used to quote people by name. It no longer does.** In February and March 2022, a
> group of Factions players spent about three weeks in a private Discord channel working out
> whether the game could be brought back. Their messages were quoted here, with their handles
> attached, without anyone having been asked first. A private conversation is not a public one,
> so the quotations and the names have been removed and replaced with a summary of what was
> established. The underlying chat export is not in this repository and is not published
> anywhere.
>
> If you took part and would like your contribution credited by name, say so on
> [Discord](https://discord.gg/Jf3FNpV8gv) or
> [open an issue](https://github.com/Banner-Saga-Factions/BSF-Custom-Server/issues) — the default
> is now to credit nobody rather than to credit without asking.

---

## What the original server was built from

The group's working list of the original technology, since confirmed from other evidence — the
recorded traffic, and the 2013-era Java source Stoic later shared:

| Part | Technology |
|---|---|
| The game itself | ActionScript, C++ |
| The server | Java |
| Operating system | Linux |
| Database | MySQL |
| Passing messages around | RabbitMQ |

## Signing in without Steam

Stoic's forum software doubled as a login system, entirely separate from Steam, and the game
could authenticate against either. Stoic described this publicly while Factions was still
running. It is the single fact that made an independent revival plausible: a game hard-wired to
one identity provider would have been far harder to bring back.

Work at the time confirmed it from the game's side — the point where the game gives up on Steam
is a place another login route can be attached, and the credentials the game sends are an
open-ended structure that can carry different kinds of login detail.

## Adobe AIR, and why it mattered

Factions runs on Adobe AIR. Adobe wound the technology down without releasing it, which is part
of the bind Stoic were in. Support later passed to HARMAN, a Samsung subsidiary, which publishes
a maintained kit that is free for non-commercial use. That handover is what made rebuilding the
game program possible at all.

Stoic's own stated reason for closing Factions was narrower: a service the game depended on had
been retired, and there was neither the time nor the money to replace it.

## What the game checks for itself

During a battle, the two copies of the game cross-check what just happened, and a disagreement
stops the match. This was found by experiment — altering an ability's damage produced the changed
value briefly, then a halt.

The consequence worth keeping in mind: a single altered copy cannot quietly rewrite a battle,
because it has to convince the other side too. That is not the same as saying cheating is
impossible — two modified copies cooperating are a different case. See
[`.claude/rules/gotchas.md`](../.claude/rules/gotchas.md).

## What the community wanted

The group produced a long list of asks — off-Steam play first, then local and peer-to-peer modes,
then matchmaking and ranking, then gameplay fixes, then larger features such as a mode against
the computer and training scenarios. Several were also design proposals in their own right: a new
Spearman class, balance changes to armour-stripping and to resting, and a principle that the
game's outcomes should stay predictable, with chance appearing only as a penalty for a poor
decision.

**Where these stand is not recorded here.** The
[BSF Roadmap board](https://github.com/orgs/Banner-Saga-Factions/projects/3) is the only place
that says what is being worked on. Ideas considered and not taken up, with the reasoning, are in
[`idea-triage.md`](idea-triage.md).

## The lesson that was not about code

The most valuable contribution to the discussion was not technical. A participant who had watched
two community game projects die described the same pattern in both: enthusiasm concentrated on
the enjoyable design work while the unglamorous server work rested on one person, who gradually
went quiet, after which the project stopped. The recommendation was that at least two people
should be involved in every part of the work, so that nothing vital sits with one person.

That risk was never addressed, and it still describes this project today.

---

*Rewritten 2026-09-19 to remove quotations and names that had been published without consent.
Previously a direct extract from a private chat export.*
