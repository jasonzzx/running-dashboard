CREATE TABLE IF NOT EXISTS cloud_settings (
 id integer PRIMARY KEY CHECK(id=1),
 dataset_url text NOT NULL,
 public_snapshot uuid,
 metadata jsonb NOT NULL DEFAULT '{}',
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS cloud_connections (
 provider text PRIMARY KEY CHECK(provider IN ('garmin','strava')),
 encrypted text NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS cloud_jobs (
 id uuid PRIMARY KEY,
 status text NOT NULL CHECK(status IN ('queued','running','validating','ready','published','failed')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 result jsonb,
 error text
);
CREATE UNIQUE INDEX IF NOT EXISTS cloud_one_active_job ON cloud_jobs ((true)) WHERE status IN ('queued','running','validating');
CREATE TABLE IF NOT EXISTS cloud_snapshots (
 id uuid PRIMARY KEY REFERENCES cloud_jobs(id),
 manifest jsonb NOT NULL,
 published_at timestamptz
);
CREATE TABLE IF NOT EXISTS cloud_activities (
 activity_key text PRIMARY KEY,
 payload jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS cloud_oauth_states (
 digest text PRIMARY KEY,
 user_id text NOT NULL,
 encrypted text NOT NULL,
 expires_at timestamptz NOT NULL
);
REVOKE ALL ON cloud_settings, cloud_connections, cloud_jobs, cloud_snapshots, cloud_activities, cloud_oauth_states FROM PUBLIC;
