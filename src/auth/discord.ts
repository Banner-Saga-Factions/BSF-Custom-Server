import { config } from "dotenv";
// TODO: provide env variables in docker compose and remove this dependency
config();

const DISCORD_REDIRECT_URI =
    "https://bsf.pieloaf.com/auth/discord-oauth-callback";
const DISCORD_CLIENT_ID = "1122976027140956221";
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET as string;
const DISCORD_API_BASE_URL = "https://discord.com/api";

export const getDiscordOAuthURL = () => {
    let url = new URL(`https://discord.com/api/oauth2/authorize`);
    url.searchParams.set("client_id", DISCORD_CLIENT_ID);
    url.searchParams.set("redirect_uri", DISCORD_REDIRECT_URI);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "identify guilds");
    return url.toString();
};

export const getDiscorOauthToken = async (grant_code: string) => {
    let url = new URL(`${DISCORD_API_BASE_URL}/oauth2/token`);
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
        return await response.json();
    } else {
        throw new Error(
            `Error fetching OAuth tokens: [${response.status}] ${response.statusText}`
        );
    }
};

export const getDiscordUser = async (access_token: string) => {
    let url = new URL(`${DISCORD_API_BASE_URL}/users/@me`);
    let requestData = {
        method: "GET",
        headers: {
            Authorization: `Bearer ${access_token}`,
            "Content-Type": "application/x-www-form-urlencoded",
        },
    };
    let response = await fetch(url.toString(), requestData);
    return await response.json();
};
