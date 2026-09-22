import http from "http";
import app from "./app";
import { countOnlinePlayers } from "./services/auth/auth";
import { startActivitySampler } from "./services/activityStats";

// These two must stay BELOW the `import app` above. app.ts throws while it is being
// imported when the signing key is missing or the proxy setting has a value it does not
// recognise, and that throw is meant to stop the server dead. Registered first, this
// handler would catch it and log it WITHOUT exiting -- the server would come up
// half-built and quiet, which is the invisible wrong state the throw exists to prevent.
process.on("unhandledRejection", (reason) => {
    console.error("[FATAL] unhandledRejection:", reason);
});
process.on("uncaughtException", (err) => {
    console.error("[FATAL] uncaughtException:", err);
});

const nodeEnv = process.env.NODE_ENV ?? "(unset)";
// #284: read back out of Express rather than re-reading the setting, so this says what
// the server believes rather than what we meant. `1` means one proxy of ours in front
// and the sign-in cap counts each player; `false` means it counts whoever connects,
// which behind a proxy is the proxy, and then everybody shares one cap.
console.log(`[BOOT] NODE_ENV=${nodeEnv} trust_proxy=${app.get("trust proxy")}`);
if (process.env.NODE_ENV !== "production") {
    console.warn(
        "[BOOT] WARNING: debug routes are ENABLED " +
        "(NODE_ENV is not 'production'). Do not expose this server to the internet."
    );
}

http.createServer(app).listen(8082, () => {
    console.log("Express server listening on port " + 8082);
    // #267: note how many players are online, once a minute. Started here rather than when its
    // module loads, so importing the app -- as every route test does -- starts no sampler.
    startActivitySampler(countOnlinePlayers);
});
