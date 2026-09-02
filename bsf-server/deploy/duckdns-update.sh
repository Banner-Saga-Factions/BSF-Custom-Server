#!/bin/sh
# Keep the DuckDNS hostname pointing at this machine.
#
# Installed at /usr/local/bin/duckdns-update.sh. Runs one minute after boot and
# every five minutes thereafter from duckdns.timer, and by hand with:
#     sudo /usr/local/bin/duckdns-update.sh
#
# WHY THIS EXISTS
# This VM has no reserved address. Stopping and starting it releases the
# address and hands back a different one, with no guarantee it is the same.
# When that happens the hostname points at nothing while the server itself
# keeps running perfectly — so every check of the server process comes back
# healthy and the real fault is slow to spot.
#
# The request below tells DuckDNS "whatever address this request arrived from
# is my address" (that is what the empty ip= means). Nothing has to work out
# the machine's public address, because the one party that reliably knows it is
# the service being told.

set -eu

# --- machine settings -------------------------------------------------------
# Shared with the other deploy scripts. Read here rather than supplied by the
# service manager, so a hand-run behaves exactly like a timer-run.
CONF="${BSF_DEPLOY_CONF:-/etc/bsf-deploy.conf}"
if [ ! -r "$CONF" ]; then
    echo "duckdns: cannot read settings file $CONF" >&2
    exit 1
fi
. "$CONF"

DOMAIN="${DUCKDNS_DOMAIN:-}"
TOKEN_FILE="${DUCKDNS_TOKEN_FILE:-/etc/duckdns/token}"

# REFUSE RATHER THAN GUESS. An unconfigured machine must not claim a name it
# does not own. If this ran with a guessed or inherited domain on a test VM, a
# spare, or a restored image, it would repoint the live hostname at THIS
# machine and send every player here instead of to the real server — while the
# real server carries on looking perfectly healthy. Empty is the shipped
# default precisely so that a machine nobody has configured does nothing.
if [ -z "$DOMAIN" ]; then
    echo "duckdns: DUCKDNS_DOMAIN is empty in $CONF — refusing to update." >&2
    echo "  Set it ONLY on the machine that owns the DNS name. It is the" >&2
    echo "  subdomain label alone, with no .duckdns.org (e.g. bsf-server)." >&2
    exit 1
fi

# A missing or empty token is a different case: it means "this machine is not
# doing DNS updates", which is a normal state, so exit successfully and stay
# quiet in the logs rather than reporting a failure every five minutes.
[ -s "$TOKEN_FILE" ] || { echo "duckdns: token file empty, skipping"; exit 0; }

# Strip every whitespace character. A token pasted from a web page often
# arrives with a trailing newline, a stray space, or a label attached.
TOKEN=$(tr -d '[:space:]' < "$TOKEN_FILE")
case "$TOKEN" in
    ????????-????-????-????-????????????) : ;;
    *) echo "duckdns: token is not a 36-character UUID (got ${#TOKEN} chars)"; exit 1 ;;
esac

# Feed the URL through curl's config file on stdin rather than as an argument,
# so the token never appears in the process list.
#
# Anything on a command line is readable by every user on the machine for as
# long as the command runs (it shows up in "ps"). Passing the URL on curl's
# standard input with "-K -" keeps the token inside the pipe between these two
# processes, where nothing else can read it.
RESP=$(printf 'url = https://www.duckdns.org/update?domains=%s&token=%s&ip=\n' \
    "$DOMAIN" "$TOKEN" | curl -fsS -K - || echo FAIL)
echo "duckdns: $RESP"
[ "$RESP" = "OK" ]
