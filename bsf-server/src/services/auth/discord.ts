import crypto from "crypto";
import express, { Request, Response } from "express";
import rateLimit from "express-rate-limit";
import {
    RESTPostOAuth2AccessTokenResult,
    RESTGetAPICurrentUserResult,
    OAuth2Routes,
    Routes,
    RouteBases,
} from "discord-api-types/rest/v10";
import { asyncRouter } from "../../http/asyncRouter";
import { config } from "dotenv";
import { isValidSnowflake } from "./accountId";
// #140: every player's stored in-game number.
import { accountNumberFor } from "../../db/accountNumbers";
// #251: the waiting sign-ins the game hands over to the browser.
import { canStartDiscord, createHandoff, markFailed, markReady, pollHandoff, EXPIRED_MESSAGE } from "./discordHandoff";

config();

// #251: the browser half of signing in through Discord without Steam. The game asks for a
// hand-off (POST /handoff), shows its code and opens our page (GET /) with the code in the
// link; the page asks the player to check the code against the game's, then sends them to
// Discord (POST /start); Discord sends them back (GET /oauth-callback), which marks the
// hand-off finished and tells them to go back to the game. Meanwhile the game keeps asking
// POST /handoff/poll, and once told "ready" signs in through the ordinary sign-in route with
// the hand-off's key as its password (auth.ts). See docs/client-contract.md for the game's side.
//
// Neither of the game's two addresses here answers 5xx: the game re-sends anything 500 or
// above every second or two, without end (docs/client-contract.md -> R10).

export const DiscordLoginRouter = asyncRouter();

// `||`, not `??`: an empty setting falls back too, rather than stopping the server at start-up.
const DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI || "http://localhost:8082/login/discord/oauth-callback";
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID ?? "1122976027140956221";
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET as string;
if (!DISCORD_CLIENT_SECRET) {
    console.warn("[DISCORD] DISCORD_CLIENT_SECRET is not set — OAuth login will fail");
}
if (process.env.NODE_ENV === "production" && !process.env.DISCORD_REDIRECT_URI) {
    console.warn("[DISCORD] DISCORD_REDIRECT_URI is not set — the game will be sent a localhost sign-in page");
}

// The address the game opens in the browser: this server's own address, which the redirect
// address already holds.
const PAGE_ORIGIN = new URL(DISCORD_REDIRECT_URI).origin;

// Issue #54: OAuth state CSRF protection. The cookie binds the callback to the same
// browser that started the flow; the map turns each state into a one-shot
// replay-protected nonce that expires after OAUTH_STATE_TTL_MS. Each state also remembers
// which hand-off's code it was started for (#251).
const OAUTH_STATE_TTL_MS = 5 * 60 * 1000;
const pendingStates = new Map<string, { expiry: number; code: string }>();

setInterval(() => {
    const now = Date.now();
    for (const [state, { expiry }] of pendingStates) {
        if (now > expiry) pendingStates.delete(state);
    }
}, 60 * 1000).unref();

// #301: the pages below need no account and store something on every visit, so they get
// the same kind of per-address cap as Steam sign-in (#56, auth.ts -> loginLimiter). Each is its
// own rateLimit() instance, so it keeps its own count: none of them uses up anyone's Steam
// sign-ins. Skipped under NODE_ENV=test for the same reason as loginLimiter.
const discordStartLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many Discord sign-in attempts. Try again in a minute." },
    skip: () => process.env.NODE_ENV === "test",
});

// #251: the game asking for a new hand-off. Same cap as the page.
const handoffLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many Discord sign-in attempts. Try again in a minute." },
    skip: () => process.env.NODE_ENV === "test",
});

// #251: the game asking whether the Discord step has finished. It asks every two seconds or
// so (30 a minute) for up to five minutes. The cap leaves room for several games behind one
// home network's address; the key cannot be guessed, so a high cap costs nothing.
const pollLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many Discord sign-in checks. Try again in a minute." },
    skip: () => process.env.NODE_ENV === "test",
});

