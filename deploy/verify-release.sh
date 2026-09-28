#!/usr/bin/env bash
set -Eeuo pipefail

TEST_USER="codex-release-check"
TEST_PASS="$(openssl rand -hex 16)"
API="http://127.0.0.1:3407"
TMP_DIR="$(mktemp -d)"

cleanup() {
  curl -fsS -X DELETE \
    -H 'X-Remote-User: david' \
    -H 'X-Requested-With: signalerfassung-admin' \
    "$API/admin/api/users/$TEST_USER" >/dev/null 2>&1 || true
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

curl -fsS \
  -H 'X-Remote-User: david' \
  "$API/admin/api/session" | grep -q '"username":"david"'

curl -fsS -X POST \
  -H 'Content-Type: application/json' \
  -H 'X-Remote-User: david' \
  -H 'X-Requested-With: signalerfassung-admin' \
  --data "{\"username\":\"$TEST_USER\",\"password\":\"$TEST_PASS\"}" \
  "$API/admin/api/users" | grep -q '"ok":true'

curl -fsS https://signalerfassung.com/ -o "$TMP_DIR/index.html"
curl -fsS -u "$TEST_USER:$TEST_PASS" https://signalerfassung.com/signalerfassung-analyse-tool.html -o "$TMP_DIR/app.html"
curl -fsS https://signalerfassung.com/assets/help.js -o "$TMP_DIR/help.js"
curl -fsS https://signalerfassung.com/zugang-anfragen.html -o "$TMP_DIR/request.html"
curl -fsS https://signalerfassung.com/impressum.html -o "$TMP_DIR/impressum.html"
curl -fsS https://signalerfassung.com/datenschutz.html -o "$TMP_DIR/datenschutz.html"
curl -fsS -u "$TEST_USER:$TEST_PASS" https://signalerfassung.com/admin/ -o "$TMP_DIR/admin.html"

grep -q 'Messdaten' "$TMP_DIR/index.html"
grep -q 'Erfasste Signale' "$TMP_DIR/app.html"
grep -q 'help-trigger' "$TMP_DIR/app.html"
grep -q 'Hilfe zur Analyse' "$TMP_DIR/help.js"
grep -q 'Persönlich freigegeben.' "$TMP_DIR/request.html"
grep -q 'https://reflex.scania.com/profile/dbreue' "$TMP_DIR/request.html"
grep -q '<h1>Impressum</h1>' "$TMP_DIR/impressum.html"
grep -q 'Lokale Verarbeitung der Messdateien' "$TMP_DIR/datenschutz.html"
if grep -Eqi 'Google|Gmail|Interne Nutzungsstatistik|/api/usage' "$TMP_DIR/datenschutz.html"; then
  printf 'Datenschutz contains disabled service or tracking references\n' >&2
  exit 1
fi
if grep -q '/api/usage' "$TMP_DIR/impressum.html"; then
  printf 'Impressum triggers the protected usage endpoint\n' >&2
  exit 1
fi
grep -q '<h1>Admin Hub</h1>' "$TMP_DIR/admin.html"
curl -fsS -u "$TEST_USER:$TEST_PASS" https://signalerfassung.com/assets/vendor/exceljs.min.js >/dev/null
curl -fsS -H 'X-Remote-User: david' "$API/admin/api/access-requests" | grep -q '"requests"'
curl -fsS -X POST \
  -H 'Content-Type: application/json' \
  -H 'X-Requested-With: signalerfassung-access-request' \
  --data '{"name":"Release Test","email":"release-test@example.com","website":"bot"}' \
  "$API/api/access-requests" | grep -q '"ok":true'

public_status="$(curl -sS -o /dev/null -w '%{http_code}' https://signalerfassung.com/)"
test "$public_status" = "200"
protected_status="$(curl -sS -o /dev/null -w '%{http_code}' https://signalerfassung.com/signalerfassung-analyse-tool.html)"
test "$protected_status" = "401"

curl -fsS -X DELETE \
  -H 'X-Remote-User: david' \
  -H 'X-Requested-With: signalerfassung-admin' \
  "$API/admin/api/users/$TEST_USER" | grep -q '"ok":true'
trap - EXIT

printf 'release checks: ok\n'
