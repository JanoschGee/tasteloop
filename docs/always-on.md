# Running always-on

Three jobs make up Tasteloop:

| Job | Command | When |
|---|---|---|
| bot | `npm run bot -- --brand <config>` | all the time |
| approval | `npm run apply -- --brand <config>` | every 10 minutes |
| digest | `npm run digest -- --brand <config>` | once a week |

Telegram keeps messages for 24 hours. If the bot is off for a few hours, it catches up when it starts again. Anything older is lost.

Pick one of three setups.

## A. Your laptop

Good for trying it out or for a small team that sends references during work hours.

1. Keep the bot running in a terminal tab: `npm run bot -- --brand <config>`.
2. Schedule approval and digest with `crontab -e`. Replace the paths first:

```
*/10 * * * * cd /path/to/tasteloop && /usr/local/bin/npm run -s apply -- --brand /Users/you/.config/tasteloop/brands/your-brand.yaml >> /tmp/tasteloop-apply.log 2>&1
0 8 * * 1 cd /path/to/tasteloop && /usr/local/bin/npm run -s digest -- --brand /Users/you/.config/tasteloop/brands/your-brand.yaml >> /tmp/tasteloop-digest.log 2>&1
```

Use the full path from `which npm`. On macOS, cron may need Full Disk Access (System Settings → Privacy & Security) if your vault is in Documents, Desktop or iCloud.

Obsidian Sync or iCloud distributes the notes to your team as usual.

## B. A dedicated Mac (for example a Mac mini)

`ops/install-macmini.sh` sets up a machine that runs on its own:

- a separate standard user `branding`, never logged in
- all jobs as LaunchDaemons that start at boot without a login: bot, approval, digest, gallery, Cloudflare tunnel and Obsidian Headless Sync
- Homebrew, Node 22, whisper.cpp, ffmpeg and cloudflared, if missing

It is a dry run by default and changes nothing until you add `--apply`. It never touches FileVault, auto-login, energy or network settings.

```bash
ops/install-macmini.sh --brand your-brand --vault /Users/branding/Vaults/YourVault --config ~/.config/tasteloop/brands/your-brand.yaml
```

Recommended order:
1. Run it with `--apply --no-services`.
2. Fill in the secrets, log in to Obsidian and set up the tunnel, as the script prints.
3. Run it again with `--apply` to start the services.

Status and logs:

```bash
sudo launchctl list | grep eu.tasteloop
```

```bash
sudo tail -f /Users/branding/Library/Logs/tasteloop/bot.log
```

Restart a service:

```bash
sudo launchctl kickstart -k system/eu.tasteloop.your-brand.bot
```

### Syncing the vault without the Obsidian app

[Obsidian Headless](https://obsidian.md/help/headless) (open beta, `npm install -g obsidian-headless`, command `ob`) syncs a vault through Obsidian Sync without the desktop app. Don't run desktop Sync and Headless Sync on the same machine.

Headless syncs the whole vault. It can only exclude **folders**, not single files. If the machine should only hold your brand folder, compute the exclusions from a full copy of the vault:

```bash
npm run sync-plan -- --vault /path/to/full/vault --keep "Brand" --out ~/sync-excludes.txt
```

It lists files that would still sync because they sit in parent folders. Move them into subfolders, or accept them via `vault.sync_allowed`. Set the exclusions **before** the first sync. `npm run doctor` on the host reports anything outside `vault.sync_only`.

### FileVault and power cuts

With FileVault on, a Mac waits at the unlock screen after a power cut. The services only start once someone unlocks it. For planned restarts use `sudo fdesetup authrestart`. Keeping FileVault on is the safer default. If you turn it off, compensate as described in [security.md](security.md).

## C. A Linux server

These systemd units are an example. They are not tested by the project, so adapt users and paths.

`/etc/systemd/system/tasteloop-bot.service`:

```ini
[Unit]
Description=Tasteloop bot
After=network-online.target

[Service]
User=tasteloop
WorkingDirectory=/opt/tasteloop
Environment=TASTELOOP_ENV_FILE=/home/tasteloop/.config/tasteloop/.env
ExecStart=/usr/bin/npm run -s bot -- --brand /home/tasteloop/.config/tasteloop/brands/your-brand.yaml
Restart=always
RestartSec=30

[Install]
WantedBy=multi-user.target
```

For approval and digest, create one-shot services (`Type=oneshot`, `ExecStart=… apply` / `… digest`) with timers (`OnCalendar=*:0/10` and `OnCalendar=Mon 08:00`). Then:

```bash
sudo systemctl enable --now tasteloop-bot.service tasteloop-apply.timer tasteloop-digest.timer
```

The vault has to reach the server somehow: Obsidian Headless Sync (see above), Syncthing, or git.
