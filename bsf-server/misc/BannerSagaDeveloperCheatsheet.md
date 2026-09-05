**Markdown** content of the **Banner Saga Developer Cheatsheet** pdf.

---

# The Banner Saga Developer Cheatsheet

## Log Files
[cite_start]The log files record play sessions and are useful for debugging[cite: 35]. [cite_start]Each time the game is launched, the play session is recorded as `A-0.log`[cite: 36]. Consecutive launches rename `A-0.log` to `A-1.log`, and so forth; [cite_start]0 is always the newest[cite: 37, 38]. [cite_start]The game keeps the current log and the last four sessions (5 total)[cite: 39].

### Log File Locations
| OS | Path |
| :--- | :--- |
| **Mac OS X** | [cite_start]`~/Library/Application Support/TheBannerSaga/Local Store/gamelog/` [cite: 19] |
| **Windows** | [cite_start]`%HOMEPATH%\AppData\Roaming\TheBannerSaga\Local Store\gamelog\` [cite: 22] |

### Factions
| **Windows** | 

`%HOMEPATH%\AppData\Roaming\TheBannerSagaFactions\Local Store\logs

[cite_start]*For Banner Saga 3, replace `TheBannerSaga` with `TheBannerSaga3`[cite: 26].*

---

## Save Games
[cite_start]Games are saved in a location similar to the log files[cite: 41]. [cite_start]Each save is a single `.json` file[cite: 48]. [cite_start]In the first game, they are paired with a `.png` screenshot[cite: 48].

### Save Game Locations
| OS | Path |
| :--- | :--- |
| **Mac OS X** | [cite_start]`~/Library/Application Support/TheBannerSaga/Local Store/save/saga1/` [cite: 42] |
| **Windows** | [cite_start]`%HOMEPATH%\AppData\Roaming\TheBannerSaga\Local Store\save\saga1\` [cite: 45] |

---

## Console
[cite_start]At any time during gameplay, you can access the in-game console via the console hotkey **CTRL + SHIFT + ~**[cite: 60]. 

* [cite_start]**Visuals:** Errors are colored red[cite: 106].
* [cite_start]**Developer Mode:** Many commands require the game to be launched with the `developer` command line argument[cite: 111].
* [cite_start]**Syntax:** A word in angle brackets `<required>` is a required argument; square brackets `[optional]` indicate an optional argument[cite: 112, 113].

### General Console Commands
| Command | Description |
| :--- | :--- |
| `?` | [cite_start]List all commands [cite: 114] |
| `saga vars [pattern]` | [cite_start]List saga variables (use optional pattern filter) [cite: 114] |
| `saga set <var> <value>` | [cite_start]Set a saga variable [cite: 114] |
| `happenings saga` | [cite_start]List all active happenings [cite: 114] |
| `saga info` | [cite_start]Get info on current scene, convo, etc. (copies to clipboard) [cite: 114] |
| `items` | [cite_start]Display list of all available items [cite: 114] |
| `items_unlock` | [cite_start]Remove the rank restriction on equipping items [cite: 114] |
| `battle buffstr` | [cite_start]Give everyone in your party 100 STR [cite: 114] |
| `battle buffarm` | [cite_start]Give everyone in your party 100 ARM [cite: 114] |
| `fsm state battle ai` | [cite_start]Toggle Battle AI off, allowing you to control the AI [cite: 114] |

---

## Command Line Options

> **This table is for the single-player Banner Saga 1/2/3 games, not Factions.** The Factions client
> reads only `--flag` and `--flag value`, so none of the bare-word or `key=value` forms below do
> anything in it — and it never says so, because it reports no word it failed to recognise. Two of
> them, `quickload` and `fullscreen=false`, were copied from this table into our own Factions launch
> commands and did nothing there for years. See
> [`Codebase-Review-Findings-2026-05-07.md`](./Codebase-Review-Findings-2026-05-07.md), which already
> noted most of this cheatsheet is not about Factions, and
> [`docs/Development.md`](../docs/Development.md) → *Which screen a launch command lands on*.

[cite_start]Set these via Steam properties **"SET LAUNCH OPTIONS..."**[cite: 126].

| Option | Function |
| :--- | :--- |
| `developer` | [cite_start]Gain access to developer hotkeys and commands [cite: 127] |
| `debug` | [cite_start]Log much more information for debugging [cite: 127] |
| `sound=false` | [cite_start]Disable all sound and music [cite: 127] |
| `fullscreen=false` | [cite_start]Run in windowed mode [cite: 127] |
| `quickload` | [cite_start]Skips fade-ins, pan-ins, etc. to load scenes quicker [cite: 127] |
| `load=save[:profile]` | [cite_start]Load a specific save file (e.g., `load=resume:4`) [cite: 127] |
| `vars=allow_rewards_all:1` | [cite_start]Unlocks all DLC/Bonus rewards [cite: 128] |

---

## Keyboard Hotkeys
[cite_start]*(Note: On Mac, replace CTRL with Command[cite: 161]. [cite_start]Keys in **RED** in the source are Developer Mode only[cite: 161].)*

### Global & Navigation
| Key | Action |
| :--- | :--- |
| `ESC` | [cite_start]Toggle Options Menu [cite: 162] |
| **CTRL + SHIFT + F8** | [cite_start]Quicksave [cite: 162] |
| **CTRL + SHIFT + F9** | [cite_start]Quickload (most recent checkpoint or quicksave) [cite: 162] |
| **CTRL + SHIFT + ~** | [cite_start]Toggle the game console [cite: 162] |
| **CTRL + SHIFT + P** | [cite_start]Toggle Performance HUD [cite: 162] |

### Battle
| Key | Action |
| :--- | :--- |
| `1` / `2` / `3` | [cite_start]Move / Ability / Attack [cite: 162] |
| `4` | [cite_start]Rest / End Turn (2 taps confirms) [cite: 162] |
| `TAB` | [cite_start]Toggle Stat Banners [cite: 162] |
| **CTRL + SHIFT + J** | [cite_start]Auto-Kill selected unit [cite: 163] |
| **CTRL + SHIFT + K** | [cite_start]Auto-Kill all enemy units [cite: 163] |
| **CTRL + SHIFT + L** | [cite_start]Surrender battle (Lose) [cite: 163] |

### Travel & Convo
| Key | Action |
| :--- | :--- |
| **CTRL + SHIFT + SPACE**| [cite_start]Toggle Pause [cite: 163] |
| **CTRL + SHIFT + ]** | [cite_start]Jump to next location [cite: 163] |
| `1-6` | [cite_start]Choose numbered conversation option [cite: 163] |

---

## Cheat Suppression
[cite_start]The session cheat flag is triggered by certain actions[cite: 174]:
* [cite_start]**Console Commands:** Any marked `<< CHEAT >>`[cite: 175].
* [cite_start]**Hotkeys:** Using Fast-Forward (**CTRL + SHIFT + ]**), Killall (**CTRL + SHIFT + K**), or Kill target (**CTRL + SHIFT + J**)[cite: 177, 178, 179].
* [cite_start]**Command Line Flags:** Enabling flags like `fastall` or `ai=false`[cite: 182, 183, 186].

[cite_start]**Consequences:** Once triggered, achievements, leaderboards, and analytics are disabled for the rest of the game session[cite: 190].