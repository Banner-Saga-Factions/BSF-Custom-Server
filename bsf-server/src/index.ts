import http from "http";
import app from "./app";

process.on("unhandledRejection", (reason) => {
    console.error("[FATAL] unhandledRejection:", reason);
});
process.on("uncaughtException", (err) => {
    console.error("[FATAL] uncaughtException:", err);
});

const nodeEnv = process.env.NODE_ENV ?? "(unset)";
console.log(`[BOOT] NODE_ENV=${nodeEnv}`);
if (process.env.NODE_ENV !== "production") {
    console.warn(
        "[BOOT] WARNING: debug routes are ENABLED " +
        "(NODE_ENV is not 'production'). Do not expose this server to the internet."
    );
}

http.createServer(app).listen(8082, () => {
    console.log("Express server listening on port " + 8082);
});