// And a ceiling on how many states are held at once, whatever the number of addresses asking:
// at it, the start step answers 429 and stores nothing (#301).
const MAX_PENDING_STATES = 10_000;

// Read by the tests, which cannot see the map itself.
export const pendingStateCount = (): number => pendingStates.size;

export const getDiscordOAuthURL = (code: string = ""): { url: string; state: string } => {
    const state = crypto.randomBytes(16).toString("hex");
    pendingStates.set(state, { expiry: Date.now() + OAUTH_STATE_TTL_MS, code });

    const url = new URL(OAuth2Routes.authorizationURL);
    url.searchParams.set("client_id", DISCORD_CLIENT_ID);
    url.searchParams.set("redirect_uri", DISCORD_REDIRECT_URI);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "identify");
    url.searchParams.set("state", state);
    // #251: always show Discord's Authorize screen, even to a player who approved us before.
    // Without it Discord sends them straight back, and a player could be signed in without
    // one click of their own.
    url.searchParams.set("prompt", "consent");
    return { url: url.toString(), state };
};

export const getDiscordOauthToken = async (grant_code: string): Promise<RESTPostOAuth2AccessTokenResult> => {
    let url = new URL(OAuth2Routes.tokenURL);
    let body = new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code",
        code: grant_code,
        redirect_uri: DISCORD_REDIRECT_URI,
    });
    let requestData = {
        method: "POST",
        body: body,
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
        },
    };

    let response = await fetch(url.toString(), requestData);
    if (response.status === 200) {
        return (await response.json()) as RESTPostOAuth2AccessTokenResult;
    } else {
        throw new Error(`Error fetching OAuth tokens: [${response.status}] ${response.statusText}`);
    }
};

export const getDiscordUser = async (access_token: string): Promise<RESTGetAPICurrentUserResult> => {
    let url = new URL(RouteBases.api + Routes.user());
    let requestData = {
        method: "GET",
        headers: {
            Authorization: `Bearer ${access_token}`,
        },
    };
    let response = await fetch(url.toString(), requestData);
    if (response.status !== 200) {
        throw new Error(`Error fetching Discord user: [${response.status}] ${response.statusText}`);
    }
    return (await response.json()) as RESTGetAPICurrentUserResult;
};

// ── The game's side ──────────────────────────────────────────────────────────

DiscordLoginRouter.post("/handoff", handoffLimiter, (_req, res) => {
    const made = createHandoff();
    if (!made) {
        res.status(429).json({ error: "Too many Discord sign-ins waiting. Try again in a minute." });
        return;
    }
    res.json({
        code: made.code,
        key: made.key,
        url: `${PAGE_ORIGIN}/login/discord/?code=${encodeURIComponent(made.code)}`,
        expires_in: made.expiresIn,
    });
});

// The key travels in the body, never the address, so it stays out of every address log.
DiscordLoginRouter.post("/handoff/poll", pollLimiter, (req, res) => {
    const key = req.body?.key;
    if (typeof key !== "string") {
        res.json({ status: "expired", message: EXPIRED_MESSAGE });
        return;
    }
    res.json(pollHandoff(key));
});

// ── The browser's side ───────────────────────────────────────────────────────

