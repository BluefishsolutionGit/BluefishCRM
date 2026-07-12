# UAT Plan — Bluefish CRM

Purpose: verify with real users that each role can complete their day-to-day work end-to-end before we go live. Not a bug hunt (QA has already done that) — a **role fit** check.

## Testers

Five users representing the roles that matter most:

1. **Sales rep** — creates leads, works deals, drafts quotes, logs visits from mobile.
2. **Sales manager** — approves quotes, forecasts pipeline, reviews team activity.
3. **Legal officer** — reviews contracts, tracks obligations, initiates e-Sign.
4. **Finance officer** — approves quotes with discount thresholds, reviews revenue reports.
5. **Admin** — creates users, manages permissions, wires channel webhooks.

Optional 6th: auditor with read-only cross-cutting view.

## Environment

- Staging URL: `https://staging.bluefishcrm.example`
- Login: individual accounts (no shared credentials)
- Data: legacy production data migrated 24 hours before UAT begins
- Duration: 5 business days
- Communication: `#crm-uat` Slack channel + shared spreadsheet for defects

## Test scenarios by role

### Sales rep (target: 30 min)

| # | Scenario                                                                 | Expected                          |
|---|--------------------------------------------------------------------------|-----------------------------------|
| 1 | Log in via SSO on desktop                                                | Redirected to dashboard           |
| 2 | Create a new lead from the Leads page                                    | Lead appears with score           |
| 3 | Convert lead → opportunity, add three line items                         | Opportunity in `qualification`    |
| 4 | Draft a quotation from that opportunity                                  | Quote number auto-generated       |
| 5 | Move opportunity through stages to `proposal`                            | Probability auto-updates          |
| 6 | Install PWA on iPhone, log in on mobile                                  | Home tab loads                    |
| 7 | GPS check-in at a customer location                                      | Activity of type `visit` appears  |
| 8 | Record a voice note; verify it uploaded                                  | Document appears with audio       |
| 9 | Go offline; create an activity; go online                                | Draft syncs automatically         |

### Sales manager (target: 20 min)

| # | Scenario                                                                 | Expected                          |
|---|--------------------------------------------------------------------------|-----------------------------------|
| 1 | View pipeline dashboard                                                  | Amounts + stages match team's work |
| 2 | Approve a quotation submitted by a rep                                   | Quotation → `Approved`; audit log has entry |
| 3 | Reject a quotation with a reason                                         | Rep is notified                   |
| 4 | Reassign a lead from one rep to another                                  | Ownership updates                 |
| 5 | Export a sales report to Excel                                           | XLSX opens in Excel, columns match |

### Legal officer (target: 25 min)

| # | Scenario                                                                 | Expected                          |
|---|--------------------------------------------------------------------------|-----------------------------------|
| 1 | Draft a new contract from template                                       | Contract in `Draft`               |
| 2 | Add obligations with due dates                                           | Obligations listed                |
| 3 | Submit for approval                                                      | Enters approval workflow          |
| 4 | Approve as legal step                                                    | Advances to next step             |
| 5 | Send for signature (e-Sign) once fully approved                          | Envelope created; signer URL usable |
| 6 | Complete signer flow; verify contract → `Active`                         | Signed date + status updates      |
| 7 | Mark an obligation complete                                              | Audit trail records who + when    |

### Finance officer (target: 15 min)

| # | Scenario                                                                 | Expected                          |
|---|--------------------------------------------------------------------------|-----------------------------------|
| 1 | Review approval queue                                                    | Quotes needing finance sign-off   |
| 2 | Approve a quote with 15% discount                                        | Advances beyond discount gate     |
| 3 | Reject a quote with 40% discount                                         | Returns to rep with reason        |
| 4 | Open revenue MTD dashboard                                               | Matches accounting system MTD     |

### Admin (target: 20 min)

| # | Scenario                                                                 | Expected                          |
|---|--------------------------------------------------------------------------|-----------------------------------|
| 1 | Create a new user with `sales_rep` role                                  | User can log in                   |
| 2 | Reset that user's MFA                                                    | User re-enrols on next login      |
| 3 | Create an API key with `customers:read` scope                            | Key returned once; can hit `/customers` |
| 4 | Register an outbound webhook for `lead.created`                          | HTTP POST reaches the receiver with `x-bluefish-signature` |
| 5 | Wire the LINE webhook URL in the LINE Console                            | Verify returns 200; a test message lands in Inbox |

## Sign-off criteria

- Every scenario above passes end-to-end for the assigned tester.
- No `Critical` or `High` defects open at end of UAT.
- Users can each answer "would you use this tomorrow?" with yes.
- The steering committee signs the UAT report.

## Defect classification

- **Critical**: data loss, security, or blocks a whole role from working. Fix before go-live.
- **High**: workaround exists but is painful. Fix before go-live.
- **Medium**: minor UX or edge case. Fix within 2 weeks post-launch.
- **Low**: cosmetic. Backlog.
