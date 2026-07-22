# Deploying Apps to the Shared netcup Server

A practical, reusable runbook for putting **any** web app behind the existing
web server on our shared netcup VPS — the one that already runs **Sendy** and is
managed with **Webmin/Virtualmin**. It was distilled from a real deployment
(Band Manager) and captures every gotcha we hit so the next one is quick.

The pattern is always the same:

```
Internet ──▶ Apache on the server's public IP (:80/:443, Let's Encrypt)
                 ├─▶ existing sites (Sendy, etc.)  — untouched
                 └─▶ app.yourdomain.com ──▶ 127.0.0.1:PORT  (your app)
```

Your app listens only on `127.0.0.1:PORT`; Apache terminates TLS and reverse-
proxies a new hostname to it. Nothing else on the box is disturbed.

---

## 0. Known facts about this server (read first)

These are the environment quirks that cost us the most time. Knowing them up
front saves hours:

| Fact | Why it matters |
|---|---|
| **Apache** owns ports 80 and 443 (`ss -ltnp 'sport = :443'`). | You add an Apache vhost; do **not** run your own Caddy/Traefik/nginx on 80/443. |
| **nginx is installed but inactive.** | Ignore it. If a response says `server: nginx`, you're hitting something else (see DNS cache trap below), not this box. |
| Existing vhosts are **bound to the server's specific IP**, not `*`. | Your vhost must use the **same specific IP**, or Apache won't route to it (see §5). |
| Webmin runs as **root**; use **Webmin → Others → Command Shell** for root commands. | No `sudo`/password needed; the interactive shell user (e.g. `newsletters`) may not be a sudoer. |
| System users/groups (e.g. `docker`, GID ≥ ~999) are **hidden** in Webmin's Users/Groups UI. | Manage them from the Command Shell, not the GUI. |
| certbot is the **apt** package; its `certbot.timer` may be **masked**, and `/etc/cron.d/certbot` is a no-op under systemd. | Auto-renewal is OFF until you unmask/enable the timer (§9). |
| The box's **local DNS resolver caches aggressively** (netcup resolvers honor the old TTL). | `dig`/`curl` *on the server* can resolve a domain to its **old** IP long after you change DNS. Test with `--resolve` or `/etc/hosts` (§7). |

> Throughout this guide, substitute:
> - `DOMAIN` = the hostname for your app, e.g. `app.yourdomain.com`
> - `PORT`   = the localhost port your app listens on, e.g. `3000`, `8080`
> - `IP4`    = the server's public IPv4 (auto-detected below)

---

## 1. Run your app on a localhost port

Get your app listening on `127.0.0.1:PORT` only — never on a public port, and
never on 80/443.

- **Docker Compose:** publish the app port to loopback and **don't** start any
  bundled TLS/proxy service. Example override:
  ```yaml
  # docker-compose.shared.yml
  services:
    app:
      ports:
        - "127.0.0.1:PORT:PORT"   # loopback only; Apache will proxy to this
  ```
  Bring up only the services you need, by name, so a bundled proxy never starts:
  ```bash
  docker compose -f docker-compose.yml -f docker-compose.shared.yml up -d db app
  ```
- **Anything else (Node, Python, etc.):** bind to `127.0.0.1:PORT` and run it
  under a process manager (systemd unit, pm2, etc.) so it survives reboots.

Confirm it answers locally before touching Apache:
```bash
curl -s http://127.0.0.1:PORT/            # or your app's health endpoint
ss -ltnp 'sport = :PORT'                  # something should be LISTEN on 127.0.0.1:PORT
```

---

## 2. Docker permissions (only if using Docker)

If `docker ...` gives `permission denied ... /var/run/docker.sock`, the shell
user isn't in the `docker` group. The group exists but is **hidden** in Webmin's
UI. From the root **Command Shell**:

```bash
# Confirm docker is installed and the group exists:
docker --version
getent group docker            # e.g. docker:x:999:  (empty = no members yet)

# Add the interactive user (the one the Webmin terminal logs in as):
usermod -aG docker THE_USER    # e.g. newsletters
```

Group membership only applies to **new** sessions. In the interactive terminal:
```bash
newgrp docker      # or close & reopen the Webmin terminal
id                 # should now list "docker"
docker ps          # no permission error
```

Ensure Docker starts on boot (usually already true):
```bash
systemctl is-enabled docker || systemctl enable --now docker
```

---

## 3. DNS

Point the app's hostname at **this server's** public IP:

1. Create an **A record**: `DOMAIN` → the netcup server's public IPv4.
2. **Remove any stale/CDN records** for that name. We had an old A record
   pointing at a Google Cloud (`35.x`) proxy — leaving it caused Let's Encrypt to
   validate against the wrong host and return 404s. If two A records exist, the
   CA may hit either one.
