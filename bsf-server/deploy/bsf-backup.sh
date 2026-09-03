#!/bin/sh
# Nightly database backup.
#
# Takes a consistent snapshot of the live game database, compresses it, proves
# the result really is a database, uploads it to a Cloud Storage bucket, and
# keeps a few recent copies on this machine for a fast restore.
#
# Installed at /usr/local/bin/bsf-backup.sh. Runs on a schedule from
# bsf-backup.timer, and by hand with:
#     sudo /usr/local/bin/bsf-backup.sh
#
# The whole point is that the uploaded copy is somewhere this machine's own
# destruction cannot reach. On 2026-09-01 the production VM was deleted and it
# held the only copy of every account, rating and battle record — including the
# "backups", which were on the machine they were protecting. Nothing was
# recoverable. Do not change BUCKET to a path on this VM.

set -eu

# --- machine settings -------------------------------------------------------
# All three deploy scripts read one shared settings file. BSF_DEPLOY_CONF lets
# you point at a different one (useful for a test machine or a dry run);
# everything else uses /etc/bsf-deploy.conf.
#
# The script reads the settings itself rather than relying on the service
# manager to hand them over, because this script is meant to be run by hand as
# often as it is run on a timer — and settings supplied only by the service
# manager would silently be missing on every hand-run.
CONF="${BSF_DEPLOY_CONF:-/etc/bsf-deploy.conf}"
if [ ! -r "$CONF" ]; then
    echo "backup FAILED: cannot read settings file $CONF" >&2
    echo "  Install it with: sudo deploy/install.sh" >&2
    exit 1
fi
# The settings file is plain KEY=value lines; "." runs it in this shell.
. "$CONF"

# Refuse a half-filled settings file rather than guessing. Without COMPOSE_DIR
# we would run "docker compose" in the wrong folder and back up nothing;
# without BUCKET we would produce an archive and leave it on the machine it is
# supposed to be protecting us from losing.
if [ -z "${COMPOSE_DIR:-}" ]; then
    echo "backup FAILED: COMPOSE_DIR is not set in $CONF" >&2
    exit 1
fi
if [ -z "${BUCKET:-}" ]; then
    echo "backup FAILED: BUCKET is not set in $CONF" >&2
    exit 1
fi
# A missing setting fails loudly; a WRONG one succeeds and puts this machine's
# data into another server's history, where a later restore can pick it up by
# mistake. So the shipped placeholder is refused too, and refused here — before
# any snapshot is taken — rather than after the work is done.
case "$BUCKET" in
    *YOUR-BUCKET*)
        echo "backup FAILED: BUCKET is still the placeholder in $CONF" >&2
        echo "  Set it to the bucket THIS server should upload to, including gs://." >&2
        echo "  It must not be a folder on this machine, and it must not be a bucket" >&2
        echo "  another server already writes to — the archive names say only when" >&2
        echo "  they were made, not which machine made them, so two servers sharing" >&2
        echo "  one bucket can restore each other's database without complaint." >&2
        exit 1
        ;;
esac
# These two have sensible defaults, so an older settings file still works.
LOCAL="${LOCAL:-/var/backups/bsf}"
KEEP="${KEEP:-3}"

# --- the backup itself ------------------------------------------------------
TMP_IN_VOL=/data/_backup_tmp.db
TS=$(date -u +%Y%m%dT%H%M%SZ)
NAME="bsf-db_${TS}.db.gz"

mkdir -p "$LOCAL"
cd "$COMPOSE_DIR"

# Ask SQLite for a single-file consistent snapshot, written inside the volume.
#
# Why not just copy the database file? Because SQLite keeps recent writes in a
# separate write-ahead log beside it and folds them in later. A copier reads
# the two files at two different instants, so if a fold happens in between, the
# copy pairs an OLD database with a NEWER log. That restores without complaint
# and is quietly wrong — worse than an obvious failure. Measured on this server
# on 2026-09-01, the log was FORTY-SEVEN times the size of the database, so
# nearly all the data sat in the part most likely to move. VACUUM INTO hands
# the job to SQLite, which knows what a consistent moment looks like.
docker compose exec -T app node -e "
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
try { fs.unlinkSync('$TMP_IN_VOL'); } catch (e) {}
const db = new DatabaseSync(process.env.DB_PATH);
db.exec(\"VACUUM INTO '$TMP_IN_VOL'\");
db.close();
"

# Bring it out of the volume and compress it.
docker compose exec -T app cat "$TMP_IN_VOL" | gzip -c > "${LOCAL}/${NAME}"
docker compose exec -T app rm -f "$TMP_IN_VOL"

# A file that is not verifiably a database is not a backup.
#
# THIS CHECK IS LOAD-BEARING — do not remove it as a belt-and-braces extra.
# The line above is a pipeline, and a POSIX shell reports only the status of
# the LAST command in a pipeline. So if the "docker compose exec ... cat" half
# fails — container stopped, snapshot missing, docker unavailable — gzip still
# succeeds at compressing the nothing it received, "set -e" sees a success, and
# we are left with a perfectly well-formed EMPTY archive. Uploaded nightly,
# that quietly replaces real history with junk, and you find out on the day you
# need to restore. Reading the first 15 bytes back and insisting they say
# "SQLite format 3" is what turns that silent failure into a loud one.
if [ "$(gzip -dc "${LOCAL}/${NAME}" | head -c 15)" != "SQLite format 3" ]; then
    echo "backup FAILED: archive is not a SQLite database" >&2
    rm -f "${LOCAL}/${NAME}"
    exit 1
fi

gcloud storage cp "${LOCAL}/${NAME}" "${BUCKET}/${NAME}" --quiet

# Keep the KEEP most recent copies locally for a fast restore; the bucket
# holds the real history and expires objects by lifecycle rule.
# "tail -n +N" prints from line N onward, so with KEEP=3 we delete from the
# 4th-newest down.
ls -1t "${LOCAL}"/bsf-db_*.db.gz 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -f

echo "backup ok: ${NAME} ($(stat -c %s "${LOCAL}/${NAME}") bytes, verified SQLite)"
