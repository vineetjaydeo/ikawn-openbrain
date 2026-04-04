# OpenBrain Supabase Switchover — Rollback Procedure

**Scope:** Lucy only (`ikawn-openbrain` Fly app, ruhi.ikawn.in).
Ruhi (`ruhi-os-brain`) is unaffected — it stays on its own Fly PG throughout.

**Target:** Revert from Supabase back to Fly PG in under 5 minutes if anything goes wrong.

---

## Architecture Context

| Env var | Role during dual-write | Role after switchover |
|---|---|---|
| `DATABASE_URL` | Fly PG (secondary / mirror) | Reverted to Fly PG (primary) on rollback |
| `SUPABASE_POOLED_URL` | Supabase pooled (primary reads+writes) | Cleared on rollback |
| `DUAL_WRITE_ENABLED` | `true` — writes go to both DBs | `false` after switchover |

In `src/db.js`, `pool` is the exported connection. When `DUAL_WRITE_ENABLED=false`,
`pool` points directly at `DATABASE_URL` (Fly PG). This is the rollback target.

---

## Pre-Switchover Checklist

Run these checks against Supabase BEFORE flipping `DATABASE_URL`.

### 1. Row count parity

Connect to Fly PG (source of truth):

```bash
~/.fly/bin/flyctl postgres connect --app ikawn-openbrain-db --database ikawn_openbrain
```

```sql
SELECT
  (SELECT COUNT(*) FROM memories)      AS memories,
  (SELECT COUNT(*) FROM conversations) AS conversations,
  (SELECT COUNT(*) FROM messages)      AS messages,
  (SELECT COUNT(*) FROM users)         AS users,
  (SELECT COUNT(*) FROM scheduled_tasks) AS scheduled_tasks;
```

Note those numbers. Then verify the same counts on Supabase via the Supabase SQL editor
at https://supabase.com/dashboard — they must match within a small tolerance (last few
minutes of writes during active dual-write).

### 2. Vector search works on Supabase

Run a quick pgvector similarity query on Supabase (SQL editor):

```sql
-- Should return rows without error
SELECT id, content, 1 - (embedding <=> embedding) AS score
FROM memories
WHERE embedding IS NOT NULL
ORDER BY embedding <=> (SELECT embedding FROM memories WHERE embedding IS NOT NULL LIMIT 1)
LIMIT 5;
```

Confirm: no error, returns 5 rows.

### 3. Embedding coverage

```sql
-- All memories should be embedded (pending = 0)
SELECT embedding_status, COUNT(*) FROM memories GROUP BY embedding_status;
```

`pending` count must be 0 before switchover. The embedding worker re-embeds to
`gemini-embedding-001` 768-dim. If pending > 0, wait for worker to finish.

### 4. Endpoint smoke test (while still on Fly PG / dual-write)

```bash
# Health check
curl https://ruhi.ikawn.in/api/health

# Memory search (requires API key)
curl -s https://ruhi.ikawn.in/api/search?q=test \
  -H "X-Api-Key: $LUCY_API_KEY" | jq '.results | length'

# Brain health page loads
curl -s -o /dev/null -w "%{http_code}" https://ruhi.ikawn.in/brain-health
```

All three must return 200 before proceeding.

---

## Switchover Steps

Perform in this exact order. Do not skip steps.

### Step 1 — Deploy latest code

Ensure the latest code (with dual-write layer + Supabase-compatible schema) is running:

```bash
cd /Users/vineet/ikawn-openbrain && \
  ~/.fly/bin/flyctl deploy --app ikawn-openbrain --remote-only
```

Wait for successful deploy before continuing.

### Step 2 — Point DATABASE_URL to Supabase

This single command is the cutover. It sets Supabase as the live DB and disables dual-write:

```bash
~/.fly/bin/flyctl secrets set \
  DATABASE_URL="postgresql://postgres.ahdixumfdnbrklhwtnlf:OpenBrain%402026@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres" \
  DATABASE_DIRECT_URL="postgresql://postgres:OpenBrain%402026@db.ahdixumfdnbrklhwtnlf.supabase.co:5432/postgres" \
  DUAL_WRITE_ENABLED=false \
  --app ikawn-openbrain
```

Fly will restart the machine automatically (~30–45 seconds).

> **Note on `DATABASE_DIRECT_URL`:** This is the direct (non-pooled) connection used for
> schema migrations (`initSchema`). Supabase pooler (port 6543) does not support
> prepared statements — the direct URL (port 5432) is needed for DDL.

### Step 3 — Verify switchover

```bash
# Watch logs for startup errors
~/.fly/bin/flyctl logs --app ikawn-openbrain --no-tail

# Health check
curl https://ruhi.ikawn.in/api/health

# Quick search test
curl -s "https://ruhi.ikawn.in/api/search?q=ikawn" \
  -H "X-Api-Key: $LUCY_API_KEY" | jq '.results | length'
```

Expected: `[EmbeddingWorker] Starting` in logs, `/api/health` returns 200.

---

## Rollback Steps (Target: < 5 minutes)

If anything is broken after switchover, execute this immediately.

