#!/usr/bin/env bash
# Download k6 (no sudo) if needed, then run the smoke + load tests against BASE_URL.
cd /home/rami/projects/nano-kyc-watch || exit 1

K6_DIR="$PWD/.k6bin"
K6="$K6_DIR/k6"
BASE_URL="${BASE_URL:-http://localhost:3000}"
export BASE_URL

fetch() {
  if command -v curl >/dev/null 2>&1; then curl -fsSL "$1" -o "$2"; else wget -qO "$2" "$1"; fi
}

if [ ! -x "$K6" ]; then
  mkdir -p "$K6_DIR"
  TAG=$(fetch https://api.github.com/repos/grafana/k6/releases/latest - 2>/dev/null | grep -oE '"tag_name"[[:space:]]*:[[:space:]]*"v[0-9.]+"' | grep -oE 'v[0-9.]+' | head -1)
  if [ -z "$TAG" ]; then TAG="v0.55.0"; fi
  URL="https://github.com/grafana/k6/releases/download/${TAG}/k6-${TAG}-linux-amd64.tar.gz"
  echo "Downloading k6 ${TAG} from ${URL}"
  fetch "$URL" /tmp/k6.tar.gz || { echo "k6 download failed"; exit 2; }
  tar -xzf /tmp/k6.tar.gz -C "$K6_DIR" --strip-components=1 || { echo "extract failed"; exit 3; }
fi

echo "k6 binary: $("$K6" version)"
echo "Target: $BASE_URL"
echo ""
echo "========================= SMOKE ========================="
"$K6" run tests/k6/smoke.js
SMOKE=$?
echo ""
echo "========================= LOAD =========================="
"$K6" run tests/k6/load.js
LOAD=$?
echo ""
echo "SMOKE_EXIT=$SMOKE LOAD_EXIT=$LOAD"
