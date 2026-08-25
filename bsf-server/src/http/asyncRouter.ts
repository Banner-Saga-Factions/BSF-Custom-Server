import { Router } from "express";
import type { RequestHandler } from "express";

/**
 * Routers that cannot lose an async handler's failure.
 *
 * Express 4 wraps every handler call in a try/catch, which catches a handler that fails
 * *immediately*. An `async` handler never does that: it returns straight away and fails a
 * moment later, so Express never learns about it. No error handler runs, and **nothing
 * replies at all**.
 *
 * That is worse than it sounds. The socket stays open, so the game waits forever: it has no
 * timeout of its own (the five-second one its HttpRequest class declares is built and
 * listened to, but nothing ever starts it), it shows the player no error, and if the stalled
 * request happened to be the long poll it can stop receiving messages altogether. Issue #176.
 * * Not covered: `router.route(path).get(...)` and `router.param(...)`, which register through a
 * different door. Nothing uses either today; if you reach for one, wrap the handler yourself with
 * `wrapAsync` below.
 *
 * `asyncRouter()` returns an ordinary Express router whose registration methods wrap each
 * handler, so a failed async handler reaches Express's error handling like any other error --
 * where the middleware at the bottom of `app.ts` answers it. Use this instead of `Router()`
 * everywhere, and no handler added later has to remember.
 */

// The registration methods we wrap. `use` is included so middleware is covered too.
const METHODS = [
    "get",
    "post",
    "put",
    "patch",
    "delete",
    "head",
    "options",
    "all",
    "use",
] as const;

function wrap(candidate: unknown): unknown {
    // Express accepts an array of handlers wherever it accepts one and flattens it later. Wrap
    // through it, or that form quietly opts out of everything below.
    if (Array.isArray(candidate)) return candidate.map(wrap);

    // Not a handler at all -- a path string, or a regular expression.
    if (typeof candidate !== "function") return candidate;

    // Express works out what a layer *is* from how many arguments it takes: four means "error
    // handler". Re-wrapping one as a three-argument function would silently demote it to an
    // ordinary handler, so leave those exactly as they are.
    if (candidate.length === 4) return candidate;

    const handler = candidate as RequestHandler;

    return function wrapped(req: any, res: any, next: any) {
        try {
            const result: unknown = handler(req, res, next);
            // A mounted sub-router returns nothing, so there is no promise to follow and this
            // is a no-op for it.
            if (result && typeof (result as PromiseLike<unknown>).then === "function") {
                (result as Promise<unknown>).catch(next);
            }
        } catch (err) {
            // Keep the immediate-failure path behaving exactly as Express would, so a handler
            // fails the same way whichever way it fails.
            next(err);
        }
    };
}

/**
 * Wrap one handler that is not being registered on an `asyncRouter` -- the only current case
 * is the debug route mounted straight onto the app.
 */
export function wrapAsync(handler: RequestHandler): RequestHandler {
    return wrap(handler) as RequestHandler;
}

/** An Express router whose handlers cannot fail silently. Use instead of `Router()`. */
export function asyncRouter(): Router {
    const router = Router();

    for (const method of METHODS) {
        const original = (router as any)[method].bind(router) as (...args: unknown[]) => unknown;
        (router as any)[method] = (...args: unknown[]) => original(...args.map(wrap));
    }

    return router;
}
