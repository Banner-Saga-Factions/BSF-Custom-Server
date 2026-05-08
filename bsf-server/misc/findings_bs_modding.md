guide to setting up your modding environment and using JPEXS (FFDec) to modify Banner Saga games

Because Banner Saga and Banner Saga Factions are built on the Adobe AIR engine, modding them generally falls into two categories

1. Soft Modding Editing external `.json` files (abilities, stats, localization).
2. Hard Modding Decompiling and editing the core `.swf` files containing the ActionScript 3 (AS3) bytecode to change hardcoded mechanics, server routing, or UI logic.

---

### Phase 1 Community Insights & Soft Modding Basics

Before touching a decompiler, it is highly recommended to understand what you can do without one. Based on the community chat logs, here are the essential rules of the engine

Developer Mode is your Best Friend Activation Add `--developer` to your Steam launch options for the game.
In-Game Press `Ctrl + Shift + ~` (or `Cmd` on Mac) to open the console and type `developer`.
Testing Commands In combat, select a unit and press `Ctrl+Shift+K` (or `J`) to instantly kill them, or `H` to strip their armor. This is invaluable for testing late-game abilities quickly.
The JSON Engine Rules Abilities and items are defined in `.json` files.
Syntax Trap If you create a custom ability, remember that the `CHANGE_STAT` action reads from the `AMOUNT` variable, while `DAMAGE_STRARM` reads from the `DAMAGE` variable.
The Animation Constraint You can easily swap an ability from a Varl to a Human using JSON edits. However, if the Human 3D modelspritesheet lacks the specific animation frames for that ability, the game may visually glitch or soft-lock during the attack.

---

### Phase 2 Setting up JPEXS Free Flash Decompiler (FFDec)

To change core game logic (like server routing for a custom Factions server) or bypass hardcoded limitations, you must edit the game's SWF files.

1. Prerequisites
   Java Runtime Environment (JRE) JPEXS is a Java-based application. Make sure you have Java 8 or newer installed on your machine.
   Download JPEXS Go to the official [JPEXS GitHub Releases page](httpsgithub.comjindrapetrikjpexs-decompilerreleases) and download the latest version (usually a `.zip` or `.exe` installer).

2. Basic Configuration
   Open JPEXS.
   Go to Advanced Settings.
   Ensure ActionScript 3 is selected as the default decompilation language.
   Check Automatic deobfuscation (though Banner Saga code is generally readable, this helps if any libraries are minified).

---

### Phase 3 Extracting and Exploring the AS3 Code

1. Locate the Target SWF
   Go to your Banner Saga installation directory (e.g., `Steamsteamappscommontbs`).
   Look for the main application file. In Adobe AIR games, this is usually found in a folder like `assets` or the root directory, often named `TheBannerSaga.swf`, `factions.swf`, or simply `application.swf`.

2. Open and Navigate
   Drag and drop the `.swf` file into JPEXS.
   On the left panel, you will see a tree structure. The most important folders are
   scripts This contains the decompiled ActionScript 3 (AS3) code. This is the brain of the game.
   binaryData texts Sometimes developers hide core JSON configurations inside the SWF itself.
   images shapes The UI assets.

3. Searching for Logic
   If you want to find how the game connects to a server, use the JPEXS search bar (bottom of the screen).
   Search for terms like `http`, `URLRequest`, `socket`, or specific launch arguments like `--server`.
   To look at combat mechanics, search the `scripts` folder for classes like `Battle`, `Unit`, `Ability`, or `Damage`.

---

### Phase 4 Editing and Re-compiling Code

This is the most complex part of Flash modding. JPEXS allows you to edit code, but you have two ways to do it, and one is much safer than the other.

#### Method A Direct AS3 Editing (Easier, but buggy)

JPEXS has an experimental feature that lets you type ActionScript directly and it will try to recompile it on the fly.

1. Find the script you want to edit (e.g., `game.session.ServerConnection`).
2. Click the Edit ActionScript button at the bottom of the script view.
3. Make your changes (e.g., changing a server URL string from `stoicstudio.com` to `localhost3000`).
4. Click Save.
   Note Because this feature is experimental, it often throws syntax errors even if your code is correct, because it struggles to re-compile complex AS3 syntax.

#### Method B P-Code Editing (Harder, but reliable)

P-Code is the actual bytecode that the Flash Virtual Machine reads (similar to Assembly language).

1. Click on a line of ActionScript in the right window. Notice how the bottom window shows instructions like `PushString`, `GetProperty`, `CallPropVoid`.
2. Click Edit P-Code.
3. You can safely change variables here. For example, if you find `PushString httpsofficial-server.com`, you can edit the P-code to say `PushString http127.0.0.18080`.
4. Click Save.

#### Saving the SWF

Once you have made your changes, click the floppy disk Save icon in the top left of the JPEXS toolbar. It will overwrite the SWF. Always make a backup of the original `.swf` before saving!

---

### Phase 5 Packaging Your Mod

When you are ready to share your mod with others, you should mimic the folder structure of the base game.

1. Create a root folder named after your mod (e.g., `MyBSFMod`).
2. Inside, recreate the exact file paths of the files you altered.
   If you changed a JSON file, place it in `MyBSFModassetscommondataabilities.json`.
   If you modified the SWF, place it in `MyBSFModcore.swf`.
3. Zip the folder.
4. Instruct users to extract the Zip directly into their game directory and overwrite the existing files.
