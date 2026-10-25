# Weekly local sync / 每周本地同步

Double-click **Start Admin.command** on this Mac. Keep its terminal window open.
The authenticated browser page defaults to Chinese and supports English.
The public dashboard's **管理 / Admin** link explains how to launch it.

在 Mac 上双击 **Start Admin.command**，保持终端窗口打开。首次连接账户后，
每周点击 **同步最新数据**，查看结果，再点击 **发布仪表盘**。

## Connect once

- Garmin: open https://connect.garmin.com/app/settings/personalApiToken, sign in,
  create a Personal API key, and enter it in the local admin form. Renew it when
  Garmin's chosen expiration period ends. No Garmin password is stored.
- Strava: create your application at https://www.strava.com/settings/api.
  Set Authorization Callback Domain to `127.0.0.1`. Enter Client ID and Client
  Secret in the local admin form, then authorize activity read access on Strava.
  The callback is `http://127.0.0.1:8765/oauth/strava/callback`.
- Both connections are verified against the historical account before saving.
  Credentials live only in the ignored `data/admin/credentials.json`, mode 0600.
  Do not paste credentials into chat or commit them to Git.

## Weekly workflow

1. Open the launcher and click **Sync latest data / 同步最新数据**.
2. Read the counts for new, enriched, skipped and ambiguous activities.
3. Click **Publish dashboard / 发布仪表盘**. This commits only validated generated
   files and pushes to the existing GitHub `main` branch. Vercel then deploys.

The first sync starts at the existing dataset's latest activity date; wellness
starts at its latest daily date. Subsequent runs include a seven-day overlap
from each provider's last successful checkpoint. Known provider IDs are skipped.
No bulk history request or historical edit/deletion reconciliation is performed.
Backdated uploads older than this window are intentionally outside this mode.

Existing canonical IDs and non-null historical values are preserved. A unique
cross-provider match requires compatible sport, start within five seconds,
distance within 2% or 100 metres, and elapsed duration within 30 seconds.
Possible overlaps are held in `sync_review`, excluded from new totals, and
reported in the UI. They require manual investigation; this UI does not resolve them.
Missing fields may be filled without replacing existing values.

New paired activities keep Strava summaries and prefer Garmin original FIT
recordings. When Garmin originals are unavailable, Strava streams supply available
charts. Existing recording series are preserved; Garmin summaries can enrich a
previously imported Strava activity, but existing streams are not replaced.
Missing new recordings are queued for retry. Original JSON and downloads are
archived in `data/raw/api/<run-id>/`.

Garmin API units are mapped separately from account-export units: API distances
are metres and durations seconds, stride length centimetres, vertical oscillation
centimetres, and running cadence steps/minute. Full source responses are retained.

Recovery imports run through yesterday, never today. They add sleep duration/score,
resting HR, steps, stress, and weekly HRV; existing values are frozen, missing fields
may be filled. Readiness, acute/chronic load and other wellness endpoints are not
part of this initial connector and retain their historical records. Activity load
and available running mechanics are imported from activity summaries. API access
does not guarantee every export field is returned.

## Storage and recovery

The sync copies the current DuckDB into `data/admin/staging/<run-id>/`, merges there,
exports Parquet, rebuilds changed recording details and all aggregate evidence, and
validates both language reports before promotion. No live database change occurs
if download, merge, build or validation fails.

Before promotion, the previous DuckDB and import status are copied into
`data/admin/backups/<run-id>/`. `data/admin/promotion.json` journals the promotion;
if interrupted, the next launch finishes that validated snapshot before accepting
another sync. Promotion is a recoverable multi-file operation, not one filesystem
transaction. Avoid opening the database in another writer during sync.

Each successful run retains its staging snapshot and backup. These consume disk
space; they are deliberately not automatically deleted in this first version.
The latest published dashboard continues serving while the Mac is offline.

The analysis numbers and report templates are regenerated from the new evidence.
This is not an AI analysis service; independently written narrative templates may
need a separate review when your goals or training context change.

## Local access

The server binds only to `127.0.0.1:8765`. The launcher opens a private login URL;
the page exchanges its fragment token for an HttpOnly session cookie and removes
the token from the address bar. Requests enforce Host, Origin and CSRF checks.
The static public website contains no credentials and cannot perform syncs itself.

If the port is busy, use the existing admin browser window or stop its terminal
with Ctrl+C before launching again. A lost session can be replaced by restarting
the launcher. Never share its private login URL.

## Validation

```sh
PYTHONPYCACHEPREFIX=/tmp/running-admin-pycache .venv/bin/python tests/check_sync.py
PYTHONPYCACHEPREFIX=/tmp/running-admin-pycache .venv/bin/python tests/check_sync_pipeline.py
# With Playwright available through NODE_PATH:
node tests/check_admin_browser.cjs
```

The pipeline test uses fake APIs against an isolated copy, including failure
rollback and exact historical-row preservation. It never changes the real dataset.
Live provider verification requires completing the account setup in the local UI.

API contracts checked against Garmin's official Personal API Swagger and client:
https://developer.garmin.com/gc-developer-program/personal/swagger-docs/
https://github.com/garmin/connect-personal-api-python
https://developers.strava.com/docs/authentication/
