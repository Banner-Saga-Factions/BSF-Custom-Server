// Records how each test worker ends, for #358 ("Worker exited unexpectedly").
//
// Vitest reports a dead worker without its exit code, so a crash in native code, an
// out-of-memory stop and a deliberate exit all look the same. repeat-test.ps1 -Diagnose
// loads this file into every Node process of a run (through NODE_OPTIONS) and names a
// file in REPEAT_TEST_PROBE; each process appends one line per event to it.
//
// - In the main test process it wraps child_process.fork, and writes each worker's exit
//   code and signal. Windows codes worth knowing: 3221225477 (0xC0000005, memory access
//   fault in native code), 3221226505 (0xC0000409, native code stopped the
//   process on the spot), 134 (Node's own abort, including running out of memory).
// - In a worker it writes whether the worker's own "exit" event ran and, if JavaScript
//   asked to exit, the call stack that asked. A worker that dies with neither line was
//   stopped from outside JavaScript.
"use strict";
const fs = require("node:fs");

const out = process.env.REPEAT_TEST_PROBE;
if (out) {
    const write = (line) => {
        try {
            fs.appendFileSync(out, `${new Date().toISOString()} pid=${process.pid} ${line}\n`);
        } catch {
            // The probe must never change how the run behaves.
        }
    };
    const hex = (code) => (typeof code === "number" ? ` (0x${(code >>> 0).toString(16)})` : "");

    if (typeof process.send === "function") {
        write("worker started");
        const realReallyExit = process.reallyExit;
        process.reallyExit = function (code) {
            write(`worker exiting through JavaScript, code=${code}${hex(code)}\n${new Error("exit stack").stack}`);
            return realReallyExit.apply(process, arguments);
        };
        process.on("exit", (code) => write(`worker exit event, code=${code}`));
        process.on("disconnect", () => write("worker lost its channel to the main process"));
    } else {
        const childProcess = require("node:child_process");
        const { syncBuiltinESMExports } = require("node:module");
        const realFork = childProcess.fork;
        childProcess.fork = function () {
            const child = realFork.apply(this, arguments);
            write(`main started worker pid=${child.pid}`);
            child.on("exit", (code, signal) =>
                write(`main saw worker pid=${child.pid} end: code=${code}${hex(code)} signal=${signal}`)
            );
            return child;
        };
        // Vitest imports fork as an ES module; this makes that import see the wrapper.
        syncBuiltinESMExports();
    }
}
