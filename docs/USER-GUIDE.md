# Bluefish CRM — User Guide

For sales reps and everyday users. Everything here you can do without asking IT.

## Getting in

- Web: open the URL your admin gave you and sign in. If your company uses Microsoft 365, click **Sign in with Microsoft** — your M365 password is your CRM password.
- Mobile: open the same URL on your phone and tap **Add to Home Screen** in Safari / Chrome. The app installs itself. Log in once; it stays logged in.
- MFA: the first time you sign in, if MFA is required, scan the QR code with Google Authenticator / Microsoft Authenticator / 1Password.

## Everyday screens

### Dashboard
Your KPI landing page. **Pipeline** is what could close; **MTD** is what already closed this month; **Tasks** is what you have to do today.

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
Messages from customers on LINE, Facebook Messenger, and Instagram DM — all in one place. Click a conversation to reply. Use the **quick replies** for common answers.

## Mobile-only features

Open the app on your phone at `/m` (the desktop URL + `/m`).

- **GPS check-in**: tap on Home. Records where you are with a `visit` activity. Handy at the customer's office.
- **Scan card**: opens the camera. Snap a business card; the system uploads it and OCRs the fields where possible.
- **Voice note**: 5-second recording, uploaded as a document. Use for quick notes after a meeting.
- **Offline drafts**: if you're on the metro with no signal, create the task anyway. It syncs when you reconnect.

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
- **Integrate a new channel (LINE / FB)** → admin
- **Set up scheduled reports for the whole team** → admin
