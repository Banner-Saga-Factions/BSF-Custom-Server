import http from "http";
import app from "./app";

http.createServer(app).listen(8082, () => {
    console.log("Express server listening on port " + 8082);
});
