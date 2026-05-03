import { Router } from "express";
import { resolve } from "node:path";
import { readFileSync, statSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";

export const DownloadRouter = Router();

// M-7: pre-compute checksum at module load — file is static, no need to hash on every request
const FACTIONS_PATH = resolve("./data/factions.tar.gz");
let _factionsChecksum: string | null = null;
let _factionsSize: number = 0;
if (existsSync(FACTIONS_PATH)) {
    const buf = readFileSync(FACTIONS_PATH);
    _factionsChecksum = createHash("md5").update(buf).digest("hex");
    _factionsSize = buf.length;
}

DownloadRouter.get("/", (req, res) => {
    if (!_factionsSize) { res.sendStatus(404); return; }
    res.sendFile(FACTIONS_PATH, { headers: { "Content-Length": _factionsSize } });
});

DownloadRouter.get("/checksum", (req, res) => {
    if (!_factionsChecksum) { res.sendStatus(404); return; }
    res.send(_factionsChecksum);
});
