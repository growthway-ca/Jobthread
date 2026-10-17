# JobThread

Get every change to a job priced and approved in writing, so nothing turns into
an argument at the final invoice.

v1 is a pilot: one contractor, one real job. See the build brief for scope.

## How it works

1. The contractor signs in with an emailed code and opens a job.
2. **New change**: what's changing, the price before tax, the time added. A
   live preview shows the exact text the client will get.
3. **Send** saves the change (now locked) and opens the phone's Messages app
   with the text and an approval link. **Copy text** is always there as a
   fallback.
4. The client opens `/a/<token>`, with no app and no login, taps **Approve**
   and types their name.
5. The job thread shows the approval with the client's name, the time and the
   price. **Job total** shows the original contract, approved changes,
   subtotal, HST and the new total. Sent-but-unapproved changes are listed
   separately and not counted.

### Beyond the v1 pilot

- **Daily log:** a note for the day with up to 8 photos. Photos are shrunk on
  the phone, stored in a private Supabase bucket (one folder per job), and the
  update can be texted to the client.
- **Payments:** a payment schedule per job. **Request** writes the text
  (amount, HST, and your e-Transfer email from Settings), and **Mark paid**
  records how it was paid. Requested amounts are locked and paid is final.
  The 10% holdback is tracked per job. The **Money** tab shows what's owed,
  what's next and what came in across every job. JobThread records payments;
  it doesn't process them.
- **Quotes:** a scope list, base price, optional add-ons and a deposit. The
  client opens `/p/<token>`, ticks options and accepts with their name. That
  creates the job at base price plus the options they picked, and adds the
  booking deposit to its payment schedule. Sent quotes are locked; changes go
  through **Make a revision**, which withdraws the old link.

## Stack

- Vite + React + TypeScript, React Router, plain CSS (`src/styles.css`)
- Supabase: Postgres, email one-time-code auth, Row Level Security
- Netlify hosting, installable as a PWA

## Setup

### 1. Supabase

1. Create a project at supabase.com.
2. Apply the schema. Either paste
   `supabase/migrations/20261016000001_init.sql` into the SQL editor and run
   it, or with the Supabase CLI:
   ```sh
   supabase link --project-ref <ref>
   supabase db push
   ```
3. **Auth > Sign In / Providers > Email**: leave Email enabled. Turn off
   "Confirm email" if you want first sign-in to be a single step.
4. **Auth > Email Templates > Magic Link** (only editable once custom SMTP
   is set up, see step 6). Until then Supabase's default email sends a
   sign-in link, which the app accepts. With SMTP in place, switch to a code,
   which works better when the app is installed on the home screen. Replace the body with something like:
   ```html
   <h2>Your JobThread sign-in code</h2>
   <p>Enter this code in JobThread: <strong>{{ .Token }}</strong></p>
   <p>It expires in an hour. If you didn't ask for it, ignore this email.</p>
   ```
   Do the same for the **Confirm signup** template, which new users get.
5. **Auth > URL Configuration**: set the Site URL to your Netlify URL, so
   sign-in links come back to the app.
6. Supabase's built-in email sender is heavily rate limited. Before the pilot,
   set up custom SMTP (**Project Settings > Auth > SMTP**), e.g. Resend or
   Postmark.

### 2. Run it locally

```sh
cp .env.example .env.local   # fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm install
npm run dev
```

To test on a phone on the same Wi-Fi, run `npm run dev -- --host` and open the
network address it prints. Approval links use the address the app is opened
on; set `VITE_PUBLIC_URL` to point them somewhere else.

Only the **anon** key goes in the env file. Never put the service-role key in
a `VITE_` variable: those are shipped to the browser.

### 3. Sample data (dev only)

Sign in once and finish the profile step, then:

```sh
psql "$DEV_DATABASE_URL" -v email=you@example.com -f supabase/dev-seed.sql
```

That adds one sample job with one sent change. It's not named `seed.sql`, so
the Supabase CLI never runs it on its own. Don't run it against production.

### 4. Deploy to Netlify

Connect the repo in Netlify. `netlify.toml` sets the build (`npm run build`,
publish `dist`) and the SPA fallback that makes `/a/:token` work on a direct
load. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` under **Site
configuration > Environment variables**, then redeploy.

## Tests

```sh
npm test          # money, tax and SMS-format unit tests
npm run test:db   # schema, RLS and immutability tests against a throwaway Postgres
```

`test:db` needs Postgres 15+ binaries (`initdb`, `pg_ctl`, `psql`) and must
run as a non-root user. In a root-only container, use
`scripts/test-db-as-root.sh`. It applies a small stand-in for Supabase's
`auth` and `storage` schemas (`supabase/tests/auth_stub.sql`), then the
migrations, then runs `security_test.sql` and `features_test.sql`, which check
that:

- a second contractor can't see or change the first contractor's clients,
  jobs, changes or log
- a client link returns only its own change, the client role can't read any
  table, and unknown, draft and void tokens get nothing
- sent changes are locked; approved changes can't be edited, voided or
  re-approved by anyone, including through the API
- only `approve_change()` can approve, using server time; the job log is
  append-only and contractors can only add notes and daily logs to it
- photos can only be uploaded into, and read from, your own jobs' folders
- payment requests lock their amount, paid is final, and payment events
  can't be forged
- sent quotes and their options are locked; only `accept_quote()` can accept,
  and it creates the job and deposit; withdrawn and expired quotes can't be
  accepted

## Security model

- RLS on every table, with column-level grants, so the browser can only write
  the columns it should.
- The client page never touches tables. It calls two security-definer
  functions: `get_change_by_token(token)` returns only what the page shows,
  and `approve_change(token, name)` stamps `approved_at` with server time and
  records the user agent.
- Triggers enforce the change lifecycle: `draft → sent → approved`, with
  `void` allowed from draft or sent. Once sent, the description, price and
  time added are locked. Approved, declined and void are final.
- Tokens are 122 random bits. Pages send `Referrer-Policy: no-referrer`, so
  links don't leak to third parties.

## Decisions beyond the brief

These were small calls the brief implied but didn't spell out:

- **Void** is a change status (`void`), with a `change_voided` log entry. The
  brief says to void and re-send, but its status list didn't include it.
- **Negative prices** are allowed, so a change can be a credit for removed
  work.
- **Time added** is optional. If blank, the text leaves out "adds …".
- **Mark job done / Reopen job** on the job screen, since the jobs list sorts
  active before done.
- `declined` exists in the schema, but v1 has no Decline button; the client
  uses **Ask a question** instead.
- The approval wording on the client page is a placeholder
  (`APPROVAL_WORDING` in `src/pages/Approve.tsx`). Have a lawyer review it.
  The UI makes no claim that approvals are legally binding.
