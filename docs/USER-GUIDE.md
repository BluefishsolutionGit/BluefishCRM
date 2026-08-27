# Bluefish CRM — User Guide

For sales reps and everyday users. Everything here you can do without asking IT.

## Getting in

- Web: open the URL your admin gave you and sign in. If your company uses Microsoft 365, click **Sign in with Microsoft** — your M365 password is your CRM password.
- Mobile: open the same URL on your phone and tap **Add to Home Screen** in Safari / Chrome. The app installs itself. Log in once; it stays logged in.
- MFA: the first time you sign in, if MFA is required, scan the QR code with Google Authenticator / Microsoft Authenticator / 1Password.

## Everyday screens

### Dashboard (Executive)
Your KPI landing page. **Pipeline** is what could close; **MTD** is what already closed this month; **Tasks** is what you have to do today.

**Service + salesperson filters** — the chip row at the top narrows the whole dashboard to one
service line (Box / 3S / 3D / AI&RPA) or one rep, exactly like the Pipeline page. Clear the
filter with the **Clear** link next to the "Filtered" badge in the title.

### Customers
Every company you work with. Search by name; click a card to open the account. The account page shows contacts, activity history, open deals, and documents.

### Leads
People who might become customers. Add a lead in a few seconds — name + company + source is enough. The system scores it automatically. Convert to an opportunity when they're ready to buy.

### Pipeline
Your deals grouped by stage. Drag between stages as they progress. Click a deal to add line items or update the amount.

### Activities
Everything you've done or plan to do: meetings, calls, visits, follow-ups. Filter by date range or owner.

**Outlook calendar sync** — meetings/calls/visits/demos sync two-way with your Outlook calendar
once you connect in **Settings → Integrations**:
- Anything you create in the CRM shows up in Outlook (with attendees, location, meeting link)
- Anything in your Outlook calendar shows up as an Activity in CRM
- Cancellations, edits, and RSVPs sync both ways within ~5 minutes
- The **M365** chip on an activity card means it's linked; click **Resync** if it looks out of date
- **Recurrence** — set a "Repeats" pattern (daily/weekly/monthly + end date) in the New activity
  dialog; Outlook creates the series and CRM tracks it as one row

**Attendees** — add attendees by name (autocompletes from your Contacts) or by typing an
email + Enter. When a Contact matches, you see a blue **CONTACT** badge; unmatched attendees show
a **+ LINK** chip you can click to pick a Contact manually.

**RSVP tracking** — when someone declines or marks tentative in Outlook, you get a notification
in the bell (top-right). Read state persists — items you dismiss with **×** or **Mark all read**
stay dismissed.

### Quotations
Draft a quote from any opportunity. Add products with quantities and discounts. Submit for approval; watch the status on the same page. Once approved, export the PDF.

### Contracts
Contracts your legal team draft. If you own the customer relationship, you'll see the contract on the account page.

### Inbox
Messages from customers on LINE, Facebook Messenger, Email, and the **Bluefish website contact form**
— all in one place. Click a conversation to reply. Use the **quick replies** for common answers.
Switching a channel chip auto-selects the first conversation in that channel; the right pane always
matches the visible list.

### Voice dictation on note fields
A small microphone appears next to note-style fields on desktop (Activities → Notes, Opportunity → Notes
& Description, Lead → Notes / follow-up, Customer → Contact notes). Click it, speak, click again to stop.
The transcript is **appended** to whatever you were already typing — never overwrites. Default language
is Thai (`th-TH`); the browser falls back to English if Thai isn't recognised. Requires HTTPS or
localhost; Firefox is unsupported and the button is hidden there.

## Mobile-only features

Open the app on your phone at `/m` (the desktop URL + `/m`).

### Bottom nav
Home · Leads · Pipeline · Customers · Tasks · **More**. The **More** tab holds the quick-capture
tools below. Tap the **Bluefish CRM** label in the header for a full page index (Contracts,
Documents, Quotations, Inbox, Reports, Nearby, AI Workspace, etc.).

### Home dashboard scope
Chip row at the top of Home lets you re-scope the KPI card:
- **Sales rep** — defaults to your primary service; you also see **Only me** for your personal
  numbers. Your assigned services are marked with a small coloured dot.
- **Manager / admin / auditor** — defaults to **Overall**; you can drill into any service, or tap
  **Only me ▾** to pick a specific sales rep from a bottom-sheet list (ranked by closed value).
  The **TODAY** list also follows the rep you're viewing.

### Quick actions (in **More**)
- **Scan card** — camera opens; snap a business card; AI extracts the company + person fields;
  a review sheet auto-searches existing customers by name/tax ID. Pick "Attach to existing"
  → only a new **Contact** is created; otherwise a new **Customer + Contact** in one save.
- **Scan QR** — reads QR / barcode. If it looks like a Bluefish deep link (`CT-YYYY-####`,
  `QT-YYYY-####`, or an in-app URL) it navigates there directly; otherwise it opens a
  pre-filled **Log activity** sheet.
- **GPS check-in** — creates a `visit` activity stamped with your current lat/lng.
- **Voice note** — Web-Speech dictation, appends to the Activity notes field. Tap once to
  start, again to stop; auto-stops after 20s.

### Pipeline card view
The mobile Pipeline (`/m/opportunities`) has a **▢▢ / ☰** toggle. **▢▢** shows swipeable
Kanban cards — one column per stage with gradient headers (blue / orange / purple / green /
grey) and dot indicators at the bottom for the position. **☰** falls back to the grouped list.

### New task detail
Tap **+ New task** anywhere; the sheet matches the desktop Activities form: type chips,
title, scheduled at, duration, customer picker (search + pick), location, meeting link (auto-shown
for meeting/call/demo), and **Notes** with the same voice-dictation button as the desktop.

### Offline drafts
If you're on the metro with no signal, create the task anyway. It syncs when you reconnect.

## Working with your team

- **Assign** a lead or activity by opening it and picking a new owner.
- **@mention** a colleague in an activity note to get their attention (they see it in their activities feed).
- **Watch** a deal to get notifications when it moves stage.

## Personal settings

Open **Settings** from the top-right menu:

- **Profile → Timezone** — sets the timezone Outlook uses when displaying meetings you push
  from CRM. Default `Asia/Bangkok`; change to whatever matches your local hours.
- **Integrations → Calendar sync** — connect your Microsoft 365 account. See individual
  synced accounts, force a sync now, or disconnect (activities stay in CRM; only the link is removed).
- **Security** — change password, enable/disable MFA.

## Reports

- Choose from the **Reports** page.
- Click **Export → Excel** for a spreadsheet, **PDF** for a printable version.
- **Schedule** a report to email itself to you every Monday morning.

## Getting help

- The bug icon in the bottom-right of every page reports issues straight to support.
- Support email: crm-support@bluefish
- Common questions: <intranet/faq>

## What you can't do (and who to ask)

- **Add a new user** → your admin
- **Change your role/permissions** → your manager + admin
- **Reset MFA if you lost your device** → your admin
- **Integrate a new channel (LINE / FB / Website)** → admin (see Settings → Integrations → Inbox channels)
- **Set up scheduled reports for the whole team** → admin