3. Delete any `AAAA` record unless this server actually serves that IPv6.
4. Use a **low TTL** (e.g. 300s) while deploying so changes propagate fast.

Verify against **public** resolvers (not the box's cache):
```bash
dig +short A    DOMAIN @1.1.1.1
dig +short A    DOMAIN @8.8.8.8
dig +short AAAA DOMAIN @1.1.1.1     # expect empty unless intended
```
All should return **only** this server's IP before you request a certificate.

> **Trap:** `dig +short DOMAIN` *on the server* may still show the old IP for a
> long time due to resolver caching. That does **not** block Let's Encrypt (the
> CA uses public DNS), and it does not affect real users. It only misleads local
> tests — handle it with `--resolve` or `/etc/hosts` (§7).

---

## 4. Detect the server IP (used by every step below)

All vhosts must bind the **same specific IP** the existing sites use. Grab it
once and reuse it:

```bash
IP4=$(apache2ctl -S 2>/dev/null | grep -oE '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+' | head -1)
echo "IP4=$IP4"     # must be a real address, e.g. 152.x.x.x
```

> Webmin's Command Shell is **stateless** — variables don't persist between
> separate submissions. Re-set `DOMAIN`, `PORT`, and `IP4` at the top of each
> block you paste.

---

## 5. Create the HTTP vhost (IP-bound) and get the certificate

### Why IP-bound

`apache2ctl -S` on this box shows existing vhosts under a **specific IP**
(e.g. `152.x.x.x:80`), not `*:80`. Apache rule: a connection arriving on that
IP is served **only** by vhosts declared for that exact IP. A `*:80` (wildcard)
vhost is ignored for that traffic, so your site silently falls through to the
default (Sendy) and 404s — even though `curl` to `127.0.0.1` with a `Host:`
header appears to work. **Always bind to `${IP4}`.**

### Why webroot (not `--apache`)

The `certbot --apache` authenticator temporarily rewrites your vhost during
validation and doesn't honor the ACME proxy-exclusion, so it 404s on a reverse-
proxy vhost. Use **`certbot certonly --webroot`**, which just drops the
challenge file on disk and uses your existing (working) Apache config.

### Steps

Install the modules/plugin (safe to re-run):
```bash
apt-get update && apt-get install -y python3-certbot-apache libapache2-mod-... 2>/dev/null
a2enmod proxy proxy_http headers ssl rewrite
```
(You mainly need `proxy proxy_http headers ssl rewrite`; certbot's apache plugin
is optional since we use webroot.)

Write the HTTP-only vhost, **bound to `${IP4}`**, with the ACME path excluded
from the proxy:
```bash
DOMAIN=app.yourdomain.com
PORT=3000
IP4=$(apache2ctl -S 2>/dev/null | grep -oE '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+' | head -1)

cat >/etc/apache2/sites-available/${DOMAIN}.conf <<EOF
<VirtualHost ${IP4}:80>
    ServerName ${DOMAIN}
    DocumentRoot /var/www/html

    # ACME HTTP-01 challenges must be served from disk, NEVER proxied:
    ProxyPass /.well-known/acme-challenge/ !

    ProxyPreserveHost On
    RequestHeader set X-Forwarded-Proto "http"
    ProxyPass        / http://127.0.0.1:${PORT}/
    ProxyPassReverse / http://127.0.0.1:${PORT}/
    LimitRequestBody 26214400
</VirtualHost>
EOF

a2ensite ${DOMAIN}.conf 2>/dev/null
apache2ctl configtest && systemctl reload apache2
apache2ctl -S | grep -i "${DOMAIN}"      # MUST show ${IP4}:80 ${DOMAIN}
```

> If `${DOMAIN}` does **not** appear in `apache2ctl -S`, Apache dropped the
> vhost — almost always because `${IP4}` was left as a placeholder or is empty.
> Re-check step 4.

Prove the public ACME path serves from disk, then issue the cert:
```bash
mkdir -p /var/www/html/.well-known/acme-challenge
echo hello > /var/www/html/.well-known/acme-challenge/test
curl -4 -s --resolve ${DOMAIN}:80:${IP4} \
     http://${DOMAIN}/.well-known/acme-challenge/test        # expect: hello
rm /var/www/html/.well-known/acme-challenge/test

certbot certonly --webroot -w /var/www/html -d ${DOMAIN}
```
Look for **“Successfully received certificate”**. Cert lands in
`/etc/letsencrypt/live/${DOMAIN}/`.

---

## 6. Add the HTTPS vhost + redirect

Only after the cert exists (the `:443` block references cert files):

