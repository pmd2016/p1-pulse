#!/usr/bin/env bash
#
# P1 Pulse restore — run on the Docker HOST, after updating the P1 Monitor container.
#
# Puts back what backup-p1mon.sh saved:
#
#   theme      custom.tar.gz  -> /p1mon/www/custom   (an existing custom/ is moved aside, not deleted)
#   database   solar.db       -> /p1mon/www/custom/data/solar.db, with its original owner and mode
#   config     config.tar.gz  -> /p1mon/config        (solplanet.ini)
#   cron       crontabs.tar.gz: only the lines that run scripts in /p1mon/www/custom are added to
#              the matching user's crontab. P1 Monitor's own jobs come from the new version and
#              are left alone.
#
# Every file is checked against SHA256SUMS before anything in the container is touched.
#
# Usage:
#   ./restore-p1mon.sh                            # newest backup in ~/p1mon-backups
#   ./restore-p1mon.sh ~/p1mon-backups/20260929-113441
#   ./restore-p1mon.sh -c p1monitor               # name the container explicitly
#   ./restore-p1mon.sh -y                         # don't ask for confirmation

set -euo pipefail

CUSTOM_DIR=/p1mon/www/custom
DB_PATH=$CUSTOM_DIR/data/solar.db
CONFIG_DIR=/p1mon/config

container=${P1MON_CONTAINER:-}
assume_yes=false

usage() { sed -n '3,/^$/s/^# \{0,1\}//p' "$0"; }
die()   { echo "ERROR: $*" >&2; exit 1; }
info()  { echo "==> $*"; }
warn()  { echo "WARN: $*" >&2; }

while getopts ':c:yh' opt; do
    case $opt in
        c) container=$OPTARG ;;
        y) assume_yes=true ;;
        h) usage; exit 0 ;;
        *) usage >&2; exit 2 ;;
    esac
done
shift $((OPTIND - 1))

command -v docker >/dev/null || die "docker not found. Run this on the host that runs the container."
docker info >/dev/null 2>&1 || die "cannot talk to Docker. Add yourself to the 'docker' group or run with sudo."

# --- Find the backup --------------------------------------------------------------------------

owner=${SUDO_USER:-$(id -un)}
owner_home=$(getent passwd "$owner" | cut -d: -f6)
[ -n "$owner_home" ] || owner_home=$HOME

