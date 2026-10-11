// Compares the SHAPE of one of our replies with a recorded reply from Stoic's server: the same
// field names, holding the same kinds of value. Not the values themselves -- those depend on the
// player and the moment, and comparing them would only produce exceptions.
//
// The result is a list of plain sentences, one per difference, each starting with where it is
// ("reply.boards[].values"). An empty list means the shapes match. A test pins the list it
// expects, so a difference somebody chose is written down next to its reason and a new one fails.
//
// Three rules worth knowing before reading a result:
//   - A recorded `null` says nothing about what kind of value belongs there, so anything matches it.
//   - A list is compared element by element against every recorded element put together: a field
//     that only some recorded elements carry is optional, one they all carry is required. An
//     empty recorded list says nothing about its elements, so anything matches. An empty list
//     of ours matches any recorded list too: there is no element of ours to compare.
//   - A list of messages -- objects that each name their `class` -- is compared class by class,
//     because the game finds each message by that name, not by its position.

type Kind = "string" | "number" | "boolean" | "null" | "list" | "object";

function kindOf(value: unknown): Kind {
    if (value === null || value === undefined) return "null";
    if (Array.isArray(value)) return "list";
    if (typeof value === "object") return "object";
    if (typeof value === "string") return "string";
    if (typeof value === "number") return "number";
    if (typeof value === "boolean") return "boolean";
    throw new Error(`shape: a ${typeof value} cannot appear in a reply`);
}

function isMessage(value: unknown): value is { class: string } {
    return kindOf(value) === "object" && typeof (value as any).class === "string";
}

function compareList(recorded: unknown[], ours: unknown[], where: string, found: string[]): void {
    if (recorded.length === 0) return;

    // Class by class only when ours name a class too. Where they do not, the plain comparison
    // below says so once ("class: missing") and still compares every other field.
    if (recorded.every(isMessage) && ours.every(isMessage)) {
        const recordedClasses = new Set(recorded.map((m) => m.class));
        const ourClasses = new Set(ours.map((m) => m.class));
        for (const name of recordedClasses) {
            if (!ourClasses.has(name)) found.push(`${where}: no ${name}, which the recording has`);
        }
        for (const element of ours) {
            const sameClass = recorded.filter((m) => m.class === element.class);
            if (sameClass.length === 0) {
                found.push(`${where}: ${element.class}, which the recording does not have`);
                continue;
            }
            compareToAny(sameClass, element, `${where}<${element.class}>`, found);
        }
        return;
    }

    for (const element of ours) compareToAny(recorded, element, `${where}[]`, found);
}

// One of our values against several recorded ones standing for the same thing.
function compareToAny(recorded: unknown[], ours: unknown, where: string, found: string[]): void {
    const kinds = new Set(recorded.map(kindOf));
    const ourKind = kindOf(ours);

    // Every recorded value was null: nothing is known about what belongs here.
    if (kinds.size === 1 && kinds.has("null")) return;

    if (!kinds.has(ourKind)) {
        const wanted = [...kinds].filter((k) => k !== "null").join(" or ");
        found.push(`${where}: ${ourKind}, where the recording has ${wanted}`);
        return;
    }

    if (ourKind === "list") {
        const elements = recorded.filter(Array.isArray).flat();
        compareList(elements, ours as unknown[], where, found);
    } else if (ourKind === "object") {
        const objects = recorded.filter((r) => kindOf(r) === "object") as Record<string, unknown>[];
        const mine = ours as Record<string, unknown>;
        const everyName = new Set(objects.flatMap((o) => Object.keys(o)));
        for (const name of everyName) {
            const holders = objects.filter((o) => name in o);
            if (!(name in mine)) {
                // Optional when some recorded object goes without it.
                if (holders.length === objects.length) found.push(`${where}.${name}: missing`);
                continue;
            }
            compareToAny(
                holders.map((o) => o[name]),
                mine[name],
                `${where}.${name}`,
                found
            );
        }
        for (const name of Object.keys(mine)) {
            if (!everyName.has(name)) found.push(`${where}.${name}: not in the recording`);
        }
    }
}

/** Every way `ours` differs in shape from `recorded`. Empty when it does not. */
export function shapeDifferences(recorded: unknown, ours: unknown, where = "reply"): string[] {
    const found: string[] = [];
    compareToAny([recorded], ours, where, found);
    return [...new Set(found)].sort();
}