```bash
DOMAIN=app.yourdomain.com
PORT=3000
IP4=$(apache2ctl -S 2>/dev/null | grep -oE '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+' | head -1)

a2enmod ssl rewrite headers

cat >/etc/apache2/sites-available/${DOMAIN}.conf <<EOF
<VirtualHost ${IP4}:80>
    ServerName ${DOMAIN}
    DocumentRoot /var/www/html

    ProxyPass /.well-known/acme-challenge/ !

    RewriteEngine On
    RewriteCond %{REQUEST_URI} !^/\.well-known/acme-challenge/
    RewriteRule ^ https://${DOMAIN}%{REQUEST_URI} [L,R=301]
</VirtualHost>

<VirtualHost ${IP4}:443>
    ServerName ${DOMAIN}
    DocumentRoot /var/www/html

    SSLEngine on
    SSLCertificateFile    /etc/letsencrypt/live/${DOMAIN}/fullchain.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/${DOMAIN}/privkey.pem

    ProxyPass /.well-known/acme-challenge/ !
    ProxyPreserveHost On
    RequestHeader set X-Forwarded-Proto "https"
    ProxyPass        / http://127.0.0.1:${PORT}/
    ProxyPassReverse / http://127.0.0.1:${PORT}/
    LimitRequestBody 26214400

    Header always set Strict-Transport-Security "max-age=63072000; includeSubDomains; preload"
    Header always set X-Content-Type-Options "nosniff"
    Header always set Referrer-Policy "strict-origin-when-cross-origin"
</VirtualHost>
EOF

apache2ctl configtest && systemctl reload apache2
```

> Tune `LimitRequestBody` (bytes) to your app's max upload size. `26214400` ≈ 25 MB.

> **Paste tip:** run `systemctl reload apache2` on its own line and make sure the
> previous block ends with a newline. Gluing it to the next block's
> `DOMAIN=...` produces the confusing `Unit apache2DOMAIN=... is masked` error —
> the config was fine, it just never reloaded.

---

## 7. Verify (bypassing the stale local resolver)

The box may still resolve `DOMAIN` to an old IP, so test with `--resolve` to
force the real server, and confirm in a browser on a **different** machine:

```bash
IP4=$(apache2ctl -S 2>/dev/null | grep -oE '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+' | head -1)

curl -fsS --resolve app.yourdomain.com:443:$IP4 https://app.yourdomain.com/    # app responds
curl -sI  --resolve app.yourdomain.com:80:$IP4  http://app.yourdomain.com/ | grep -i location   # 301 -> https
```

Optionally pin correct local resolution so on-box tests and any self-referential
calls are honest until the old TTL expires:
```bash
IP4=$(apache2ctl -S 2>/dev/null | grep -oE '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+' | head -1)
echo "$IP4 app.yourdomain.com" >> /etc/hosts
```

Then open `https://app.yourdomain.com` in a browser — valid padlock, your app,
and the existing sites (Sendy) still working on their own hostnames.

> If a response shows `server: nginx` with `x-proxy-cache`/`host-header`
> headers, you're hitting the **old** host via stale DNS, not this server
> (Apache serves these sites). Re-check DNS (§3) and use `--resolve`.

---

## 8. Survive reboots

- **Docker apps:** ensure `restart: unless-stopped` on the containers and that
  Docker is enabled:
  ```bash
  systemctl is-enabled docker || systemctl enable --now docker
  docker inspect -f '{{.Name}} {{.HostConfig.RestartPolicy.Name}}' $(docker ps -q)
  ```
  Containers with `unless-stopped` come back automatically on boot.
- **Non-Docker apps:** run them as a **systemd unit** with
  `Restart=always` and `systemctl enable` it.

---

## 9. Enable automatic certificate renewal

certbot's cron is a no-op under systemd, and the timer is often **masked** on
this box, so renewals won't happen until you enable it:

```bash
systemctl unmask certbot.timer
systemctl enable --now certbot.timer
systemctl list-timers | grep -i certbot     # shows certbot.timer with a NEXT time
certbot renew --dry-run                      # "all simulations succeeded"
```

Because we used **webroot**, renewals reuse the working Apache config and won't
disturb the vhost. Renewal only actually re-issues within 30 days of expiry.

---

## 10. Troubleshooting (things we actually hit)

