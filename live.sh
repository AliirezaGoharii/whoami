#!/usr/bin/env bash
# Serve this folder with Python and publish it through a temporary public URL.
#
#   ./live.sh          # Cloudflare quick tunnel (primary)
#   ./live.sh ssh      # localhost.run over SSH (backup, useful if Cloudflare is unreachable)
#
# The public URL is printed here and saved in $TMPDIR/portfolio-url.txt
set -u

DIR="$(cd "$(dirname "$0")" && pwd)"
python3 "$DIR/build.py" || exit 1
PORT="${PORT:-8000}"
TMP="${TMPDIR:-${PREFIX:-/tmp}/tmp}"
mkdir -p "$TMP"
LOG="$TMP/portfolio-live.log"
URLFILE="$TMP/portfolio-url.txt"
MODE="${1:-cf}"

# --- local web server -------------------------------------------------------
if ! curl -sf -o /dev/null "http://127.0.0.1:$PORT/index.html"; then
    nohup python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$DIR" \
        >>"$TMP/portfolio-http.log" 2>&1 &
    sleep 1
fi
echo "local: http://127.0.0.1:$PORT/  (serving $DIR)"

# --- public tunnel ----------------------------------------------------------
if [ "$MODE" = "ssh" ]; then
    while true; do
        ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
            -o ServerAliveInterval=30 -o ExitOnForwardFailure=yes \
            -R 80:localhost:"$PORT" nokey@localhost.run 2>&1 |
            while IFS= read -r line; do
                printf '%s\n' "$line" >>"$LOG"
                url="$(printf '%s' "$line" | grep -oE 'https://[a-z0-9]+\.lhr\.life' | head -1)"
                if [ -n "${url:-}" ]; then
                    printf '%s\n' "$url" | tee "$URLFILE"
                fi
            done
        echo "tunnel closed, reconnecting..." >&2
        sleep 3
    done
else
    while true; do
        cloudflared tunnel --no-autoupdate --url "http://127.0.0.1:$PORT" 2>&1 |
            while IFS= read -r line; do
                printf '%s\n' "$line" >>"$LOG"
                url="$(printf '%s' "$line" | grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' | head -1)"
                if [ -n "${url:-}" ]; then
                    printf '%s\n' "$url" | tee "$URLFILE"
                fi
            done
        echo "tunnel closed, reconnecting..." >&2
        sleep 3
    done
fi
