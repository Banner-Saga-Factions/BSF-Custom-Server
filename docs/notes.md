# Other Notes

This is a document of other random, possibly-useful, development notes.

## Custom Dev Console Functions

It is possible to add custom functions to the developer console in game to run custom functions, such as logging specific information or doing anything really. 
Steps:
1. Open the game client in a [flash decompiler](../README.md#data-sources) and navigate to `scripts/game/cfg/GameConfig`. 

Note: On line 906 there's a function `addShellCmds` which registers developer shell console commands in the format:
```Actionscript
this.shell.add("COMMAND_NAME", FUNCTION_TO_CALL);
```
2. Add your function below, with the other console commands (or where ever you want I guess...)
3. Add your new function as a command to `addShellCmds` in the format documented above.
 
This should now work when you enter the command to the developer console in game:

[<img src="https://user-images.githubusercontent.com/49878076/202923734-8ff66dff-1329-4df6-84b4-3666d989391d.png" width="600" />](https://user-images.githubusercontent.com/49878076/202923734-8ff66dff-1329-4df6-84b4-3666d989391d.png)

[<img src="https://user-images.githubusercontent.com/49878076/202923602-ca9a4adc-33ec-468b-a8ca-f9d5c6ffd1b2.png" width="1200" />](https://user-images.githubusercontent.com/49878076/202923602-ca9a4adc-33ec-468b-a8ca-f9d5c6ffd1b2.png)
