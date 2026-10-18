import { vi, beforeAll, afterAll } from "vitest";

vi.mock("../src/db/connection", () => ({
    query: vi.fn().mockResolvedValue([]),
    queryOne: vi.fn().mockResolvedValue(null),
    queryUpdate: vi.fn().mockResolvedValue(1),
}));

// With the database replaced above, the stored player number (#140) could never be read back.
// Every route test therefore gets the player's usual number, exactly as before numbers were
// stored. The real table is tested against a real database in src/db/accountNumbers.integration.test.ts.
vi.mock("../src/db/accountNumbers", async () => {
    const { usualAccountId } = await vi.importActual<typeof import("../src/services/auth/accountId")>(
        "../src/services/auth/accountId"
    );
    return {
        accountNumberFor: vi.fn(async (provider: "steam" | "discord", externalId: string) => ({
            account_id: usualAccountId(provider, externalId),
        })),
    };
});

beforeAll(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "debug").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
});

afterAll(() => {
    vi.restoreAllMocks();
});
