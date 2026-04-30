import { vi, beforeAll, afterAll } from "vitest";

vi.mock("../src/db/connection", () => ({
    query: vi.fn().mockResolvedValue({ affectedRows: 1 }),
    queryOne: vi.fn().mockResolvedValue(null),
    queryUpdate: vi.fn().mockResolvedValue(1),
}));

beforeAll(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "debug").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
});

afterAll(() => {
    vi.restoreAllMocks();
});
