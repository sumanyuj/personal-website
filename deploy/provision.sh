#!/usr/bin/env bash
# One-shot server setup for sumanyuj.com on a fresh Hetzner CX-series box
# (Ubuntu 24.04). Idempotent: safe to re-run after editing.
#
#   scp deploy/provision.sh root@<SERVER_IP>:/tmp/
#   ssh root@<SERVER_IP> 'bash /tmp/provision.sh "ssh-ed25519 AAAA... deploy@github"'
#
# The argument is the PUBLIC half of the deploy keypair that GitHub Actions
# will use. Generate it on your laptop, never on the server:
#   ssh-keygen -t ed25519 -C 'deploy@github-actions' -f ~/.ssh/sumanyuj_deploy -N ''

set -euo pipefail

# Without this, a mid-script failure scrolls past in a wall of apt output and
# the run looks like it succeeded. It did not.
trap 'echo; echo "!! provision.sh FAILED at line $LINENO (exit $?)" >&2; echo "   Fix the cause and re-run; this script is idempotent." >&2' ERR

DEPLOY_PUBKEY="${1:-}"
DEPLOY_USER=deploy
DOMAIN=sumanyuj.com
SITE_ROOT="/var/www/${DOMAIN}"

if [[ -z "$DEPLOY_PUBKEY" ]]; then
	echo "usage: bash provision.sh '<deploy public key>'" >&2
	exit 64
fi
if [[ $EUID -ne 0 ]]; then
	echo "run as root" >&2
	exit 1
fi

echo "==> Base packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq \
	ca-certificates curl gnupg debian-keyring debian-archive-keyring \
	apt-transport-https rsync ufw fail2ban unattended-upgrades

echo "==> Unattended security upgrades"
dpkg-reconfigure -f noninteractive unattended-upgrades

echo "==> Node"
# The API is plain Node with no npm dependencies; 22+ is needed for node:sqlite.
if ! command -v node >/dev/null; then
	curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
	apt-get install -y -qq nodejs
fi
node -e 'require("node:sqlite")' 2>/dev/null \
	|| { echo "    !! this node has no node:sqlite (needs >= 22)" >&2; exit 1; }
echo "    $(node -v)"

echo "==> Caddy"
if ! command -v caddy >/dev/null; then
	curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key \
		| gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
	curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt \
		> /etc/apt/sources.list.d/caddy-stable.list
	apt-get update -qq
	apt-get install -y -qq caddy
fi

echo "==> Deploy user"
id -u "$DEPLOY_USER" >/dev/null 2>&1 || useradd -m -s /bin/bash "$DEPLOY_USER"
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "/home/${DEPLOY_USER}/.ssh"
touch "/home/${DEPLOY_USER}/.ssh/authorized_keys"
grep -qxF "$DEPLOY_PUBKEY" "/home/${DEPLOY_USER}/.ssh/authorized_keys" \
	|| echo "$DEPLOY_PUBKEY" >> "/home/${DEPLOY_USER}/.ssh/authorized_keys"
chmod 600 "/home/${DEPLOY_USER}/.ssh/authorized_keys"
chown -R "${DEPLOY_USER}:${DEPLOY_USER}" "/home/${DEPLOY_USER}/.ssh"

echo "==> Site directories"
# caddy reads, deploy writes. The deploy user owns the tree; caddy only needs
# traversal + read, so it is never able to modify what it serves.
install -d -o "$DEPLOY_USER" -g caddy -m 755 "$SITE_ROOT" "${SITE_ROOT}/releases"

# A placeholder so Caddy can start (and get certs) before the first deploy.
if [[ ! -e "${SITE_ROOT}/current" ]]; then
	install -d -o "$DEPLOY_USER" -g caddy -m 755 "${SITE_ROOT}/releases/bootstrap"
	echo '<!doctype html><title>sumanyuj.com</title><h1>Awaiting first deploy</h1>' \
		> "${SITE_ROOT}/releases/bootstrap/index.html"
	chown "${DEPLOY_USER}:caddy" "${SITE_ROOT}/releases/bootstrap/index.html"
	ln -sfnT "${SITE_ROOT}/releases/bootstrap" "${SITE_ROOT}/current"
	chown -h "${DEPLOY_USER}:caddy" "${SITE_ROOT}/current"
