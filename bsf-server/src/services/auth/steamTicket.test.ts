import { describe, it, expect, afterEach, vi } from "vitest";
import { checkSteamTicket, probeSteamKey, STEAM_TIMEOUT_MS } from "./steamTicket";

const CLAIMED = "76561198000000001";
const SOMEONE_ELSE = "76561198000000002";
const PROOF = "0a1b2c3d".repeat(8);
const KEY = "TESTKEY";
// No waiting between the two tries, so the suite stays fast.
const NO_WAIT = { retryDelayMs: 0 };

const steamSaysOk = (steamid: string) =>
    new Response(JSON.stringify({ response: { params: { result: "OK", steamid, ownersteamid: steamid } } }), {
        status: 200,
    });
// Measured 2026-10-12: what Steam answers for a proof it does not accept.
const steamSaysNo = () =>
    new Response(JSON.stringify({ response: { error: { errorcode: 3, errordesc: "Invalid parameter" } } }), {
        status: 200,
    });
// Measured 2026-10-12: what Steam answers for a key it does not accept.
const steamRejectsKey = () => new Response("<html><h1>Forbidden</h1></html>", { status: 403 });

function standInForSteam(...replies: Array<() => Response | Promise<Response>>) {
    const fetchMock = vi.fn();
    for (const reply of replies) fetchMock.mockImplementationOnce(async () => reply());
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
}

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe("checkSteamTicket", () => {
    it("passes a proof Steam confirms for the claimed number", async () => {
        const fetchMock = standInForSteam(() => steamSaysOk(CLAIMED));

        expect(await checkSteamTicket(CLAIMED, PROOF, KEY, NO_WAIT)).toBe("ok");
        const asked = new URL(fetchMock.mock.calls[0][0]);
        expect(asked.searchParams.get("appid")).toBe("219340");
        expect(asked.searchParams.get("ticket")).toBe(PROOF);
        expect(asked.searchParams.get("key")).toBe(KEY);
    });

    // The 2013 server stopped at "the proof is genuine". A genuine proof for my own account
    // must not sign me in as somebody else.
    it("refuses a genuine proof that belongs to a different number", async () => {
        standInForSteam(() => steamSaysOk(SOMEONE_ELSE));

        expect(await checkSteamTicket(CLAIMED, PROOF, KEY, NO_WAIT)).toBe("refused");
    });

    // A number this large is rounded when read as a JSON number: ...001 arrives as ...000. So an
    // answer about one player, turned back into text, would name their neighbour. This fails if
    // the answer is ever converted to text before it is compared.
    it("refuses an answer that gives the Steam number as a number, not text", async () => {
        const neighbour = "76561198000000000";
        const asNumber = `{"response":{"params":{"result":"OK","steamid":${CLAIMED}}}}`;
        standInForSteam(() => new Response(asNumber, { status: 200 }));

        expect(await checkSteamTicket(neighbour, PROOF, KEY, NO_WAIT)).toBe("refused");
    });

    // Naming the right player is not enough: Steam must also say the proof checked out.
    it("refuses an answer that names the player but does not say OK", async () => {
        const notOk = { response: { params: { result: "Invalid", steamid: CLAIMED, ownersteamid: CLAIMED } } };
        standInForSteam(() => new Response(JSON.stringify(notOk), { status: 200 }));

        expect(await checkSteamTicket(CLAIMED, PROOF, KEY, NO_WAIT)).toBe("refused");
    });

    // Steam family sharing: someone playing on a lent copy has their own number, and the lender's
    // number comes back as the owner. Lending the game must not let the borrower sign in as the lender.
    it("refuses a proof whose player only borrowed the game from the claimed number", async () => {
        const borrowed = { response: { params: { result: "OK", steamid: SOMEONE_ELSE, ownersteamid: CLAIMED } } };
        standInForSteam(() => new Response(JSON.stringify(borrowed), { status: 200 }));

        expect(await checkSteamTicket(CLAIMED, PROOF, KEY, NO_WAIT)).toBe("refused");
    });

    it("gives up on a Steam that never answers, after two tries", async () => {
        vi.useFakeTimers();
        // Answers only when the caller gives up, as a real request that hangs does.
        const fetchMock = vi.fn(
            (_url: string, init?: RequestInit) =>
                new Promise<Response>((_resolve, reject) => {
                    init?.signal?.addEventListener("abort", () => reject(new DOMException("gave up", "AbortError")));
                })
        );
        vi.stubGlobal("fetch", fetchMock);

        const verdict = checkSteamTicket(CLAIMED, PROOF, KEY, NO_WAIT);
        await vi.advanceTimersByTimeAsync(STEAM_TIMEOUT_MS * 2 + 100);

        expect(await verdict).toBe("unreachable");
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("refuses a proof Steam does not accept, without asking twice", async () => {
        const fetchMock = standInForSteam(steamSaysNo);

        expect(await checkSteamTicket(CLAIMED, PROOF, KEY, NO_WAIT)).toBe("refused");
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it.each([
        ["missing", undefined],
        ["empty", ""],
        ["the fixed text the game sends beside a made-up number", "override-authticket"],
        ["a list", [PROOF]],
        ["far too long", "ab".repeat(3000)],
    ])("refuses a proof that is %s without asking Steam", async (_label, proof) => {
        const fetchMock = standInForSteam();

        expect(await checkSteamTicket(CLAIMED, proof, KEY, NO_WAIT)).toBe("refused");
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("tries once more when Steam cannot be reached, and passes if the second try works", async () => {
        const fetchMock = standInForSteam(
            () => Promise.reject(new Error("network down")),
            () => steamSaysOk(CLAIMED)
        );

        expect(await checkSteamTicket(CLAIMED, PROOF, KEY, NO_WAIT)).toBe("ok");
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it.each([
        ["does not answer", () => Promise.reject(new Error("timed out"))],
        ["answers with a server error", () => new Response("busy", { status: 503 })],
        ["answers with something that is not JSON", () => new Response("<html>", { status: 200 })],
    ])("gives up after two tries when Steam %s", async (_label, reply) => {
        const fetchMock = standInForSteam(reply, reply);

        expect(await checkSteamTicket(CLAIMED, PROOF, KEY, NO_WAIT)).toBe("unreachable");
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("reports a key Steam does not accept, without asking twice", async () => {
        const fetchMock = standInForSteam(steamRejectsKey);

        expect(await checkSteamTicket(CLAIMED, PROOF, KEY, NO_WAIT)).toBe("key-rejected");
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    // The key travels in the address, and a failed request's error can carry that address.
    it("never writes the key or the proof to the log", async () => {
        const logged: string[] = [];
        for (const level of ["log", "warn", "error"] as const) {
            vi.spyOn(console, level).mockImplementation((...args) => void logged.push(args.join(" ")));
        }
        const leaky = () => Promise.reject(new Error(`request to https://example/?key=${KEY}&ticket=${PROOF} failed`));
        standInForSteam(leaky, leaky);

        await checkSteamTicket(CLAIMED, PROOF, KEY, NO_WAIT);

        expect(logged.join("\n")).not.toContain(KEY);
        expect(logged.join("\n")).not.toContain(PROOF);
    });
});

describe("probeSteamKey", () => {
    it("says the key works when Steam answers about the proof", async () => {
        standInForSteam(steamSaysNo);

        expect(await probeSteamKey(KEY)).toBe("accepted");
    });

    it("says the key is rejected when Steam refuses the key itself", async () => {
        standInForSteam(steamRejectsKey);

        expect(await probeSteamKey(KEY)).toBe("rejected");
    });

    it("says it could not tell when Steam cannot be reached", async () => {
        standInForSteam(() => Promise.reject(new Error("network down")));

        expect(await probeSteamKey(KEY)).toBe("unknown");
    });
});
