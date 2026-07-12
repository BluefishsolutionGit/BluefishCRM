# Disaster Recovery Plan

**Targets:** RPO 1 hour · RTO 4 hours.

## Data classification

| Store           | Contents                          | Criticality | Backup cadence |
|-----------------|-----------------------------------|-------------|----------------|
| PostgreSQL      | All business data + audit log     | Critical    | Every 30 min   |
| Object storage  | Uploaded docs, contract PDFs      | High        | Continuous replication |
| Prometheus TSDB | Metrics                           | Low         | Best effort    |
| Application code| Git remote (multiple mirrors)     | Critical    | On every push  |

RPO 1h is met by the 30-min DB dump cadence (worst case: 30 min of data lost).

## Backup strategy

- **Postgres**: `pg_dump -Fc` every 30 minutes to local disk, then rsync to an offsite S3-compatible bucket. Retain 30 daily + 12 monthly.
- **Object storage**: enable versioning + cross-region replication.
- **DB dumps** are encrypted with GPG (recipient: `ops@bluefishsolution.com`) before offsite upload.
- The `scripts/backup-restore-drill.sh` is run **monthly** as a scheduled job and must exit 0 to pass. Failure pages the on-call.

## Restore drill (proves RTO)

Full-system restore should complete in under 4 hours. The chronogram we target:

| Elapsed | Milestone                                      |
|--------:|-----------------------------------------------|
| 0:00    | Incident declared; comms sent.                 |
| 0:15    | Fresh VPS provisioned; base image ready.       |
| 0:45    | Postgres installed; DB dump downloaded.        |
| 1:30    | DB restored (`pg_restore -j 4`).               |
| 2:00    | API deployed, migrations applied (no-op).      |
| 2:30    | Object storage mirror re-linked.               |
| 3:00    | DNS updated; smoke test starts.                |
| 3:30    | Load test rerun (`scripts/load-test.mjs`).     |
| 4:00    | Users notified; incident closed.               |

If any milestone slips, comms channel gets an update; do not stay silent.

## Failure modes we've planned for

1. **Single-host loss (VPS gone)** — restore to a new VPS from the latest offsite dump. Covered above.
2. **DB corruption** — restore the last known-good dump into a scratch DB, verify, then swap.
3. **Ransomware / malicious drop** — the offsite bucket has versioning + object-lock (WORM). Restore from a snapshot from before the incident window.
4. **Cloud provider outage** — code and dumps live in a second region; DR host lives there permanently on standby (cold — spin up on demand).
5. **Accidental data deletion by a user** — audit log tells you when/who; restore just that row or table from the latest dump. AuditLog is append-only from the app; if a DB-level tampering is detected, restore from the pre-tamper dump.

## Comms plan

- Status page: `https://status.bluefishsolution.com` — update within 15 minutes of incident declaration.
- Slack channel `#crm-incidents` — running commentary.
- Email to affected users: template in `docs/templates/incident-email.md` (fill fields, do not compose from scratch).
- Regulatory notification (if PII exfiltration confirmed): PDPA data controller has 72 hours to notify PDPC. Legal owns this call; ops surfaces facts.

## Post-incident

- Blameless post-mortem within 5 business days.
- Action items land in the tracker with owners and dates.
- The runbook and this DR plan get updated to reflect what we learned. If we followed the runbook step-by-step and it still went wrong, the runbook is the bug.