if [ $# -ge 1 ]; then
    src=${1%/}
else
    src=$(find "$owner_home/p1mon-backups" -mindepth 1 -maxdepth 1 -type d -name '20*' 2>/dev/null | sort | tail -n 1 || true)
    [ -n "$src" ] || die "no backups in $owner_home/p1mon-backups. Pass the backup folder as an argument."
fi
[ -d "$src" ] || die "backup folder not found: $src"
[ -f "$src/SHA256SUMS" ] || die "$src has no SHA256SUMS — not a backup-p1mon.sh backup?"

info "Checking backup files"
(cd "$src" && sha256sum --quiet -c SHA256SUMS) || die "checksum mismatch in $src — backup is damaged, nothing restored."

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
    || die "container '$container' is not running. Start the updated container first."

in_container() { docker exec "$container" "$@"; }
exists_in_container() { in_container test -e "$1"; }

exists_in_container "$(dirname "$CUSTOM_DIR")" \
    || die "$(dirname "$CUSTOM_DIR") not found in '$container'. Is this the P1 Monitor container?"

# --- Confirm ----------------------------------------------------------------------------------

stamp=$(date +%Y%m%d-%H%M%S)
aside=$CUSTOM_DIR.pre-restore-$stamp

echo
echo "Restore from:  $src"
echo "Into:          $container ($(docker inspect -f '{{.Config.Image}}' "$container"))"
echo
[ -f "$src/custom.tar.gz" ]   && echo "  - theme      -> $CUSTOM_DIR"
exists_in_container "$CUSTOM_DIR" && echo "                 (current one moved to $aside)"
[ -f "$src/solar.db" ]        && echo "  - database   -> $DB_PATH"
[ -f "$src/config.tar.gz" ]   && echo "  - config     -> $CONFIG_DIR"
[ -f "$src/crontabs.tar.gz" ] && echo "  - cron lines for $CUSTOM_DIR"
echo

if ! $assume_yes; then
    read -r -p "Continue? [y/N] " answer
    [[ $answer =~ ^[Yy] ]] || { echo "Nothing restored."; exit 1; }
fi

# --- Theme ------------------------------------------------------------------------------------

if [ -f "$src/custom.tar.gz" ]; then
    if exists_in_container "$CUSTOM_DIR"; then
        info "Moving current theme aside to $aside"
        in_container mv "$CUSTOM_DIR" "$aside"
    fi
    info "Theme files"
    # Extracting as root keeps the owners and modes the files had in the old container.
    docker exec -i "$container" tar -C "$(dirname "$CUSTOM_DIR")" -xzf - < "$src/custom.tar.gz"
else
    warn "no custom.tar.gz in the backup — theme not restored."
fi

# --- Database ---------------------------------------------------------------------------------

if [ -f "$src/solar.db" ]; then
    info "Solar database"
    data_dir=$(dirname "$DB_PATH")
    in_container mkdir -p "$data_dir"
    docker cp "$src/solar.db" "$container:$DB_PATH"

    if [ -f "$src/ownership.txt" ]; then
        while read -r owner_group mode path; do
            [ -n "$path" ] || continue
            in_container chown "$owner_group" "$path" 2>/dev/null \
                || warn "could not chown $path to $owner_group (user missing in the new version?)"
            in_container chmod "$mode" "$path"
        done < "$src/ownership.txt"
    else
        # Older backup without ownership.txt: follow the theme directory.
        in_container chown --reference="$CUSTOM_DIR" "$data_dir" "$DB_PATH"
    fi

    integrity=$(in_container php -r '
        $db = new PDO("sqlite:" . $argv[1]);
        echo $db->query("PRAGMA integrity_check")->fetchColumn();' "$DB_PATH" 2>/dev/null || echo "not checked")
    [ "$integrity" = ok ] || warn "integrity check of the restored database: $integrity"
fi

# --- Config -----------------------------------------------------------------------------------

if [ -f "$src/config.tar.gz" ]; then
    info "Config ($CONFIG_DIR)"
    docker exec -i "$container" tar -C "$(dirname "$CONFIG_DIR")" -xzf - < "$src/config.tar.gz"
fi

# --- Cron -------------------------------------------------------------------------------------

cron_added=0
if [ -f "$src/crontabs.tar.gz" ]; then
    info "Cron jobs for $CUSTOM_DIR"
    tmp=$(mktemp -d)
    trap 'rm -rf "$tmp"' EXIT
    tar -C "$tmp" -xzf "$src/crontabs.tar.gz"

    for file in "$tmp"/var/spool/cron/crontabs/*; do
        [ -f "$file" ] || continue
        user=$(basename "$file")
        wanted=$(grep -v '^[[:space:]]*#' "$file" | grep -F "$CUSTOM_DIR" || true)
        [ -n "$wanted" ] || continue

        if ! in_container id "$user" >/dev/null 2>&1; then
            warn "user '$user' does not exist in the new container; add these by hand:"
            echo "$wanted" >&2
            continue
        fi

        current=$(in_container crontab -u "$user" -l 2>/dev/null || true)
        missing=$(grep -vxF -f <(printf '%s\n' "$current") <<< "$wanted" || true)
        if [ -z "$missing" ]; then
            echo "    $user: already present"
            continue
        fi

        { [ -n "$current" ] && printf '%s\n' "$current"; printf '%s\n' "$missing"; } \
            | docker exec -i "$container" crontab -u "$user" -
        echo "$missing" | sed "s/^/    $user: added  /"
        cron_added=$((cron_added + $(grep -c '' <<< "$missing")))
    done
fi

if [ -f "$src/host-crontab.txt" ] && grep -qF "$CUSTOM_DIR" "$src/host-crontab.txt"; then
    warn "your host crontab also referred to $CUSTOM_DIR — check it with: crontab -l"
fi

# --- Finish -----------------------------------------------------------------------------------

echo
info "Done."
[ -n "${integrity:-}" ] && echo "Solar database integrity: $integrity"
[ -f "$src/crontabs.tar.gz" ] && echo "Cron lines added:         $cron_added"
if exists_in_container "$aside"; then
    echo "Previous theme kept at:   $aside (remove once all is well)"
fi
echo
echo "Next: docker exec $container php $CUSTOM_DIR/scripts/solar-diagnostics.php"
echo "      and open /custom/p1mon.php to check the theme against the new P1 Monitor version."