const escapeHtml = (text: string): string =>
    text.replace(
        /[&<>"']/g,
        (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string
    );

// One plain page for every answer the browser gets. `body` is HTML we wrote; anything that came
// from outside is escaped before it is put in. No scripts, nothing loaded from elsewhere, and
// never shown inside another site's frame, where a hidden page could trick the player into
// pressing Continue.
function sendPage(res: Response, status: number, title: string, body: string): void {
    res.status(status)
        .set({
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
            "X-Frame-Options": "DENY",
            "Content-Security-Policy":
                "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'",
            // The code is in the address; do not pass it to Discord.
            "Referrer-Policy": "no-referrer",
        })
        .send(
            `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
                `<meta name="viewport" content="width=device-width, initial-scale=1">` +
                `<title>${escapeHtml(title)}</title>` +
                `<style>body{font-family:system-ui,sans-serif;max-width:32rem;margin:3rem auto;padding:0 1rem;line-height:1.5}` +
                `.code{font-size:2.5rem;font-weight:bold;letter-spacing:.15em;margin:1rem 0}` +
                `button{font-size:1.1rem;padding:.6rem 1.4rem}</style>` +
                `</head><body><h1>${escapeHtml(title)}</h1>${body}</body></html>`
        );
}

const expiredPage = (res: Response): void =>
    sendPage(res, 410, "This sign-in has expired", `<p>${escapeHtml(EXPIRED_MESSAGE)}</p>`);

function readCookie(req: Request, name: string): string {
    return (
        (req.headers.cookie ?? "")
            .split(";")
            .map((c) => c.trim())
            .find((c) => c.startsWith(`${name}=`))
            ?.slice(name.length + 1) ?? ""
    );
}

const COOKIE_PATH = "Path=/login/discord";

// The page the game opens: the code, and a question.
DiscordLoginRouter.get("/", discordStartLimiter, (req, res) => {
    const code = typeof req.query.code === "string" ? req.query.code : "";
    if (!canStartDiscord(code)) {
        expiredPage(res);
        return;
    }
    // The Continue button carries the same value as this cookie. A form another site sends
    // in the player's name has neither the value nor, being cross-site, the cookie, so it
    // cannot skip this question (POST /start checks both).
    const confirm = crypto.randomBytes(16).toString("hex");
    res.setHeader(
        "Set-Cookie",
        `bsf_confirm=${confirm}; HttpOnly; SameSite=Lax; ${COOKIE_PATH}; Max-Age=${OAUTH_STATE_TTL_MS / 1000}`
    );
    sendPage(
        res,
        200,
        "Sign in to Banner Saga Factions",
        `<p>Is this the code shown in your game?</p>` +
            `<p class="code">${escapeHtml(code)}</p>` +
            `<p>If it is, press Continue and sign in to Discord. ` +
            `<strong>If you did not just start the game yourself, or the codes differ, close this page</strong> — ` +
            `someone may be trying to sign in as you.</p>` +
            `<form method="post" action="/login/discord/start">` +
            `<input type="hidden" name="code" value="${escapeHtml(code)}">` +
            `<input type="hidden" name="confirm" value="${confirm}">` +
            `<button type="submit">Continue</button></form>`
    );
});

// Continue: on to Discord.
DiscordLoginRouter.post("/start", discordStartLimiter, express.urlencoded({ extended: false }), (req, res) => {
    const code = typeof req.body?.code === "string" ? req.body.code : "";
    const confirm = typeof req.body?.confirm === "string" ? req.body.confirm : "";
    const cookieConfirm = readCookie(req, "bsf_confirm");
    if (!confirm || confirm !== cookieConfirm) {
        sendPage(
            res,
            400,
            "Please start again",
            `<p>This page was not opened the usual way. Go back to the game and press Retry.</p>`
        );
        return;
    }
    if (!canStartDiscord(code)) {
        expiredPage(res);
        return;
    }
    if (pendingStates.size >= MAX_PENDING_STATES) {
        sendPage(res, 429, "Too busy", `<p>Too many people are signing in at once. Try again in a minute.</p>`);
        return;
    }
    const { url, state } = getDiscordOAuthURL(code);
    res.setHeader("Set-Cookie", [
        `bsf_oauth_state=${state}; HttpOnly; SameSite=Lax; ${COOKIE_PATH}; Max-Age=${OAUTH_STATE_TTL_MS / 1000}`,
        `bsf_confirm=; HttpOnly; SameSite=Lax; ${COOKIE_PATH}; Max-Age=0`,
    ]);
    // 303: the browser follows it with a GET, as Discord's page expects.
    res.redirect(303, url);
});

// A value from the address, as text; anything else as "". The address parser turns
// error[toString]=x into an object, whose own toString is not a function.
const textOrEmpty = (value: unknown): string => (typeof value === "string" ? value : "");

// Discord-issued error codes that mean "the player said no or Discord was busy". The hand-off
// stays open, so the player can reopen the page from the game and try again.
// No prototype (#311), so an error named "constructor" finds nothing.
const DISCORD_SAID_NO: Record<string, string> = Object.assign(Object.create(null), {
    access_denied: "You chose not to sign in with Discord.",
    temporarily_unavailable: "Discord is busy right now.",
});

DiscordLoginRouter.get("/oauth-callback", async (req, res) => {
    // Issue #54: validate OAuth state before any other processing.
    // queryState comes from Discord's redirect; cookieState was set on POST /start.
    // Both must match an entry in pendingStates (one-shot, TTL-bounded).
    const queryState = typeof req.query?.state === "string" ? req.query.state : "";
    const cookieState = readCookie(req, "bsf_oauth_state");
    const pending = pendingStates.get(queryState);
    if (!queryState || queryState !== cookieState || !pending || Date.now() > pending.expiry) {
        expiredPage(res);
        return;
    }
    pendingStates.delete(queryState);
    const code = pending.code;

    const tryAgain = `<p>Go back to the game and press Retry to open this page again, or Cancel to stop.</p>`;

    const discordError = textOrEmpty(req.query?.error);
    const grantCode = textOrEmpty(req.query?.code);
    if (req.query?.error || !grantCode) {
        // CRIT-1: never show the error text Discord's redirect carried; it could be anyone's.
        const said = DISCORD_SAID_NO[discordError] ?? "Discord did not finish signing you in.";
        sendPage(res, 400, "Not signed in", `<p>${escapeHtml(said)}</p>${tryAgain}`);
        return;
    }

    let discord_user: RESTGetAPICurrentUserResult;
    try {
        const tokens = await getDiscordOauthToken(grantCode);
        discord_user = await getDiscordUser(tokens.access_token);
    } catch (e) {
        console.error("[DISCORD] OAuth callback error:", e);
        sendPage(res, 502, "Not signed in", `<p>We could not reach Discord.</p>${tryAgain}`);
        return;
    }
    await finishDiscordStep(code, discord_user, res);
});

// Discord has said who the player is: check the id, then mark the hand-off finished or failed.
async function finishDiscordStep(
    code: string,
    discord_user: RESTGetAPICurrentUserResult,
    res: Response
): Promise<void> {
    // #25: keep the Snowflake as a string end-to-end. Discord sends `id` as a string
    // (Snowflakes exceed 2^53), so a numeric parse would corrupt it. The shared
    // screening check also rejects a non-positive id ("0", #140).
    if (!isValidSnowflake(discord_user.id)) {
        console.error(`[DISCORD] Malformed discord_id ${discord_user.id} — login rejected`);
        const message = "This Discord account cannot be used to sign in.";
        markFailed(code, message);
        sendPage(res, 400, "Not signed in", `<p>${escapeHtml(message)}</p>`);
        return;
    }
    // #375: an id this small can also arrive on the Steam route. If a Steam player already
    // holds it, refuse now, so the game stops waiting and shows why. The sign-in route checks
    // again before it makes a session.
    const number = await accountNumberFor("discord", discord_user.id);
    if ("ownedBy" in number) {
        console.warn(`[DISCORD] Sign-in refused for ${discord_user.id}: that id belongs to a ${number.ownedBy} player`);
        const message =
            "This Discord account's number is already used by another player. Ask on the BSF Discord for help.";
        markFailed(code, message);
        sendPage(res, 400, "Not signed in", `<p>${escapeHtml(message)}</p>`);
        return;
    }

    if (!markReady(code, discord_user.id, discord_user.username)) {
        expiredPage(res);
        return;
    }
    console.log(`[DISCORD] Discord step finished for ${discord_user.id}`);
    sendPage(
        res,
        200,
        "Signed in",
        `<p>Signed in as <strong>${escapeHtml(discord_user.username)}</strong>.</p>` +
            `<p>Go back to the game. You can close this page.</p>`
    );
}
