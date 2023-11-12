import {
    RESTPostOAuth2AccessTokenResult,
    RESTGetAPICurrentUserResult,
    OAuth2Routes,
    Routes,
    RouteBases,
} from "discord-api-types/rest/v10";
import { Router } from "express";
import { sign } from "jsonwebtoken";
import { config } from "dotenv";
// TODO: provide env variables in docker compose and remove this dependency
config();

export const DiscordLoginRouter = Router();
const JWT_SECRET = process.env.JWT_SECRET as string;

const DISCORD_REDIRECT_URI = "http://localhost:8082/login/discord/oauth-callback";
const DISCORD_CLIENT_ID = "1122976027140956221";
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET as string;

export const getDiscordOAuthURL = () => {
    let url = new URL(OAuth2Routes.authorizationURL);
    url.searchParams.set("client_id", DISCORD_CLIENT_ID);
    url.searchParams.set("redirect_uri", DISCORD_REDIRECT_URI);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "identify guilds");
    return url.toString();
};

export const getDiscorOauthToken = async (grant_code: string): Promise<RESTPostOAuth2AccessTokenResult> => {
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
            "Content-Type": "application/x-www-form-urlencoded",
        },
    };
    let response = await fetch(url.toString(), requestData);
    return (await response.json()) as RESTGetAPICurrentUserResult;
};

DiscordLoginRouter.get("/", (req, res) => {
    console.log("asdasd");
    res.redirect(getDiscordOAuthURL());
});

DiscordLoginRouter.get("/oauth-callback", async (req, res) => {
    let res_params = new URLSearchParams();

    if (req.query?.error || !req.query?.code) {
        res_params.set("error", req.query.error?.toString() || "missing_access_code");
    } else {
        try {
            let tokens = await getDiscorOauthToken(req.query.code as string);
            let discord_user = await getDiscordUser(tokens.access_token);
            let jwt_res = sign({ discord_id: discord_user.id }, JWT_SECRET);
            res_params.set("access_token", jwt_res);
            // TODO: only set new user if not in db
            res_params.set("new_user", "true");
            res_params.set("username", discord_user.username);
        } catch (e) {
            console.log(e); // TODO: Should probably log this somewhere persistent
            res_params.set("error", "an_error_occurred_communicating_with_discord");
        }
    }
    res.status(301);
    return res.redirect(`bsf://auth?${res_params}`);
});
