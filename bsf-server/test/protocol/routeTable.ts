import app from "../../src/app";

// Every address the running server answers, read from the server itself rather than from a list
// somebody has to remember to update. The tests in this folder ask a question of *every* route --
// "does it need a session?", "can it start an endless re-send?" -- and a hand-kept list would let a
// new route skip the question simply by not being added to it.
//
// Express keeps what was registered as a stack of layers. A layer is one of three things: a single
// route (it has `.route`), a group of routes mounted under a prefix (its handler has a stack of its
// own), or plain middleware (neither, and not an address). This walks the first two.

export interface ListedRoute {
    /** Upper case: GET, POST. */
    method: string;
    /** The full address as registered, parameters still written `:like_this`. */
    path: string;
}

// The prefix a group was mounted under. Express 4 keeps it only as the pattern it compiled, which
// for `use("/auth", ...)` reads ^\/auth\/?(?=\/|$) and for `use("/", ...)` is flagged fast_slash.
// Anything else -- a prefix with a parameter in it, say -- is refused loudly: guessing would list
// routes under the wrong address, and every test built on this would then check the wrong thing.
function mountPrefix(layer: any): string {
    if (layer.regexp?.fast_slash) return "";
    const source = String(layer.regexp?.source);
    const match = /^\^((?:\\\/[\w-]+)+)\\\/\?\(\?=\\\/\|\$\)$/.exec(source);
    if (!match) throw new Error(`routeTable: cannot read the mount prefix from ${source}`);
    return match[1].replace(/\\\//g, "/");
}

function walk(stack: any[], prefix: string, found: ListedRoute[]): void {
    for (const layer of stack) {
        if (layer.route) {
            // A route registered with a pattern has no address these tests could send.
            if (typeof layer.route.path !== "string") {
                throw new Error(`routeTable: cannot read an address from ${String(layer.route.path)}`);
            }
            // "/login/discord" + "/" is the same address as "/login/discord".
            const path = `${prefix}${layer.route.path}`.replace(/(.)\/$/, "$1");
            for (const method of Object.keys(layer.route.methods)) {
                found.push({ method: method.toUpperCase(), path });
            }
        } else if (Array.isArray(layer.handle?.stack)) {
            walk(layer.handle.stack, prefix + mountPrefix(layer), found);
        }
    }
}

export function listRoutes(): ListedRoute[] {
    const found: ListedRoute[] = [];
    walk((app as any)._router.stack, "", found);
    return found;
}

/** "POST /services/vs/start/:session_key" -- the form the tables in this folder are keyed by. */
export function routeName(route: ListedRoute): string {
    return `${route.method} ${route.path}`;
}