### Step 1 — Revert DATABASE_URL to Fly PG

```bash
~/.fly/bin/flyctl secrets set \
  DATABASE_URL="postgres://ikawn_openbrain:$(~/.fly/bin/flyctl postgres credentials --app ikawn-openbrain-db --json 2>/dev/null | jq -r .password)@ikawn-openbrain-db.flycast:5432/ikawn_openbrain?sslmode=disable" \
  --app ikawn-openbrain
```

> **If the command above fails** (credentials not accessible), use the fallback — the
> original connection string is stored as a Fly secret snapshot. Retrieve it:

```bash
# Option A: Check if you saved it locally before switchover (recommended prep step)
cat /tmp/fly-pg-url-backup.txt  # if you saved it

# Option B: Reconstruct from Fly PG app
~/.fly/bin/flyctl postgres connect --app ikawn-openbrain-db --database ikawn_openbrain -c "SELECT current_user, current_database();"
# Then build: postgres://<user>:<password>@ikawn-openbrain-db.flycast:5432/ikawn_openbrain?sslmode=disable
```

Also clear the Supabase-specific vars to avoid confusion:

```bash
~/.fly/bin/flyctl secrets unset DATABASE_DIRECT_URL DUAL_WRITE_ENABLED --app ikawn-openbrain
```

### Step 2 — Wait for machine restart

Machine restarts automatically after `secrets set`. Wait ~30–45 seconds, then:

```bash
~/.fly/bin/flyctl logs --app ikawn-openbrain --no-tail
```

Confirm you see: `Listening on port 3000` and `[EmbeddingWorker] Starting`.
No `ECONNREFUSED` or `SSL` errors.

### Step 3 — Verify rollback

```bash
curl https://ruhi.ikawn.in/api/health
curl -s "https://ruhi.ikawn.in/api/search?q=ikawn" \
  -H "X-Api-Key: $LUCY_API_KEY" | jq '.results | length'
```

Both must succeed. Check the Brain Health dashboard at ruhi.ikawn.in/brain-health.

---

## Pre-Switchover Backup (Do This Before Step 2)

Save the current Fly PG URL locally before cutting over:

```bash
~/.fly/bin/flyctl secrets list --app ikawn-openbrain
# Copy the DATABASE_URL digest shown (fingerprint only — actual value not shown by CLI)

# Better: get it from the running machine env
~/.fly/bin/flyctl ssh console --app ikawn-openbrain -C "printenv DATABASE_URL" > /tmp/fly-pg-url-backup.txt
cat /tmp/fly-pg-url-backup.txt  # confirm it printed
```

---

## Post-Switchover Monitoring (First 24 Hours)

| Check | How | Pass criteria |
|---|---|---|
| Memory search | ruhi.ikawn.in → search test query | Returns relevant results |
| Embedding worker | Fly logs: `[EmbeddingWorker]` entries every 5s | No errors, `pending=0` |
| Moderation worker | Fly logs: `[ModerationWorker]` entries every 30s | No errors |
| Chat functionality | Open new conversation at ruhi.ikawn.in | Response generated, saved to DB |
| Brain Health dashboard | ruhi.ikawn.in/brain-health | All stats load, embedding queue shows 0 pending |
| Cost monitor | ruhi.ikawn.in/brain-health (Cost Monitor tab) | Spend shown, no spike |
| Error rate | `~/.fly/bin/flyctl logs --app ikawn-openbrain --no-tail` | No repeated error lines |

### Warning signs that should trigger rollback

- `ECONNREFUSED` or `SSL SYSCALL` errors repeating in logs
- `/api/health` returns non-200
- Embedding worker log shows errors on every cycle
- Brain Health page fails to load
- Vector search returns 0 results for queries that previously returned results
- Any unhandled exception mentioning `pg`, `pool`, or `prepared statement`

---

## Fly PG Decommission (After 7-Day Bake Period)

Do NOT decommission Fly PG until:
- [ ] 7 days have passed since switchover with no issues
- [ ] Supabase row counts have been re-verified (no data loss)
- [ ] All workers confirmed healthy on Supabase
- [ ] V has explicitly approved decommission

Decommission steps (when approved):

```bash
# Stop the Fly PG cluster (keeps data, stops billing for compute)
~/.fly/bin/flyctl scale count 0 --app ikawn-openbrain-db

# Verify it's stopped
~/.fly/bin/flyctl status --app ikawn-openbrain-db
```

Do not destroy the app until you have a Supabase backup confirmed.

---

## Quick Reference Card

| Action | Command | Time |
|---|---|---|
| Check logs | `~/.fly/bin/flyctl logs --app ikawn-openbrain --no-tail` | instant |
| Health check | `curl https://ruhi.ikawn.in/api/health` | instant |
| Switch to Supabase | `flyctl secrets set DATABASE_URL=<supabase-pooled>...` | ~45s |
| Roll back to Fly PG | `flyctl secrets set DATABASE_URL=<fly-pg>...` | ~45s |
| Check DB row counts | Connect to DB + run COUNT queries | 2 min |
| View machine status | `~/.fly/bin/flyctl status --app ikawn-openbrain` | instant |
