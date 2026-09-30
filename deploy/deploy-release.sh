#!/usr/bin/env bash
set -Eeuo pipefail

STAMP="${1:-${STAMP:-}}"
if [[ ! "$STAMP" =~ ^[0-9]{8}-[0-9]{6}$ ]]; then
  printf 'Usage: %s YYYYMMDD-HHMMSS\n' "$0" >&2
  exit 2
fi
SITE_ROOT="/var/www/signalerfassung.com"
RELEASE="$SITE_ROOT/releases/$STAMP"
ARCHIVE="/tmp/signalerfassung-release-$STAMP.zip"
SITE_CONFIG="/etc/nginx/sites-available/signalerfassung.com"
SITE_BACKUP="$SITE_CONFIG.bak-$STAMP"
LOG_FORMAT="/etc/nginx/conf.d/signalerfassung-log-format.conf"
OLD_RELEASE="$(readlink -f "$SITE_ROOT/current")"

test -f "$ARCHIVE"
if [[ -e "$RELEASE" ]]; then
  printf 'Release already exists: %s\n' "$RELEASE" >&2
  exit 2
fi
mkdir -p "$RELEASE"
unzip -qo "$ARCHIVE" -d "$RELEASE"
node --check "$RELEASE/server/server.js"
test -f "$RELEASE/admin/index.html"
test -f "$RELEASE/assets/vendor/exceljs.min.js"
test -f "$RELEASE/assets/help.css"
test -f "$RELEASE/assets/help.js"
test -f "$RELEASE/assets/admin.css"
test -f "$RELEASE/assets/admin.js"
test -f "$RELEASE/assets/access-request.css"
test -f "$RELEASE/assets/access-request.js"
test -f "$RELEASE/zugang-anfragen.html"
test -f "$RELEASE/feedbackbogen-monteurtest.html"
test -f "$RELEASE/server/node_modules/nodemailer/package.json"

cp -a "$SITE_CONFIG" "$SITE_BACKUP"
install -m 0644 /tmp/signalerfassung-log-format.conf "$LOG_FORMAT"
install -m 0644 /tmp/signalerfassung.com.nginx "$SITE_CONFIG"
if ! nginx -t; then
  cp -a "$SITE_BACKUP" "$SITE_CONFIG"
  nginx -t
  exit 1
fi

install -m 0644 /tmp/signalerfassung-admin.service /etc/systemd/system/signalerfassung-admin.service
chown root:www-data "$SITE_ROOT/shared"
chmod 2770 "$SITE_ROOT/shared"
chown www-data:www-data "$SITE_ROOT/shared/.htpasswd"
chmod 0640 "$SITE_ROOT/shared/.htpasswd"
touch "$SITE_ROOT/shared/usage.ndjson"
chown www-data:www-data "$SITE_ROOT/shared/usage.ndjson"
chmod 0640 "$SITE_ROOT/shared/usage.ndjson"
if [[ ! -f "$SITE_ROOT/shared/access-requests.json" ]]; then
  printf '[]\n' > "$SITE_ROOT/shared/access-requests.json"
fi
chown www-data:www-data "$SITE_ROOT/shared/access-requests.json"
chmod 0640 "$SITE_ROOT/shared/access-requests.json"
if [[ -f "$SITE_ROOT/shared/mail.env" ]]; then
  chown root:www-data "$SITE_ROOT/shared/mail.env"
  chmod 0640 "$SITE_ROOT/shared/mail.env"
fi
chown -R www-data:www-data "$RELEASE"

ln -s "$RELEASE" "$SITE_ROOT/.current-$STAMP"
mv -Tf "$SITE_ROOT/.current-$STAMP" "$SITE_ROOT/current"
systemctl daemon-reload
systemctl enable signalerfassung-admin.service
if ! systemctl restart signalerfassung-admin.service; then
  ln -sfn "$OLD_RELEASE" "$SITE_ROOT/current"
  cp -a "$SITE_BACKUP" "$SITE_CONFIG"
  systemctl daemon-reload
  systemctl restart signalerfassung-admin.service || true
  exit 1
fi

healthy="false"
for _ in 1 2 3 4 5; do
  if curl -fsS http://127.0.0.1:3407/health >/dev/null; then
    healthy="true"
    break
  fi
  sleep 1
done
if [[ "$healthy" != "true" ]]; then
  ln -sfn "$OLD_RELEASE" "$SITE_ROOT/current"
  cp -a "$SITE_BACKUP" "$SITE_CONFIG"
  systemctl daemon-reload
  systemctl restart signalerfassung-admin.service || true
  nginx -t && nginx -s reload || true
  exit 1
fi

nginx -s reload
printf 'release=%s\n' "$(readlink -f "$SITE_ROOT/current")"
systemctl is-active signalerfassung-admin.service
curl -fsS http://127.0.0.1:3407/health
