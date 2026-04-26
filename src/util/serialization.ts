/**
 * Wrapper for integer values too large for IEEE 754 doubles.
 * JSON.stringify converts instances to a placeholder string;
 * safeJsonStringify then strips the quotes so the output is a bare integer.
 */
export class RawInt {
    constructor(public readonly raw: string) {}
}

/** Extract the numeric value from a RawInt or plain number (always rounded). */
export function rawIntValue(x: number | RawInt): number {
    return x instanceof RawInt ? Number(x.raw) : x;
}

/**
 * Like JSON.stringify but outputs RawInt values as unquoted integer literals,
 * preserving digits that exceed Number.MAX_SAFE_INTEGER.
 */
export function safeJsonStringify(data: unknown): string {
    const json = JSON.stringify(data, (_key, val) => {
        if (val instanceof RawInt) return `__RAWINT_${val.raw}__`;
        return val;
    });
    return json.replace(/"__RAWINT_(\d+)__"/g, "$1");
}
