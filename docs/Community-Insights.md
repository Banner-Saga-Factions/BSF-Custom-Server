# Community Insights: factions-project Discord (Feb–Mar 2022)

> Extracted from `misc/discord_factions-project_chat_export.txt` — 200 messages, Feb 18 – Mar 13 2022.
> Participants: eltaino\_, pieloaf, atmakuja, aleonymous, tirean, coniglio, erikbergman, stoicmom, khatie.

---

## Original Server Tech Stack

erikbergman provided the confirmed original Stoic server stack (Feb 19):

| Layer | Technology |
|---|---|
| Front end | ActionScript, C++ |
| Back end | Java |
| OS | Linux |
| Database | MySQL |
| Message broker | **RabbitMQ** |

**RabbitMQ is not implemented in the current Node.js server.** The current server uses HTTP long-polling instead. Understanding what RabbitMQ was used for in the original (likely pub/sub for real-time events and matchmaking notifications) may inform future architecture decisions if scalability becomes a concern.

---

## Authentication Architecture

### John Digerness (Stoic CEO) — fireside chat, ~18:55

eltaino\_ transcribed key quotes from a Stoic fireside stream:

> "If I remember correctly there's a way to bypass that authentication in the client. You need something custom to authenticate. It can authenticate against our own backend. It also can authenticate against BBB? BBB is the bulletin board system we use for Stoic. It has multiple ways to authenticate."

**VBB (Virtual Bulletin Board)** was Stoic's own auth system, separate from Steam. The client has a fallback path for VBB credentials in addition to Steam.

### pieloaf's findings (Feb 25)

pieloaf had already reverse-engineered the Steam bypass at the time of this chat:

> "If steam couldn't be initialised the game displays a dialog that has an exit function as the callback on the ok button. Credentials is a JSON formatted object with login credentials that is sent to the server, so in that catch for steam login, a different/independent login option could be triggered."

> "I removed the dialog and hardcoded a placeholder vbb login which got rejected by the server, but it didn't rely on steam to log in and emulating a valid server response for the vbb login worked in getting to the main menu as a VBB user rather than using steam."

> "anything could be added to the credentials object (such as login details for a custom login system)"

**Implication:** The client-side Steam bypass is straightforward — patch the dialog callback and inject any JSON credentials object. This is already solved in the current server via the `--steam true --steam_id <n>` launch args and the `POST /login/:httpVersion` endpoint that accepts any numeric ID. Discord OAuth (`docs/Plan-Enable-Mobile-Windows-Crossplay.md`) is the next evolution of this.

---

## Client Codebase

### Starling framework (pieloaf, Feb 24)

> "I think there was reference made to the Starling framework in the code for bsf"
> https://gamua.com/starling/

Starling is an ActionScript game engine built on Stage3D. If BSF's client code references it, Starling's API docs may help understand animation and rendering code during reverse engineering.

### Client-side sync validation (aleonymous, Feb 20–21)

aleonymous tried to mod an ability's damage and observed:

> "I saw the modded damage in my client, for a brief second, but then the game crashed or froze... probably does a cross-check between clients (e.g. requests an acknowledgement from 'receiving' player) before it registers the damage in the server."

This independently confirms the DJB hash sync mechanism: each client computes a hash of game state and the server relays it to the opponent. A mismatch causes desync. The current `POST /battle/sync` implementation correctly relays both clients' hashes without server-side validation.

### Game log format (aleonymous, Feb 20)

The game's own log files record only:
- Unit movements
- Kills (who killed whom)

They do NOT record attacks, breaks, abilities used, or horn usage. aleonymous suggested an "extended/debug mode" for logs. The current server logs all battle events to stdout with `[BATTLE]` prefixes — this is the equivalent.

### User ID format (aleonymous, Feb 21)

aleonymous noted user IDs in game logs as 5–6 digit numbers (e.g., `77284`, `343275`). These are the **original Stoic database account IDs** — small sequential integers, not Steam IDs. This is exactly what the current `account_id` (32-bit, derived by subtracting `STEAM_ID_BASE`) is designed to replicate. The current implementation correctly matches the format the original server used.

---

## Adobe AIR / HARMAN SDK

coniglio surfaced this on Mar 12:

> "Adobe passed support for [AIR] to HARMAN, a subsidiary of Samsung. HARMAN turned around and released an SDK."
> https://airsdk.harman.com/

Key facts confirmed by coniglio at the time:
- **HARMAN AIR SDK is free** for non-commercial use (threshold: < $50k revenue)
- Was being actively maintained (last update March 7, 2022 at time of discussion)
- GitHub: https://github.com/airsdk

