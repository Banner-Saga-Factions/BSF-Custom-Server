# Other Notes

This is a document of other random, possibly-useful, development notes.

## Custom Dev Console Functions

It is possible to add custom functions to the developer console in game to run custom functions, such as logging specific information or doing anything really. This can be done by opening the game client in a [flash decompiler](../README.md#data-sources) and navigating to `scripts/game/cfg/GameConfig`. On line 906 there's a function `addShellCmds` which registers developer shell console commands in the format:
```Actionscript
this.shell.add("COMMAND_NAME", FUNCTION_TO_CALL);
```
Add your function below, with the other console commands (or where ever you want I guess...) then add your new function as a command to `addShellCmds` in the format documented above. This should now work when you enter the command to the developer console in game.