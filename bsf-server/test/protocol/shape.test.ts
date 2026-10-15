import { describe, it, expect } from "vitest";
import { shapeDifferences } from "./shape";

// The replay tests rest on this comparison, so it is checked against cases small enough to
// work out by hand. Each expected list below was written out, not produced by running the code.

describe("shapeDifferences", () => {
    it("finds nothing when the field names and kinds of value match, whatever the values", () => {
        const recorded = { name: "Iver", rank: 2, alive: true, units: [{ id: "a" }] };
        const ours = { name: "Rook", rank: 9, alive: false, units: [{ id: "b" }, { id: "c" }] };
        expect(shapeDifferences(recorded, ours)).toEqual([]);
    });

    it("reports a field we dropped, a field we added, and a field holding another kind of value", () => {
        const recorded = { name: "Iver", rank: 2, alive: true };
        const ours = { name: "Rook", rank: "two", extra: 1 };
        expect(shapeDifferences(recorded, ours)).toEqual([
            "reply.alive: missing",
            "reply.extra: not in the recording",
            "reply.rank: string, where the recording has number",
        ]);
    });

    it("lets anything stand where the recording has null, but not null where it has a value", () => {
        expect(shapeDifferences({ note: null }, { note: { any: "thing" } })).toEqual([]);
        expect(shapeDifferences({ note: "x" }, { note: null })).toEqual([
            "reply.note: null, where the recording has string",
        ]);
    });

    it("treats a field only some recorded list elements carry as optional", () => {
        const recorded = [{ id: 1, nick: "a" }, { id: 2 }];
        expect(shapeDifferences(recorded, [{ id: 3 }])).toEqual([]);
        expect(shapeDifferences(recorded, [{ nick: "b" }])).toEqual(["reply[].id: missing"]);
    });

    it("says nothing about the elements of a list the recording left empty", () => {
        expect(shapeDifferences({ units: [] }, { units: [{ any: "thing" }] })).toEqual([]);
    });

    it("compares messages class by class, and names a class only one side has", () => {
        const recorded = [
            { class: "A", count: 1 },
            { class: "B", label: "x" },
        ];
        const ours = [
            { class: "A", count: "one" },
            { class: "C", anything: true },
        ];
        expect(shapeDifferences(recorded, ours)).toEqual([
            "reply: C, which the recording does not have",
            "reply: no B, which the recording has",
            "reply<A>.count: string, where the recording has number",
        ]);
    });

    it("reports nothing at all in place of a body", () => {
        expect(shapeDifferences({ unit_id: "a" }, null)).toEqual(["reply: null, where the recording has object"]);
    });
});