This is the path for rebuilding/recompiling the mobile client. The crossplay plan (`docs/Plan-Enable-Mobile-Windows-Crossplay.md`) already documents HARMAN AIR 50+ as the required SDK for iOS 16+ and Android API 33+ targets.

> "John said there was trouble with Adobe Air. Basically Adobe wanted to kill it, but wouldn't release the source code." — coniglio

This explains the platform risk that led Stoic to abandon the game — they couldn't migrate away from AIR without owning it. HARMAN's stewardship resolves this.

---

## Game Design: Priorities Before New Features

tirean published a brainstorm document (pinned, Mar 10) — uploaded to GitHub at the time. Core discussion points:

### New player retention problem

The original Factions had a structural issue: new players must play against other new players to earn enough renown to rank up. If the player base isn't growing, new players can't find opponents at their level and get stuck. This is **the primary retention problem** the revival needs to solve before anything else.

### Puncture nerf (tirean + coniglio)

> "Puncture nerf and removal of Willpower on rest are 2 changes that I think would improve Factions greatly."

Tirean's reasoning: Factions becomes very passive at high levels, and Puncture (removes enemy armor permanently) is a key contributor to that passivity. Encouraging aggressive play would make the game more exciting.

### Willpower on rest

Removing WP regeneration from resting would punish passive/stalling play. This is a significant balance change — tirean said it needs testing.

### Randomness philosophy (coniglio)

> "There's only two points of randomness in the game as it was left last. The first was the Thrasher's Bloody Flail, which divides hits between armor and health. However, the sum of that damage is consistent. The other point is the reduced chance of hitting a high-armor foe when your strength is low. In that sense, randomness exists as punishment."

New features should respect this philosophy: deterministic outcomes, randomness only as punishment for poor play.

---

## Feature Backlog (Community Requests)

### Aleonymous's priority roadmap (pinned, Mar 10)

```
(a) Make the game run off-Steam — TOP PRIORITY
  (a1) Local co-op on the same client
  (a2) P2P online PvP (fallback if server approach fails)
  (a3) Server matchmaking/ranking — just like original but off-Steam
  (a4) User registration to prevent bots and bad actors

(b) Fix existing gameplay issues
  (b1) Renown economy, tutorials, ability/stat nerfs/buffs, competitive balance
  (b2) Alternative modes: survival turn queue, zero-timer, removed unit restrictions

(c) Big new features (after (a) and (b) are solid)
  (c1) vs-AI mode
  (c2) Training scenarios (like BS3 Eternal Arena)
```

Status as of 2026: **(a3) is complete** — the current server handles off-Steam matchmaking with Steam IDs. **(a1)** is possible via the two-client-in-one-window launch arg (`--steam_id 123456,293850`). **(a2)** and **(a4)** are not implemented. **(b) and (c)** are future work.

### Existing 4th subclasses with art already done (aleonymous)

> "existing Factions classes need their fourth sub-class: We got Grudgewielder and Eagle-Eye 'ready' (with art and all). We need to implement one for Warriors (maybe Ubin's from BS3?) and one for Bangers (maybe Folka's?)."

**Grudgewielder** and **Eagle-Eye** have existing art assets from Stoic. They were planned as 4th subclasses for two of the existing classes but were never shipped in Factions. If the source code or assets are ever made available, these would be the lowest-effort new units to add.

Ubin (from BS3, a powerful Warrior-type) and Folka (from BS3, a Berserk-type) were suggested as candidates for Warrior and Banger 4th subclasses respectively.

### Spearman class design discussion (tirean + coniglio, Mar 10)

A new Spearman class was the main design brainstorm. Key design notes:

- **Range**: 2 (can strike from behind Raiders)
- **Art**: Reuse existing sprites — Tryggvi, Ludin, Bak, Kragsman Poleman (4 looks available)
- **Stats**: Minimum 7–8 armor to avoid being pure Archer bait; exact values need playtesting
- **Skills**: Impale + Pigsticker already in game; need a 3rd skill designed
- **Pigsticker problem**: Random damage — goes against BSF's determinism philosophy. Should be reworked
- **Embolden passive**: +1 WP for Spearman and adjacent allies per kill. Possibly too strong — needs playtesting
- **Prototype**: Tirean offered to build a Tabletop Simulator prototype for rule validation before coding

### Hotseat mode (tirean)

> "My dream feature would be a hotseat mode where I can make 2 teams and make them fight. So I could experiment with counters to teams."

This would be a solo training/theory-crafting tool — set up both sides and watch or play both.

### AI vs AI mode (eltaino\_)

eltaino\_ referenced the Final Fantasy Tactics modding community's AI vs AI battles as a popular spectator mode. Low barrier — doesn't require a second human player.

