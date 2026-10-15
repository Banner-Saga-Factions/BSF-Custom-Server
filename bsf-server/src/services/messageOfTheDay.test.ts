import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
    MAX_LENGTH,
    REFRESH_EVERY_MS,
    cleanText,
    currentMessage,
    messageCategory,
    newestTitle,
    parseLinks,
    refreshMessage,
    resetMessageForTests,
    startMessageRefresh,
} from "./messageOfTheDay";

// #269. GitHub is never reached: every test that reads the message stands in for `fetch`.

const LIST = "https://api.github.com/repos/Banner-Saga-Factions/BSF-Custom-Server/discussions?per_page=100";
const page = (n: number) => `https://api.github.com/repositories/553078455/discussions?per_page=100&page=${n}`;

function post(title: string, created_at: string, overrides: Record<string, unknown> = {}) {
    return {
        title,
        created_at,
        state: "open",
        author_association: "MEMBER",
        category: { slug: "in-game" },
        ...overrides,
    };
}

function reply(items: unknown, link?: string, status = 200): Response {
    return new Response(JSON.stringify(items), { status, headers: link ? { link } : {} });
}

// Answers each address from `pages`, and records which were asked for.
function stubGitHub(pages: Record<string, () => Response>) {
    const asked: string[] = [];
    const fetchMock = vi.fn(async (url: string) => {
        asked.push(url);
        const answer = pages[url];
        if (!answer) throw new Error(`unexpected request for ${url}`);
        return answer();
    });
    vi.stubGlobal("fetch", fetchMock);
    return { asked, fetchMock };
}

beforeEach(() => {
    resetMessageForTests();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.useRealTimers();
});

describe("cleanText (#269)", () => {
    it("removes every < and >, so the text cannot change how chat looks", () => {
        expect(cleanText("<b>Battle</b> Hour <font color='#f00'>Saturday</font>")).toBe(
            "bBattle/b Hour font color='#f00'Saturday/font"
        );
    });

    it("turns line breaks, tabs and runs of spaces into one space, and trims the ends", () => {
        expect(cleanText("  Battle Hour\n\tis   Saturday \r\n")).toBe("Battle Hour is Saturday");
    });

    it("turns control characters into spaces", () => {
        expect(cleanText("Battle\u0000Hour\u001bis\u007fSaturday")).toBe("Battle Hour is Saturday");
    });

    it("removes numeric character codes, which the game would read as a line break or the end of the text", () => {
        expect(cleanText("Battle&#10;Hour &#x0A;is&#13;Saturday&#0;")).toBe("Battle Hour is Saturday");
    });

    it("cannot be made to rebuild a character code by removing < and > or another code", () => {
        expect(cleanText("Battle&<#10;>Hour")).toBe("Battle Hour");
        expect(cleanText("Battle&#&#49;0;Hour")).toBe("Battle&# 0;Hour");
    });

    it("leaves a short message as it is", () => {
        expect(cleanText("Battle Hour is Saturday, 20:00 UTC")).toBe("Battle Hour is Saturday, 20:00 UTC");
    });

    it("cuts a long message at a space and ends it with …, within the limit", () => {
        const long = "word ".repeat(60);
        const cleaned = cleanText(long);
        expect(cleaned.length).toBeLessThanOrEqual(MAX_LENGTH);
        expect(cleaned.endsWith("word…")).toBe(true);
    });

    it("cuts a long message with no space in it at the limit", () => {
        const cleaned = cleanText("x".repeat(500));
        expect(cleaned).toBe(`${"x".repeat(MAX_LENGTH - 1)}…`);
    });
});

describe("newestTitle (#269)", () => {
    it("picks the newest post in the category, whatever order the list is in", () => {
        const list = [
            post("Middle", "2026-10-02T00:00:00Z"),
            post("Newest", "2026-10-03T00:00:00Z"),
            post("Oldest", "2026-10-01T00:00:00Z"),
        ];
        expect(newestTitle(list, "in-game")).toBe("Newest");
    });

    it("ignores posts in other categories", () => {
        const list = [
            post("Ours", "2026-10-01T00:00:00Z"),
            post("Announcement", "2026-10-05T00:00:00Z", { category: { slug: "announcements" } }),
        ];
        expect(newestTitle(list, "in-game")).toBe("Ours");
    });

    it("takes posts by the owner, members and collaborators, and ignores anyone else's", () => {
        for (const who of ["OWNER", "MEMBER", "COLLABORATOR"]) {
            expect(newestTitle([post("Ok", "2026-10-01T00:00:00Z", { author_association: who })], "in-game")).toBe(
                "Ok"
            );
        }
        for (const who of ["CONTRIBUTOR", "FIRST_TIME_CONTRIBUTOR", "NONE", undefined]) {
            expect(newestTitle([post("No", "2026-10-01T00:00:00Z", { author_association: who })], "in-game")).toBe(
                null
            );
        }
    });

    it("treats a closed post as taken down", () => {
        const list = [
            post("Older, still open", "2026-10-01T00:00:00Z"),
            post("Closed", "2026-10-02T00:00:00Z", { state: "closed" }),
        ];
        expect(newestTitle(list, "in-game")).toBe("Older, still open");
    });

    it("shows a post that was locked to stop replies, but not one that was closed and then locked", () => {
        // GitHub reports both as state "locked"; a closed one keeps the reason it was closed for
        // (measured 2026-10-15 on 177 locked posts in vercel/next.js).
        const list = [
            post("Locked, never closed", "2026-10-02T00:00:00Z", { state: "locked", state_reason: null }),
            post("Closed, then locked", "2026-10-03T00:00:00Z", { state: "locked", state_reason: "resolved" }),
        ];
        expect(newestTitle(list, "in-game")).toBe("Locked, never closed");
        expect(newestTitle([list[0]], "in-game")).toBe("Locked, never closed");
        expect(newestTitle([list[1]], "in-game")).toBe(null);
    });

    it("skips anything not shaped like a post", () => {
        const list = [null, 7, { title: 3 }, post("Bad date", "not a date"), post("Good", "2026-10-01T00:00:00Z")];
        expect(newestTitle(list, "in-game")).toBe("Good");
    });

    it("gives null when the category has no post", () => {
        expect(newestTitle([], "in-game")).toBe(null);
    });
});

