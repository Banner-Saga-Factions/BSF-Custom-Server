#!/bin/sh
# Install the BSF deployment scripts, schedules and settings file onto this VM.
#
# Run it as root from the checkout:
#     sudo bsf-server/deploy/install.sh
#
# Safe to run again as many times as you like. Re-running refreshes the scripts
# and the schedules with whatever the checkout now contains, which is exactly
# what you want after a "git pull". The one thing it will never overwrite is
# this machine's settings file.
#
# IT DOES NOT SWITCH ANYTHING ON. It installs and then tells you what to
# enable. That is a safety decision, not tidiness: switching the DNS schedule
# on from a script means that installing on a test machine, a spare, or a
# restored image would repoint the live hostname at that machine and send every
# player to it — while the real server carries on looking perfectly healthy.
# Turning that on has to be a thing a person does on purpose, on one machine.

set -eu

if [ "$(id -u)" -ne 0 ]; then
    echo "install.sh: must be run as root. Try: sudo bsf-server/deploy/install.sh" >&2
    exit 1
fi

# --- work out where things are ----------------------------------------------
# Everything is derived from where this script actually sits, so there is no
# path to get wrong and nothing to edit per machine. This folder is
# <checkout>/bsf-server/deploy, so its parent is the folder holding
# docker-compose.yml — which is precisely what COMPOSE_DIR has to be.
#
# "cd ... && pwd" turns a relative path like "./deploy" into a full one, which
# matters because the settings file records it for other scripts to use later.
DEPLOY_DIR=$(cd "$(dirname "$0")" && pwd)
COMPOSE_DIR=$(cd "$DEPLOY_DIR/.." && pwd)

BIN_DIR=/usr/local/bin
UNIT_DIR=/etc/systemd/system
CONF=/etc/bsf-deploy.conf

# Refuse early if this is not the folder we think it is, rather than writing a
# settings file that points somewhere with no server in it.
if [ ! -f "$COMPOSE_DIR/docker-compose.yml" ]; then
    echo "install.sh: no docker-compose.yml in $COMPOSE_DIR" >&2
    echo "  Run this from the deploy/ folder of a BSF-Custom-Server checkout." >&2
    exit 1
fi

echo "Installing from : $DEPLOY_DIR"
echo "Server folder   : $COMPOSE_DIR"
echo

# --- the three scripts ------------------------------------------------------
# 0755: root may edit them, anybody may run them. "install" sets the contents,
# owner and permissions in one step, so the file is never momentarily wrong.
for f in bsf-backup.sh duckdns-update.sh duckdns-set-token; do
    install -o root -g root -m 0755 "$DEPLOY_DIR/$f" "$BIN_DIR/$f"
    echo "  installed $BIN_DIR/$f"
done

# --- the four schedule files ------------------------------------------------
# 0644: these are read by the service manager, not run directly, so they need
# no execute permission.
for f in bsf-backup.service bsf-backup.timer duckdns.service duckdns.timer; do
    install -o root -g root -m 0644 "$DEPLOY_DIR/$f" "$UNIT_DIR/$f"
    echo "  installed $UNIT_DIR/$f"
done

# --- this machine's settings ------------------------------------------------
# Created from the template ONLY if it is not already there. This file holds
# decisions someone made about this specific machine — which bucket, and above
# all whether this machine owns the DNS name. Overwriting it on every install
# would quietly undo those decisions, and the DNS one is the dangerous half:
# a re-install must never be able to hand a spare machine the live hostname.
if [ -f "$CONF" ]; then
    echo
    echo "  kept existing $CONF (not overwritten)"
    echo "  Compare it against the template if new settings have been added:"
    echo "      diff $CONF $DEPLOY_DIR/bsf-deploy.conf.example"
else
    install -o root -g root -m 0644 "$DEPLOY_DIR/bsf-deploy.conf.example" "$CONF"
    # Fill in the one value we can work out for certain, so nobody has to
    # hand-edit a path that this script already knows.
    sed -i "s|^COMPOSE_DIR=.*|COMPOSE_DIR=$COMPOSE_DIR|" "$CONF"
    echo
    echo "  created $CONF with COMPOSE_DIR=$COMPOSE_DIR"
    echo "  DUCKDNS_DOMAIN is empty, so the DNS updater will refuse to run."
fi

# --- let the service manager notice the new files ---------------------------
systemctl daemon-reload
echo
echo "  reloaded systemd"

# --- what to do next --------------------------------------------------------
cat <<'NEXT'

Installed. NOTHING has been switched on — do that yourself, deliberately:

  Nightly backup (safe on any machine that has the database):
      sudo systemctl enable --now bsf-backup.timer
      sudo /usr/local/bin/bsf-backup.sh      # run one now to prove it works
      systemctl list-timers bsf-backup.timer

  DNS updater — ONLY on the machine that owns the DNS name:
      Editing DUCKDNS_DOMAIN is what claims the hostname. On the wrong
      machine this sends every player to the wrong server, and the right
      server keeps looking perfectly healthy, so the fault is slow to find.

      sudo nano /etc/bsf-deploy.conf         # set DUCKDNS_DOMAIN, label only
      sudo duckdns-set-token                 # stores the token and tests it
      sudo systemctl enable --now duckdns.timer
      journalctl -u duckdns.service -n 5     # expect "duckdns: OK"

NEXT
