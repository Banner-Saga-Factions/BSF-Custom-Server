import crypto from "crypto";
import {
    RESTPostOAuth2AccessTokenResult,
    RESTGetAPICurrentUserResult,
    OAuth2Routes,
    Routes,
    RouteBases,
} from "discord-api-types/rest/v10";
import { asyncRouter } from "../../http/asyncRouter";
import { sign, verify } from "jsonwebtoken";
import { config } from "dotenv";
import { upsertAccount, getAccountByUserId } from "../../db/account";
// #91: both sign-in paths end the same way, so both announce the arrival. Hooking only
// Steam would make Discord players invisible to everyone and everyone invisible to them.
import { announceOnline } from "../friends";
import { sessionHandler } from "./auth";
import { accountIdFromSnowflake, isValidSnowflake } from "./accountId";

config();

export const DiscordLoginRouter = asyncRouter();
const JWT_SECRET = process.env.JWT_SECRET as string;

const DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI ?? "http://localhost:8082/login/discord/oauth-callback";
const DISCORD_CLIENT_ID    = process.env.DISCORD_CLIENT_ID    ?? "1122976027140956221";
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET as string;
if (!DISCORD_CLIENT_SECRET) {
    console.warn("[DISCORD] DISCORD_CLIENT_SECRET is not set — OAuth login will fail");
}

// Issue #54: OAuth state CSRF protection. The cookie binds the callback to the same
// browser that started the flow; the map turns each state into a one-shot
// replay-protected nonce that expires after OAUTH_STATE_TTL_MS.
const OAUTH_STATE_TTL_MS = 5 * 60 * 1000;
const pendingStates = new Map<string, number>();

setInterval(() => {
    const now = Date.now();
    for (const [state, expiry] of pendingStates) {
        if (now > expiry) pendingStates.delete(state);
    }
}, 60 * 1000).unref();

export const getDiscordOAuthURL = (): { url: string; state: string } => {
    const state = crypto.randomBytes(16).toString("hex");
    pendingStates.set(state, Date.now() + OAUTH_STATE_TTL_MS);

    const url = new URL(OAuth2Routes.authorizationURL);
    url.searchParams.set("client_id", DISCORD_CLIENT_ID);
    url.searchParams.set("redirect_uri", DISCORD_REDIRECT_URI);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "identify");
    url.searchParams.set("state", state);
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

DiscordLoginRouter.get("/", (_req, res) => {
    const { url, state } = getDiscordOAuthURL();
    res.setHeader(
        "Set-Cookie",
        `bsf_oauth_state=${state}; HttpOnly; SameSite=Lax; Path=/login/discord; Max-Age=${OAUTH_STATE_TTL_MS / 1000}`
    );
    res.redirect(url);
});

DiscordLoginRouter.get("/oauth-callback", async (req, res) => {
    // Issue #54: validate OAuth state before any other processing.
    // queryState comes from Discord's redirect; cookieState was set on /login/discord/.
    // Both must match an entry in pendingStates (one-shot, TTL-bounded).
    const queryState = typeof req.query?.state === "string" ? req.query.state : "";
    const cookieHeader = req.headers.cookie ?? "";
    const cookieState = cookieHeader
        .split(";")
        .map((c) => c.trim())
        .find((c) => c.startsWith("bsf_oauth_state="))
        ?.slice("bsf_oauth_state=".length) ?? "";
    const expiry = pendingStates.get(queryState);
    if (!queryState || queryState !== cookieState || !expiry || Date.now() > expiry) {
        return res.redirect(302, "bsf://auth?error=invalid_state");
    }
    pendingStates.delete(queryState);

    let res_params = new URLSearchParams();

    if (req.query?.error || !req.query?.code) {
        // CRIT-1: allowlist Discord-issued error codes; never forward arbitrary attacker input
        const KNOWN_DISCORD_ERRORS = ["access_denied", "temporarily_unavailable"];
        const rawErr = req.query.error?.toString() ?? "";
        const safeErr = rawErr
            ? (KNOWN_DISCORD_ERRORS.includes(rawErr) ? rawErr : "oauth_error")
            : "missing_access_code";
        res_params.set("error", safeErr);
    } else {
        try {
            let tokens = await getDiscordOauthToken(req.query.code as string);
            let discord_user = await getDiscordUser(tokens.access_token);
            // #25: keep the Snowflake as a string end-to-end. Discord sends `id` as a string
            // (Snowflakes exceed 2^53), so a numeric parse would corrupt it. The shared
            // screening check also rejects a non-positive id ("0", #140) before it could
            // ever create a DB row; the row is stored under the full id (TEXT PK).
            if (!isValidSnowflake(discord_user.id)) {
                console.error(`[DISCORD] Malformed discord_id ${discord_user.id} — login rejected`);
                res_params.set("error", "unsupported_account_id");
                return res.redirect(302, `bsf://auth?${res_params}`);
            }
            let accountRow = await upsertAccount(discord_user.id, discord_user.username);
            let jwt_res = sign({ discord_id: discord_user.id }, JWT_SECRET, { expiresIn: "7d" });
            res_params.set("access_token", jwt_res);
            res_params.set("new_user", String(accountRow.login_count === 1));
            res_params.set("username", accountRow.username);
        } catch (e) {
            console.error("[DISCORD] OAuth callback error:", e);
            res_params.set("error", "an_error_occurred_communicating_with_discord");
        }
    }
    return res.redirect(302, `bsf://auth?${res_params}`);
});

// Exchanges a Discord JWT for a session_key usable with all game traffic.
// Call this after the OAuth redirect; use the returned session_key like a Steam session.
DiscordLoginRouter.post("/session", async (req, res) => {
    const token = req.headers.authorization?.match(/^Bearer\s+(\S+)$/)?.[1];
    if (!token) return res.sendStatus(401);

    let discord_id_str: string;
    try {
        const decoded = verify(token, JWT_SECRET) as any;
        // #25: the JWT carries the exact Snowflake string — keep it a string so IDs above
        // 2^53 never lose precision. Screen the shape and reject "0" (#140); no numeric parse.
        discord_id_str = String(decoded.discord_id);
        if (!isValidSnowflake(discord_id_str)) throw new Error("invalid discord_id");
    } catch {
        return res.sendStatus(401);
    }

    // Derive the 32-bit in-game id losslessly from the exact string (low 30 bits — see
    // accountId.ts for the full rationale). Passing the full Snowflake into addSession
    // makes it the session-dedup key, so two Snowflakes sharing these low bits no longer
    // evict each other's sessions (#140) — though they still share the in-game id (the
    // documented residual).
    const account_id = accountIdFromSnowflake(discord_id_str);
    const session = sessionHandler.addSession(account_id, discord_id_str);
    try {
        // Use existing account if present (OAuth callback already called upsertAccount).
        // Fall back to upsertAccount only if the JWT is being reused without a prior callback.
        session.accountData = (await getAccountByUserId(discord_id_str)) ?? (await upsertAccount(discord_id_str, session.display_name));
        session.display_name = session.accountData.username;
        // #91: after the database read, so the name broadcast is the real one.
        announceOnline(session);
        res.json({ ...session.asJson(), user_id: session.account_id });
    } catch (err) {
        sessionHandler.removeSession(session.session_key);
        console.error("[DISCORD] DB error during session creation:", err);
        res.sendStatus(500);
    }
});