describe("parseLinks (#269)", () => {
    it("reads GitHub's page links by name", () => {
        const header = `<${page(2)}>; rel="next", <${page(7)}>; rel="last"`;
        expect(parseLinks(header)).toEqual({ next: page(2), last: page(7) });
    });

    it("gives nothing for no header", () => {
        expect(parseLinks(null)).toEqual({});
    });
});

describe("messageCategory (#269)", () => {
    it("is in-game unless the setting names another", () => {
        expect(messageCategory()).toBe("in-game");
        vi.stubEnv("MOTD_DISCUSSION_CATEGORY", " announcements ");
        expect(messageCategory()).toBe("announcements");
    });

    it("ignores capitals, so a display name such as In-Game finds its web-address name", () => {
        vi.stubEnv("MOTD_DISCUSSION_CATEGORY", "In-Game");
        expect(messageCategory()).toBe("in-game");
    });
});

describe("refreshMessage (#269)", () => {
    it("reads one page, with no token, and keeps the newest title cleaned", async () => {
        const { fetchMock } = stubGitHub({
            [LIST]: () => reply([post("<Battle Hour>  Saturday", "2026-10-01T00:00:00Z")]),
        });

        await refreshMessage();

        expect(currentMessage()).toBe("Battle Hour Saturday");
        const headers = (fetchMock.mock.calls[0] as any[])[1].headers;
        expect(headers.Authorization).toBeUndefined();
    });

    it("goes to the last page when there are several, because GitHub lists oldest first", async () => {
        const { asked } = stubGitHub({
            [LIST]: () =>
                reply([post("Old", "2026-01-01T00:00:00Z")], `<${page(2)}>; rel="next", <${page(3)}>; rel="last"`),
            [page(3)]: () => reply([post("New", "2026-10-01T00:00:00Z")], `<${page(2)}>; rel="prev"`),
        });

        await refreshMessage();

        expect(currentMessage()).toBe("New");
        expect(asked).toEqual([LIST, page(3)]);
    });

    it("looks one page further back when the last page has no post in the category", async () => {
        const { asked } = stubGitHub({
            [LIST]: () => reply([], `<${page(3)}>; rel="last"`),
            [page(3)]: () =>
                reply(
                    [post("Elsewhere", "2026-10-02T00:00:00Z", { category: { slug: "q-a" } })],
                    `<${page(2)}>; rel="prev"`
                ),
            [page(2)]: () => reply([post("Ours", "2026-10-01T00:00:00Z")]),
        });

        await refreshMessage();

        expect(currentMessage()).toBe("Ours");
        expect(asked).toEqual([LIST, page(3), page(2)]);
    });

    it("clears the message when the post has gone", async () => {
        stubGitHub({ [LIST]: () => reply([post("Battle Hour", "2026-10-01T00:00:00Z")]) });
        await refreshMessage();
        stubGitHub({ [LIST]: () => reply([]) });

        await refreshMessage();

        expect(currentMessage()).toBe("");
    });

    it.each([
        ["GitHub refuses", () => reply({ message: "API rate limit exceeded" }, undefined, 403)],
        ["the answer is not a list", () => reply({ message: "Not Found" })],
        [
            "the network fails",
            () => {
                throw new TypeError("fetch failed");
            },
        ],
    ])("keeps the last message when %s", async (_why, answer) => {
        stubGitHub({ [LIST]: () => reply([post("Battle Hour", "2026-10-01T00:00:00Z")]) });
        await refreshMessage();
        stubGitHub({ [LIST]: answer });

        await refreshMessage();

        expect(currentMessage()).toBe("Battle Hour");
        expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("[MOTD] could not read"));
    });

    it("does not follow a page link that leads away from GitHub's API", async () => {
        const { asked } = stubGitHub({ [LIST]: () => reply([], `<https://example.com/evil>; rel="last"`) });

        await refreshMessage();

        expect(asked).toEqual([LIST]);
        expect(currentMessage()).toBe("");
        expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("outside GitHub's API"));
    });

    it("logs the message the first time and when it changes, not on every read", async () => {
        stubGitHub({ [LIST]: () => reply([]) });
        await refreshMessage();
        await refreshMessage();
        stubGitHub({ [LIST]: () => reply([post("Battle Hour", "2026-10-01T00:00:00Z")]) });
        await refreshMessage();

        expect(vi.mocked(console.log).mock.calls.map((c) => c[0])).toEqual([
            "[MOTD] no message of the day",
            "[MOTD] message of the day is now: Battle Hour",
        ]);
    });
});

describe("startMessageRefresh (#269)", () => {
    it("reads now and again every 10 minutes", async () => {
        vi.useFakeTimers();
        const { fetchMock } = stubGitHub({ [LIST]: () => reply([]) });

        startMessageRefresh();
        expect(fetchMock).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(REFRESH_EVERY_MS);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        // Started twice, it still reads only once each time round.
        startMessageRefresh();
        await vi.advanceTimersByTimeAsync(REFRESH_EVERY_MS);
        expect(fetchMock).toHaveBeenCalledTimes(3);
    });
});