| Symptom | Cause & fix |
|---|---|
| `permission denied ... docker.sock` | User not in `docker` group. `usermod -aG docker USER` via root Command Shell, then `newgrp docker` (§2). |
| `docker` group not shown in Webmin UI | It's a hidden system group; manage from the shell (`getent group docker`). |
| `sudo` asks for a password you don't have | The interactive user isn't a sudoer. Use **Webmin → Others → Command Shell** (runs as root). |
| New hostname shows the **Sendy** site / 404 | No matching vhost. Usually the vhost is `*:80` instead of the server IP — rebind to `${IP4}` (§5). |
| `<VirtualHost> cannot occur within <VirtualHost>` | Webmin's *Create Virtual Host* already wrote a wrapper and you pasted another inside it. Keep exactly one `<VirtualHost>` per block. |
| Vhost missing from `apache2ctl -S` | `${IP4}` was empty or left as a placeholder → Apache "could not resolve host name … ignoring". Set a real IP. |
| certbot `--apache`: *plugin not installed* | `apt-get install -y python3-certbot-apache`, or just use `certonly --webroot`. |
| certbot 404 on `/.well-known/acme-challenge/...` | (a) `ProxyPass /` was eating the challenge → add `ProxyPass /.well-known/acme-challenge/ !`. (b) DNS points elsewhere → fix A record. (c) `--apache` rewrite broke it → use `--webroot`. |
| Local `dig`/`curl` hits the **old** IP | Box resolver cache honoring old TTL. Doesn't block the CA. Test with `--resolve` or add `/etc/hosts` (§7). |
| Response has `server: nginx` + `x-proxy-cache` | You're reaching the old CDN/host via stale DNS, not this server (nginx here is inactive). Fix DNS / use `--resolve`. |
| `Unit apache2DOMAIN=... is masked` | Paste glued `systemctl reload apache2` to the next block. Run reload on its own line. Config was fine. |
| Cert won't auto-renew | `certbot.timer` masked/disabled → `systemctl unmask --now` then `enable --now` (§9). |
| `needrestart` kernel prompt during `apt` | Informational. Press OK; reboot later at a convenient time (containers auto-restart). |

---

## 11. Quick reference — full deploy in one pass

Once DNS is correct and your app listens on `127.0.0.1:PORT`:

```bash
# --- set these three ---
DOMAIN=app.yourdomain.com
PORT=3000
IP4=$(apache2ctl -S 2>/dev/null | grep -oE '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+' | head -1)

# --- modules ---
a2enmod proxy proxy_http headers ssl rewrite

# --- HTTP vhost (for ACME) ---
cat >/etc/apache2/sites-available/${DOMAIN}.conf <<EOF
<VirtualHost ${IP4}:80>
    ServerName ${DOMAIN}
    DocumentRoot /var/www/html
    ProxyPass /.well-known/acme-challenge/ !
    ProxyPreserveHost On
    RequestHeader set X-Forwarded-Proto "http"
    ProxyPass        / http://127.0.0.1:${PORT}/
    ProxyPassReverse / http://127.0.0.1:${PORT}/
    LimitRequestBody 26214400
</VirtualHost>
EOF
a2ensite ${DOMAIN}.conf 2>/dev/null
apache2ctl configtest && systemctl reload apache2

# --- certificate (webroot) ---
certbot certonly --webroot -w /var/www/html -d ${DOMAIN}

# --- HTTPS vhost + redirect (rerun with same vars) ---
cat >/etc/apache2/sites-available/${DOMAIN}.conf <<EOF
<VirtualHost ${IP4}:80>
    ServerName ${DOMAIN}
    DocumentRoot /var/www/html
    ProxyPass /.well-known/acme-challenge/ !
    RewriteEngine On
    RewriteCond %{REQUEST_URI} !^/\.well-known/acme-challenge/
    RewriteRule ^ https://${DOMAIN}%{REQUEST_URI} [L,R=301]
</VirtualHost>
<VirtualHost ${IP4}:443>
    ServerName ${DOMAIN}
    DocumentRoot /var/www/html
    SSLEngine on
    SSLCertificateFile    /etc/letsencrypt/live/${DOMAIN}/fullchain.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/${DOMAIN}/privkey.pem
    ProxyPass /.well-known/acme-challenge/ !
    ProxyPreserveHost On
    RequestHeader set X-Forwarded-Proto "https"
    ProxyPass        / http://127.0.0.1:${PORT}/
    ProxyPassReverse / http://127.0.0.1:${PORT}/
    LimitRequestBody 26214400
    Header always set Strict-Transport-Security "max-age=63072000; includeSubDomains; preload"
    Header always set X-Content-Type-Options "nosniff"
    Header always set Referrer-Policy "strict-origin-when-cross-origin"
</VirtualHost>
EOF
apache2ctl configtest && systemctl reload apache2

# --- renewal ---
systemctl unmask certbot.timer; systemctl enable --now certbot.timer

# --- verify (bypass stale local DNS) ---
curl -fsS --resolve ${DOMAIN}:443:${IP4} https://${DOMAIN}/
```

That's the whole flow: app on loopback, IP-bound Apache vhost, webroot cert,
HTTPS + redirect, renewal armed — every existing site left untouched.
