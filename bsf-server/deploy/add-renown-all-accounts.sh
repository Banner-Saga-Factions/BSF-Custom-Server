#!/bin/sh
# Set every account's renown to one flat number. For testing renown-related
# features (rewards screens, purchase costs, promotion gating) against
# realistic-looking balances without playing hundreds of battles to earn it.
#
# Run it from a checkout on the server, standing anywhere:
#     sh deploy/add-renown-all-accounts.sh 10000
#
# This SETS renown to the given number for every account — it does not add to
# whatever a player currently has. Running it twice with the same number is a
# no-op the second time; running it with a number smaller than someone's real
# balance takes renown away from them.
#
# A player who is already logged in when this runs keeps seeing their old
# balance until they sign out and back in — the server caches each session's
# account data in memory for the life of the session and does not re-read the
# database mid-session (see bsf-server/.claude/rules/db.md).

set -eu

AMOUNT="${1:-}"
if [ -z "$AMOUNT" ]; then
    echo "usage: $0 <renown-amount>" >&2
    exit 1
fi
case "$AMOUNT" in
    ''|*[!0-9]*)
        echo "add-renown-all-accounts FAILED: amount must be a non-negative whole number, got '$AMOUNT'" >&2
        exit 1
        ;;
esac
# The game client holds renown in a 32-bit signed int (Legend.as:20) — above
# this the database would store it fine but the game would show it wrong.
if [ "$AMOUNT" -gt 2147483647 ]; then
    echo "add-renown-all-accounts FAILED: $AMOUNT exceeds the game's 32-bit renown display limit (2147483647)" >&2
    exit 1
fi

# Same derivation install.sh uses: this script lives at <checkout>/deploy, so
# its parent is the folder holding docker-compose.yml. No settings file to
# read and nothing to configure per machine.
DEPLOY_DIR=$(cd "$(dirname "$0")" && pwd)
COMPOSE_DIR=$(cd "$DEPLOY_DIR/.." && pwd)
if [ ! -f "$COMPOSE_DIR/docker-compose.yml" ]; then
    echo "add-renown-all-accounts FAILED: no docker-compose.yml in $COMPOSE_DIR" >&2
    exit 1
fi
cd "$COMPOSE_DIR"

COUNT=$(docker compose exec -T app node -e "
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(process.env.DB_PATH);
console.log(db.prepare('SELECT COUNT(*) AS n FROM accounts').get().n);
db.close();
")

echo "This will set renown to $AMOUNT for all $COUNT accounts, overwriting whatever each player has now."
printf "Type yes to continue: "
read -r CONFIRM
if [ "$CONFIRM" != "yes" ]; then
    echo "cancelled, nothing changed"
    exit 1
fi

# AMOUNT travels through an environment variable, not string interpolation
# into the JS source, so nothing about its content can change what this runs.
docker compose exec -T -e AMOUNT="$AMOUNT" app node -e "
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(process.env.DB_PATH);
const result = db.prepare('UPDATE accounts SET renown = ?').run(Number(process.env.AMOUNT));
console.log('accounts updated:', result.changes);
db.close();
"

echo "add-renown-all-accounts ok: renown set to $AMOUNT for $COUNT accounts"
