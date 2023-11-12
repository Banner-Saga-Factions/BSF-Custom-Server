import { Router } from "express";
import { resolve } from "node:path";
import { readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";

export const DownloadRouter = Router();

DownloadRouter.get("/", (req, res) => {
    res.sendFile(resolve("./data/factions.tar.gz"), {
        headers: {
            "Content-Length": statSync("./data/factions.tar.gz").size,
        },
    });
});

DownloadRouter.get("/checksum", async (req, res) => {
    res.send(createHash("md5").update(readFileSync("./data/factions.tar.gz")).digest("hex"));
});
