# personal-website

Code for my personal website (https://sumanyuj.com).

Vite + React, built to static files and served by [Caddy](https://caddyserver.com)
on a Hetzner CX-series VPS in Germany.

## Local usage

- Install dependencies: `npm install`
- Start dev server: `npm run dev`
- Build production bundle: `npm run build` (outputs `dist/`)
- Preview the production build: `npm run preview`

## Bookshelf

`/bookshelf` is a port of the Bookshelf app — a display case for the books you
own, not a reader — from the SwiftUI version built for Mac, iPhone and iPad,
which was itself a port of an Electron/React app for Ubuntu.

It is a second Vite entry rather than a client-side route, so none of it is on
the homepage's critical path. Everything runs in the browser: the library is an
IndexedDB store (covers as blobs in their own object store, so listing the shelf
never deserialises image data), and both metadata sources send permissive CORS
headers, so there is no proxy to operate.

| Path | What it is |
|---|---|
| `src/bookshelf/assets/` | The wood, and where it came from |
| `src/bookshelf/metadata/` | Apple Books + Open Library, merge and ranking |
| `src/bookshelf/model/` | IndexedDB store, layout maths, cover handling |
| `src/bookshelf/components/` | Shelf, chrome, sheets, list |

Carried over from the native app:

- **Wooden shelves**, finished in the same photograph the desktop app uses —
  ambientCG's Wood048 colour map, CC0, two seamless 2048² tiles. This replaced a
  procedural generator: it tiled seamlessly and carried no licence, but nothing
  got it to the contrast and fine grain of a photograph, and every setting that
  sharpened it turned the panel into reeded screening.
- **Books as wide as their own cover art**, so the shelf isn't a uniform grid.
- **Zoom**, by slider or trackpad pinch, remembered between visits.
- **Add by search**, querying both sources at once. Apple answers first and is
  shown immediately; the merged, edition-resolved result replaces it. The
  ranking, the edition guards and the per-host circuit breaker are ported intact
  — without them *Frank Herbert's Dune Saga Collection* outranks *Dune*, and a
  French *Pale Fire* wins the merge.
- **Collections**, editable details, and a sortable list view.

### Asset resolution

Both surfaces are kept at the highest resolution the source actually holds.

**Covers.** Two things came out of probing Apple's CDN that the native app did
not use. `1400x0w` is not a ceiling — asking for any width at or above the
master returns the master itself, which is 1466×2625 for one book and 1649×2475
for another, so the request asks for more than exists and takes what comes back.
And the CDN transcodes by extension: the same pixels cost 74KB as WebP against
434KB as JPEG, encoded from the master rather than re-encoded from a JPEG here.
The master is therefore stored exactly as delivered — no canvas round trip, no
generation loss.

A display-sized derivative is stored beside it. A 1649×2475 image decodes to
roughly 16MB of bitmap, and a shelf of twenty would ask the browser to hold
several hundred megabytes at once; the shelf draws the derivative and the detail
sheet, where a cover is actually inspected, draws the master. Search results use
a 300px thumbnail — they are drawn at 44px, and pulling masters for twenty
results was several megabytes to fill a strip of postage stamps.

**Wood.** Both tiles are the source's full 2048², re-encoded to WebP at quality
82 — about a quarter fewer bytes than the JPEGs they came from. Wood is
high-entropy enough that WebP above roughly q86 is *larger* than the JPEG it
replaces, so the usual "just use WebP" instinct is worth measuring here rather
than assuming. At an 880px tile on a 2× display the panel needs 1760 device
pixels, so 2048 is the right source size and nothing is ever scaled up.

### Getting there from the homepage

Knock every letter of the heading off with the books, and a bookshelf appears.
Click it, or drag the three books into its slots — the third one shelved opens
the app on its own.

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