### Extended game logging (aleonymous)

> "It would be handy to have an 'extended/debug mode' on these logs, recording as much info as possible. It would help understand how it all plays out, step-by-step."

The current server already logs `[BATTLE]` events to stdout. A structured battle event log written to disk (JSON lines or CSV) would satisfy this — useful for game design analysis.

---

## Project Management Lessons

### erikbergman's warning (Mar 11) — most important message in the export

erikbergman had been part of two failed community-managed game projects on a Super Smash Bros fan site. Both failed for the same reason:

> "People quickly jumped aboard the 'fun' stuff such as level design and balancing. Absolutely vast forum threads where people had in-depth discussions on how to make the games as fun as possible. All of that would have been valuable if we would've ever had a working game, which never happened because in the first project, we became completely dependent on the one guy who had the time and the skill to do the backend stuff. And he gradually became less and less active until the project was silently abandoned."

His recommendation:
> "It would be a good idea to make sure that there's a minimum of two persons who are involved in each part of development, so that we don't run into a situation where one person sits on information that's completely vital for the survivability of the project."

**This is the single most important lesson from the export.** The current server is primarily one person's work. Recruiting a second developer who understands the codebase is a higher priority than new features.

### Documentation as institutional memory (aleonymous, Mar 11)

> "Documentation is super-important. It is the (passive) memory of the community. Twas why I was upset when forums were taken down."

The old Stoic forums contained years of strategy, balance discussion, and technical knowledge. When they went offline, that knowledge was lost. pieloaf had started archiving forum posts to GitHub Pages.

### Coniglio on developer engagement (Mar 12)

> "It's a difficult balancing act giving your developers the work that keeps them interested and engaged, but also produces quality work that is easy to maintain and expand upon."

> "You will always be capped in your capabilities without an artist involved."

The project has developers and game knowledge, but no dedicated artist. Any new visual content is blocked on this.

### atmakuja on process (Mar 11)

> "I don't want this to become a 'chore'... a weekly or bi-weekly chat/meeting, even just to toss ideas around."

Regular lightweight sync meetings were proposed but never formalized. The absence of structure (no sprint, no assigned tickets, no owner per area) was a risk factor from the start.

---

## Platform Considerations

Community platform poll (Mar 10, 10 responses):
- Windows: **7 votes**
- macOS: **1 vote**
- Unknown: **2 votes**

Windows is the primary platform to target. macOS support is low priority given the audience. The current server is Windows-first (`.bat` scripts, `start-server.bat`). Docker enables Linux/macOS deployment.

---

## Vassal Engine (tirean, Feb 23)

> https://vassalengine.org/ — "If all fails you could remake banner saga on here. And would be less effort than Unity and such."

Vassal is an open-source engine for digital board game adaptations. Mentioned as a last-resort fallback if the AIR client proves impossible to modify. Not pursued further.

---

## What Happened Next (Context for Future Readers)

By the time of this export the group had:
- Created a GitHub organization and feature-tracking repository
- Uploaded tirean's brainstorm document to GitHub
- Begun learning Docker
- Identified HARMAN AIR SDK as the client build path
- Not yet obtained source code from Stoic (NDA reportedly in preparation)

The current server (`BSF-Custom-Server`) is the result of pieloaf's independent reverse-engineering of the protocol via Fiddler, then eltaino\_ continuing that work. Source code from Stoic was never received (as of 2026). The authentication bypass is implemented via `--steam_id` launch args; no VBB login system was built. The server is in Node.js/TypeScript, not the original Java.

---

## Action Items Surfaced (Still Relevant in 2026)

| Item | Status | Notes |
|---|---|---|
| Second developer on critical paths | ⚠️ Open | erikbergman's warning — single-point-of-failure risk |
| User registration system | 🔴 Not done | `upsertAccount()` auto-creates on first login; no registration UI |
| Grudgewielder / Eagle-Eye 4th subclasses | 🔴 Not done | Art assets reportedly exist; need source code or JPEXS work |
| Renown economy balancing | 🔴 Not done | Current formula: WIN=20 + kills×3. Original balance untouched |
| vs-AI / training mode | 🔴 Not done | High community demand; requires AI logic |
| Structured battle event log | 🔴 Not done | Current: stdout only |
| Forum archive (Wayback Machine → GitHub) | 🔴 Not done | pieloaf started this but it wasn't completed |
| P2P fallback mode | 🔴 Not done | Listed as fallback if server approach fails |
| Tabletop Simulator prototype for balance testing | 🔴 Not done | Tirean offered to build; never materialized |

---

*Created with [Claude Code](https://claude.ai/code)*
