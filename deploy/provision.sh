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
install -d -o caddy -g caddy -m 755 /var/log/caddy

# A placeholder so Caddy can start (and get certs) before the first deploy.
if [[ ! -e "${SITE_ROOT}/current" ]]; then
	install -d -o "$DEPLOY_USER" -g caddy -m 755 "${SITE_ROOT}/releases/bootstrap"
	echo '<!doctype html><title>sumanyuj.com</title><h1>Awaiting first deploy</h1>' \
		> "${SITE_ROOT}/releases/bootstrap/index.html"
	chown "${DEPLOY_USER}:caddy" "${SITE_ROOT}/releases/bootstrap/index.html"
	ln -sfnT "${SITE_ROOT}/releases/bootstrap" "${SITE_ROOT}/current"
	chown -h "${DEPLOY_USER}:caddy" "${SITE_ROOT}/current"
fi

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
	install -m 644 /tmp/Caddyfile /etc/caddy/Caddyfile
	caddy validate --config /etc/caddy/Caddyfile
	systemctl reload caddy || systemctl restart caddy
else
	echo "    !! /tmp/Caddyfile not found — copy deploy/Caddyfile to the server"
	echo "       and rerun, or install it by hand at /etc/caddy/Caddyfile"
fi
systemctl enable --now caddy

echo
echo "==> Done. Values for your GitHub repository secrets:"
echo "    DEPLOY_USER      ${DEPLOY_USER}"
echo "    DEPLOY_HOST      $(curl -fsS --max-time 5 https://ipv4.icanhazip.com 2>/dev/null || hostname -I | awk '{print $1}')"
echo "    DEPLOY_PORT      22"
echo "    SSH_KNOWN_HOSTS  (the line below)"
echo
ssh-keyscan -t ed25519 localhost 2>/dev/null \
	| sed "s/^localhost/$(curl -fsS --max-time 5 https://ipv4.icanhazip.com 2>/dev/null || hostname -I | awk '{print $1}')/"
