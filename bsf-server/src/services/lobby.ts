import { Router } from "express";

export const LobbyRouter = Router();

// Stateless 200 stubs for all /services/lobby/* calls. Verified shapes from the decompiled client:
//   LobbyTxn        → POST /<action>/<session_key>     (actions: uninvite, join, decline, exit, ready, unready)
//   LobbyOptionsTxn → POST /options/<session_key>
//   LobbyInviteTxn  → POST /invite/<session_key>
// All three share the /<word>/<session_key> arity-2 shape, so a single catch-all suffices.
// Real party/invite delivery is tracked as a follow-up issue; stubs only unblock client UI.
LobbyRouter.post("/:first/:session_key?", (_req, res) => { res.send(); });
LobbyRouter.post("/", (_req, res) => { res.send(); });
