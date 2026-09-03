# Deployment files

## Co-Authored-By: Claude

Everything in this folder gets installed **onto the server machine**, not into the
application. These are the pieces that keep the server alive between visits: the nightly
copy of the database to somewhere safe, and the job that keeps the server's name pointing
at the right address.

They live here as real files because for a while they did not live anywhere at all. Two of
them existed only as text inside `docs/Deployment.md`, one existed only as a *sentence
describing what it should do*, and the four scheduling files had never been written down in
any form. That meant the repository could not actually rebuild the server — you would have
had to copy code out of a document and invent the rest. It also quietly contradicted a
decision recorded in `docs/idea-triage.md`, which chose not to take pictures of the whole
machine on the grounds that "the machine is the reproducible part".

---

## What each file is

| File | Installs to | What it does |
|---|---|---|
| `bsf-deploy.conf.example` | `/etc/bsf-deploy.conf` | The settings every script reads — where the checkout is, which bucket, which DNS name |
| `bsf-backup.sh` | `/usr/local/bin/` | Takes a safe copy of the database and uploads it off the machine |
| `duckdns-update.sh` | `/usr/local/bin/` | Tells the naming service where this machine currently is |
| `duckdns-set-token` | `/usr/local/bin/` | Stores the naming service's password safely, then proves it works |
| `bsf-backup.service` + `.timer` | `/etc/systemd/system/` | Runs the backup every night at 03:15 UTC |
| `duckdns.service` + `.timer` | `/etc/systemd/system/` | Runs the address update a minute after boot, then every five minutes |
| `inspect-db.mjs` | — | Not installed. Copied into the running container when restoring a backup, to say what a database file holds and where it came from |
| `install.sh` | — | Puts all of the above in place. Switches nothing on |

---

## Why one shared settings file

The three scripts read their settings from `/etc/bsf-deploy.conf`, which they load
themselves rather than having the values handed to them by the scheduler.

That choice is deliberate. All three are meant to be runnable by hand — the deployment
guide tells you to run `sudo /usr/local/bin/bsf-backup.sh` before every deploy, and
`duckdns-set-token` is only ever run by a person. If the settings arrived from the
scheduler, running a script by hand would silently supply nothing, and it would fail
somewhere unhelpful rather than at the first line. Reading the file directly means a
hand-run and a scheduled run behave identically, which is the property a runbook needs.

`install.sh` fills in the one setting that differs on every machine — where the checkout
lives — **from its own location on disk**. That is what removes the hardcoded home folder
the original scripts carried, and it cannot be wrong, because the installer is standing in
the folder it is describing.

---

## Installing

```sh
sudo ./deploy/install.sh
```

Then open `/etc/bsf-deploy.conf` and check two things: that `BUCKET` names the bucket this
machine should upload to, and that `DUCKDNS_DOMAIN` is correct for this machine — see the
warning below.

**The installer switches nothing on.** That is not an oversight. Starting the address
updater on the wrong machine points the live hostname at that machine, and every player
follows it there while the real server carries on looking perfectly healthy. Turning
something on is always a deliberate act:

```sh
sudo systemctl enable --now bsf-backup.timer
sudo /usr/local/bin/bsf-backup.sh          # run one now to prove it works
systemctl list-timers bsf-backup.timer
```

---

## Check before you switch anything on

Three commands, none of which change anything:

```sh
sh -n deploy/bsf-backup.sh                        # does the script parse?
systemd-analyze verify /etc/systemd/system/bsf-backup.timer   # silence means valid
systemd-analyze calendar '*-*-* 03:15:00 UTC'     # when will it actually run?
```

The third one matters more than it looks. If the schedule is written in a form the system
cannot understand, the job does not complain — it simply **never runs**, and you find out
when you need a backup that was never taken. The command prints the next time it will fire,
which is the only proof worth having.

*Verified on Debian 12 on 2026-09-02: `Next elapse: Thu 2026-09-03 03:15:00 UTC`. Not yet
checked on Ubuntu 22.04, whose system software is older and may not accept the time-zone
suffix.*

---

## Has the installed copy drifted?

The files on the machine are copies. To see whether someone has edited one in place:

```sh
diff /usr/local/bin/bsf-backup.sh deploy/bsf-backup.sh
```

Silence means they match. Anything else is a change that exists only on that machine and
will be lost the next time it is rebuilt.

---

## The one dangerous setting

`DUCKDNS_DOMAIN` is **empty by default, and must stay empty** on every machine except the
one that genuinely owns the name.

Filling it in is what claims the hostname. Do it on a test machine, start the timer, and
your players are sent to the test machine — while every check of the real server comes back
healthy, because the real server is fine. It is the address that moved. That combination is
what makes it slow and expensive to diagnose.

With the setting empty, the updater refuses to run and says why, rather than guessing. Two
other things guard the same mistake: the installer enables no timers, and the token that
authorises the change is stored separately in a file only the administrator can read.

**Treat the token as a password.** Anyone holding it can point any of your names at a
machine of their own and collect your players' sign-ins. If it is ever exposed — pasted
into a chat window, committed, written to a log — create a new one and store it again with
`duckdns-set-token`.
