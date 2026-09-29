#!/usr/bin/env bash
#
# P1 Pulse backup — run on the Docker HOST, not inside the P1 Monitor container.
#
# Copies everything P1 Pulse needs that a container update can destroy:
#
#   custom.tar.gz      /p1mon/www/custom (the theme), without data/
#   solar.db           consistent snapshot of /p1mon/www/custom/data/solar.db
#   config.tar.gz      /p1mon/config (solplanet.ini credentials), if present
#   crontabs.tar.gz    the container's crontabs (the solar collector job), if present
#   host-crontab.txt   your own crontab on the host, in case the collector runs from there
#   container.json     `docker inspect` output: image, volumes, ports, env to recreate with
#   SHA256SUMS         checksums of all of the above
#
# The backup lands in ~/p1mon-backups/<timestamp>/ of the user who runs it — also under
# sudo, where it resolves the invoking user's home instead of /root.
#
# Usage:
#   ./backup-p1mon.sh                       # auto-detect the P1 Monitor container
#   ./backup-p1mon.sh -c p1monitor          # name the container explicitly
#   ./backup-p1mon.sh -o /some/other/dir    # different backup root
#
# Restore after the update: see "Restoring a backup" in docs/TECHNICAL.md.

set -euo pipefail

CUSTOM_DIR=/p1mon/www/custom
DB_PATH=$CUSTOM_DIR/data/solar.db
CONFIG_DIR=/p1mon/config
CRON_DIR=/var/spool/cron/crontabs
SNAPSHOT=/tmp/p1pulse-backup-solar.db

container=${P1MON_CONTAINER:-}
backup_root=

usage() { sed -n '3,/^$/s/^# \{0,1\}//p' "$0"; }
die()   { echo "ERROR: $*" >&2; exit 1; }
info()  { echo "==> $*"; }
warn()  { echo "WARN: $*" >&2; }

while getopts ':c:o:h' opt; do
    case $opt in
        c) container=$OPTARG ;;
        o) backup_root=$OPTARG ;;
        h) usage; exit 0 ;;
        *) usage >&2; exit 2 ;;
    esac
done

command -v docker >/dev/null || die "docker not found. Run this on the host that runs the container."
docker info >/dev/null 2>&1 || die "cannot talk to Docker. Add yourself to the 'docker' group or run with sudo."

# Home of the person running this, also under sudo.
owner=${SUDO_USER:-$(id -un)}
owner_home=$(getent passwd "$owner" | cut -d: -f6)
[ -n "$owner_home" ] || owner_home=$HOME
backup_root=${backup_root:-$owner_home/p1mon-backups}

# --- Find the container -----------------------------------------------------------------------

if [ -z "$container" ]; then
    mapfile -t candidates < <(docker ps --format '{{.Names}}\t{{.Image}}' | grep -i 'p1mon' | cut -f1)
    case ${#candidates[@]} in
        1) container=${candidates[0]} ;;
        0) die "no running container with 'p1mon' in its name or image. Pass it with -c NAME (see: docker ps)." ;;
        *) die "several candidates: ${candidates[*]}. Pass one with -c NAME." ;;
    esac
fi

[ "$(docker inspect -f '{{.State.Running}}' "$container" 2>/dev/null)" = true ] \
    || die "container '$container' is not running. Back up before stopping it."

in_container() { docker exec "$container" "$@"; }
exists_in_container() { in_container test -e "$1"; }

exists_in_container "$CUSTOM_DIR" || die "$CUSTOM_DIR not found in '$container'. Is this the P1 Monitor container?"

stamp=$(date +%Y%m%d-%H%M%S)
dest=$backup_root/$stamp
mkdir -p "$dest"
chmod 700 "$dest"   # solplanet.ini holds credentials

info "Container: $container"
info "Backup to: $dest"

# --- Theme files ------------------------------------------------------------------------------

# data/ is excluded here: copying a live SQLite file can catch it mid-write. It gets a proper
# snapshot below instead.
info "Theme files ($CUSTOM_DIR)"
in_container tar -C "$(dirname "$CUSTOM_DIR")" --exclude="$(basename "$CUSTOM_DIR")/data" \
    -czf - "$(basename "$CUSTOM_DIR")" > "$dest/custom.tar.gz"

# --- Solar database ---------------------------------------------------------------------------

if exists_in_container "$DB_PATH"; then
    info "Solar database ($DB_PATH)"
    in_container rm -f "$SNAPSHOT"

    # VACUUM INTO takes a transactionally consistent copy even while the collector writes.
    # php is always present in the container; sqlite3 usually is not.
    if in_container php -r '
            $db = new PDO("sqlite:" . $argv[1], null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
            $db->exec("VACUUM INTO " . $db->quote($argv[2]));' "$DB_PATH" "$SNAPSHOT" 2>/dev/null; then
        :
    elif in_container sh -c 'command -v sqlite3' >/dev/null 2>&1 \
            && in_container sqlite3 "$DB_PATH" ".backup '$SNAPSHOT'"; then
        :
    else
        warn "no consistent-snapshot method available; copying the file as-is."
        warn "the collector may be writing — check solar.db after restoring."
        in_container cp "$DB_PATH" "$SNAPSHOT"
    fi

    integrity=$(in_container php -r '
        $db = new PDO("sqlite:" . $argv[1]);
        echo $db->query("PRAGMA integrity_check")->fetchColumn();' "$SNAPSHOT" 2>/dev/null || echo "not checked")
    [ "$integrity" = ok ] || warn "integrity check of the snapshot: $integrity"

    docker cp "$container:$SNAPSHOT" "$dest/solar.db"
    in_container rm -f "$SNAPSHOT"
else
    warn "$DB_PATH not found in the container — skipped."
fi

# --- Credentials and cron ---------------------------------------------------------------------

if exists_in_container "$CONFIG_DIR"; then
    info "Config ($CONFIG_DIR)"
    in_container tar -C "$(dirname "$CONFIG_DIR")" -czf - "$(basename "$CONFIG_DIR")" > "$dest/config.tar.gz"
else
    warn "$CONFIG_DIR not found in the container — skipped (solplanet.ini may live elsewhere)."
fi

if exists_in_container "$CRON_DIR"; then
    info "Container crontabs ($CRON_DIR)"
    in_container tar -C / -czf - "${CRON_DIR#/}" > "$dest/crontabs.tar.gz"
fi

if crontab -u "$owner" -l > "$dest/host-crontab.txt" 2>/dev/null; then
    info "Host crontab of $owner"
else
    rm -f "$dest/host-crontab.txt"
fi

docker inspect "$container" > "$dest/container.json"

# --- Finish -----------------------------------------------------------------------------------

(cd "$dest" && sha256sum -- * > SHA256SUMS)

if [ "$(id -u)" = 0 ] && [ "$owner" != root ]; then
    chown -R "$owner:" "$backup_root"
fi

echo
info "Done. Contents of $dest:"
ls -lh "$dest"
if [ -f "$dest/solar.db" ]; then
    echo
    echo "Solar database integrity: $integrity"
fi
