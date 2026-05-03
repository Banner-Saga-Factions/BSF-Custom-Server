import { describe, it, expect } from "vitest";
import { RawInt, rawIntValue, safeJsonStringify } from "./serialization";

describe("rawIntValue", () => {
    it("extracts the numeric value from a RawInt", () => {
        expect(rawIntValue(new RawInt("76561197960265728"))).toBe(76561197960265728);
    });

    it("passes a plain number through unchanged", () => {
        expect(rawIntValue(42)).toBe(42);
    });
});

describe("safeJsonStringify", () => {
    it("outputs a RawInt as a bare integer literal, not a quoted string", () => {
        const result = safeJsonStringify({ id: new RawInt("76561197960265728") });
        expect(result).toBe('{"id":76561197960265728}');
    });

    it("handles RawInt nested inside an array", () => {
        const result = safeJsonStringify([new RawInt("123456789012345678")]);
        expect(result).toBe("[123456789012345678]");
    });

    it("passes plain objects through like JSON.stringify", () => {
        const obj = { a: 1, b: "hello", c: true };
        expect(safeJsonStringify(obj)).toBe(JSON.stringify(obj));
    });
});