fi

echo "==> Bookshelf API"
id -u bookshelf >/dev/null 2>&1 || useradd --system --home /var/lib/bookshelf --shell /usr/sbin/nologin bookshelf
# The database lives outside the deploy directory on purpose: deploys rsync
# with --delete, and a library inside one would be erased on the next push.
install -d -o bookshelf -g bookshelf -m 750 /var/lib/bookshelf
install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" -m 755 /opt/bookshelf /opt/bookshelf/releases

if [[ ! -f /etc/bookshelf.env ]]; then
	# Signups are closed until a code exists, so a fresh box cannot be
	# registered against by whoever finds it first.
	SIGNUP_CODE="$(head -c 18 /dev/urandom | base64 | tr -d '/+=' | head -c 20)"
	printf 'BOOKSHELF_SIGNUP_CODE=%s\n' "$SIGNUP_CODE" > /etc/bookshelf.env
	chmod 600 /etc/bookshelf.env
	echo "    signup code: $SIGNUP_CODE"
else
	echo "    keeping the existing /etc/bookshelf.env"
fi

if [[ -f /tmp/bookshelf-api.service ]]; then
	install -m 644 /tmp/bookshelf-api.service /etc/systemd/system/bookshelf-api.service
	systemctl daemon-reload
	systemctl enable bookshelf-api >/dev/null
fi

# The deploy user may restart the API and nothing else.
echo "$DEPLOY_USER ALL=(root) NOPASSWD: /usr/bin/systemctl restart bookshelf-api" \
	> /etc/sudoers.d/bookshelf-api
chmod 440 /etc/sudoers.d/bookshelf-api

echo "==> Firewall"
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "==> SSH hardening"
cat > /etc/ssh/sshd_config.d/99-hardening.conf <<'EOF'
PasswordAuthentication no
PermitRootLogin prohibit-password
KbdInteractiveAuthentication no
EOF
sshd -t && systemctl reload ssh

echo "==> Caddy config"
if [[ -f /tmp/Caddyfile ]]; then
	# Validate the candidate before it replaces a working config, so a bad edit
	# cannot take the site down.
	if caddy validate --config /tmp/Caddyfile --adapter caddyfile; then
		install -m 644 /tmp/Caddyfile /etc/caddy/Caddyfile
	else
		echo "    !! /tmp/Caddyfile is invalid — keeping the existing config" >&2
		exit 1
	fi
else
	echo "    !! /tmp/Caddyfile not found — copy deploy/Caddyfile to the server"
	echo "       and rerun, or install it by hand at /etc/caddy/Caddyfile" >&2
fi

systemctl enable caddy
systemctl restart caddy

echo "==> Verifying Caddy is actually listening"
for i in $(seq 1 10); do
	if ss -ltn '( sport = :80 or sport = :443 )' | grep -q LISTEN; then
		echo "    listening on 80/443"
		break
	fi
	[[ $i -eq 10 ]] && {
		echo "    !! Caddy is not listening. Recent log:" >&2
		journalctl -u caddy -n 30 --no-pager >&2
		exit 1
	}
	sleep 1
done

# Start the API if code has already been deployed; a fresh box has none yet.
if [[ -x /opt/bookshelf/current/index.js || -f /opt/bookshelf/current/index.js ]]; then
	systemctl restart bookshelf-api
	sleep 1
	systemctl is-active --quiet bookshelf-api \
		&& echo "    API running" \
		|| { echo "    !! API failed to start:" >&2; journalctl -u bookshelf-api -n 20 --no-pager >&2; }
else
	echo "    no API deployed yet; it starts on the first push"
fi

echo
echo "==> Done. Values for your GitHub repository secrets:"
echo "    DEPLOY_USER      ${DEPLOY_USER}"
echo "    DEPLOY_HOST      $(curl -fsS --max-time 5 https://ipv4.icanhazip.com 2>/dev/null || hostname -I | awk '{print $1}')"
echo "    DEPLOY_PORT      22"
echo "    SSH_KNOWN_HOSTS  (the line below)"
echo
ssh-keyscan -t ed25519 localhost 2>/dev/null \
	| sed "s/^localhost/$(curl -fsS --max-time 5 https://ipv4.icanhazip.com 2>/dev/null || hostname -I | awk '{print $1}')/"
