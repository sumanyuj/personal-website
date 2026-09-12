# personal-website

Code for my personal website (https://sumanyuj.com).

Vite + React, built to static files and served by [Caddy](https://caddyserver.com)
on a Hetzner CX-series VPS in Germany.

## Local usage

- Install dependencies: `npm install`
- Start dev server: `npm run dev`
- Build production bundle: `npm run build` (outputs `dist/`)
- Preview the production build: `npm run preview`

## Deployment

Pushing to `main` builds the site and ships it. Each deploy uploads to
`/var/www/sumanyuj.com/releases/<commit-sha>/` and then flips the
`current` symlink atomically, so visitors never see a half-written site
and a rollback is one command.

### Server layout

```
/var/www/sumanyuj.com/
├── releases/
│   ├── 4f2a1c…/          last 5 releases are kept
│   └── 9b7e3d…/
└── current -> releases/9b7e3d…   <- Caddy's document root
```

The `one-thing` and `accountability` apps are not hosted here yet; the
homepage still links to them, and those links 404 until they are migrated.
`deploy/Caddyfile` has commented-out blocks showing where to add them.

### First-time server setup

Assumes a fresh Ubuntu Hetzner VPS (tested on 26.04 LTS).

1. Create the deploy keypair **on your laptop**:

   ```bash
   ssh-keygen -t ed25519 -C 'deploy@github-actions' -f ~/.ssh/sumanyuj_deploy -N ''
   ```

2. Provision the server:

   ```bash
   scp deploy/provision.sh deploy/Caddyfile root@<SERVER_IP>:/tmp/
   ssh root@<SERVER_IP> "bash /tmp/provision.sh '$(cat ~/.ssh/sumanyuj_deploy.pub)'"
   ```

   This installs Caddy, creates the `deploy` user, opens ports 22/80/443 in
   `ufw`, disables SSH password login, enables unattended security upgrades,
   and prints the values you need in the next step.

3. Point DNS at the server in the Namecheap dashboard
   (Domain List → Manage → Advanced DNS). Remove the old cPanel records:

   | Type  | Host | Value          | TTL       |
   |-------|------|----------------|-----------|
   | A     | `@`  | `<SERVER_IP>`  | Automatic |
   | A     | `www`| `<SERVER_IP>`  | Automatic |

   Wait for it to propagate — `dig +short sumanyuj.com` should return the
   Hetzner IP. Caddy issues the TLS certificate on the first request once
   it does; Let's Encrypt rejects the request until DNS is correct.

4. Add the repository secrets (Settings → Secrets and variables → Actions):

   | Secret | Value |
   |---|---|
   | `DEPLOY_HOST` | server IP or hostname |
   | `DEPLOY_USER` | `deploy` |
   | `DEPLOY_PORT` | `22` |
   | `DEPLOY_SSH_KEY` | contents of `~/.ssh/sumanyuj_deploy` (the private key) |
   | `SSH_KNOWN_HOSTS` | host key line printed by `provision.sh` |

   The old `CPANEL_*` secrets can be deleted.

5. Push to `main`, or run the workflow manually from the Actions tab.

### Rollback

```bash
ssh deploy@<SERVER_IP>
ls -1t /var/www/sumanyuj.com/releases          # pick the previous sha
ln -sfnT /var/www/sumanyuj.com/releases/<sha> /var/www/sumanyuj.com/current.tmp
mv -T /var/www/sumanyuj.com/current.tmp /var/www/sumanyuj.com/current
```

### Changing server config

`deploy/Caddyfile` is the source of truth, but it is **not** shipped by the
deploy workflow — routing changes are rare and riskier than content changes.
Apply edits deliberately:

```bash
scp deploy/Caddyfile root@<SERVER_IP>:/tmp/
ssh root@<SERVER_IP> 'install -m 644 /tmp/Caddyfile /etc/caddy/Caddyfile \
  && caddy validate --config /etc/caddy/Caddyfile \
  && systemctl reload caddy'
```
