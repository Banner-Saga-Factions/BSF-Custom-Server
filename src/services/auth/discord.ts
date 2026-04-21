import {
    RESTPostOAuth2AccessTokenResult,
    RESTGetAPICurrentUserResult,
    OAuth2Routes,
    Routes,
    RouteBases,
} from "discord-api-types/rest/v10";
import { Router } from "express";
import { sign, verify } from "jsonwebtoken";
import { config } from "dotenv";
import { upsertAccount, getAccountByUserId } from "../../db/account";
import { sessionHandler } from "./auth";

config();

export const DiscordLoginRouter = Router();
const JWT_SECRET = process.env.JWT_SECRET as string;

const DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI ?? "http://localhost:8082/login/discord/oauth-callback";
const DISCORD_CLIENT_ID    = process.env.DISCORD_CLIENT_ID    ?? "1122976027140956221";
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET as string;
if (!DISCORD_CLIENT_SECRET) {
    console.warn("[DISCORD] DISCORD_CLIENT_SECRET is not set — OAuth login will fail");
}

// TODO HIGH-1: Add OAuth `state` parameter to prevent login CSRF.
// Generate a signed random value, store in a short-lived cookie, verify on callback.
export const getDiscordOAuthURL = () => {
    let url = new URL(OAuth2Routes.authorizationURL);
    url.searchParams.set("client_id", DISCORD_CLIENT_ID);
    url.searchParams.set("redirect_uri", DISCORD_REDIRECT_URI);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "identify");
    return url.toString();
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
    res.redirect(getDiscordOAuthURL());
});

DiscordLoginRouter.get("/oauth-callback", async (req, res) => {
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
            const numeric_id = parseInt(discord_user.id, 10);
            if (numeric_id.toString() !== discord_user.id) {
                console.warn(`[DISCORD] Precision loss for discord_id ${discord_user.id} → ${numeric_id}`);
            }
            let accountRow = await upsertAccount(numeric_id, discord_user.username);
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

    let discord_id: number;
    try {
        const decoded = verify(token, JWT_SECRET) as any;
        discord_id = parseInt(decoded.discord_id, 10);
        if (isNaN(discord_id) || discord_id <= 0) throw new Error("invalid discord_id");
        if (discord_id.toString() !== String(decoded.discord_id)) {
            console.warn(`[DISCORD] Precision loss for discord_id ${decoded.discord_id} → ${discord_id}`);
        }
    } catch {
        return res.sendStatus(401);
    }

    const session = sessionHandler.addSession(discord_id);
    try {
        // Use existing account if present (OAuth callback already called upsertAccount).
        // Fall back to upsertAccount only if the JWT is being reused without a prior callback.
        session.accountData = (await getAccountByUserId(discord_id)) ?? (await upsertAccount(discord_id, session.display_name));
        session.display_name = session.accountData.username;
        res.json(session.asJson());
    } catch (err) {
        sessionHandler.removeSession(session.session_key);
        console.error("[DISCORD] DB error during session creation:", err);
        res.sendStatus(500);
    }
});
