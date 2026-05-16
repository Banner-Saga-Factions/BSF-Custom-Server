import http from "http";
import app from "./app";

process.on("unhandledRejection", (reason) => {
    console.error("[FATAL] unhandledRejection:", reason);
});
process.on("uncaughtException", (err) => {
    console.error("[FATAL] uncaughtException:", err);
});

http.createServer(app).listen(8082, () => {
    console.log("Express server listening on port " + 8082);
});
