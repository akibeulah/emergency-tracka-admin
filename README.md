# Emergency Tracka — admin client

Web console for Emergency Tracka's own platform administrators (React + Vite + TypeScript):

- **Onboarding Queue**: review facility claims; approve under the two-person rule (the second
  distinct administrator's approval issues the Facility Code) or reject with a reason.
- **Facility Directory**: verified facilities and their codes; suspend a facility.
- **Alerts**: the oversight queue (capability mismatch, accept-then-cancel, payout changes, …).

Mockups: `../Mockups/web/platform-admin/`. Requirements: `../docs/emergency-tracka-prd.md`.

## Run

```sh
npm install
npm run dev        # http://localhost:5175 (strict port; the server's CORS_ORIGINS lists it)
npm run typecheck
npm run build
```

Sign in with facility code `PLATFORM` (fixed on this console's login page) and a platform admin
email. On the local seed: `platform1@demo.emergencytracka.test` and
`platform2@demo.emergencytracka.test`. With `OTP_DEV_ECHO=true` on the server, the code is in the
`devCode` field of the `/auth/otp/request` response and in the server log; the console does not
read it. Approving a claim needs both accounts: sign out and sign in as the other one.

## Live vs mock

Set in `.env.local` (gitignored; see `.env.example`):

| Variable | |
|---|---|
| `VITE_API_MODE` | `mock` (default): everything runs in the browser against example data, labelled "Mock mode". `live`: talks to `server/` |
| `VITE_API_URL` | Server base URL including `/api`. Default `http://localhost:3000/api` |
| `VITE_MOCK_MODULES` | Live mode only. Comma-separated modules (`claims`, `facilities`, `alerts`) to answer from the mock. Their pages carry an "Example data (mock)" tag. Leave empty |

`src/api/client.ts` is the interface the pages use; `src/api/live.ts` maps it onto the server and
converts the server's documents into the console's types (`src/api/types.ts`); `src/api/mock/` is
the in-browser implementation.

## Server routes used (live mode)

| Console | Route |
|---|---|
| Sign in | `POST /auth/otp/request {facilityCode:'PLATFORM', email}` then `POST /auth/otp/verify {facilityCode, email, code, deviceId}` |
| Token refresh (on 401) | `POST /auth/refresh {refreshToken}` |
| Sign out | `POST /auth/logout` |
| Claims queue, and a single claim | `GET /admin/facilities/claims` (pending claims, full documents; a single claim is found in this list) |
| Approve / reject | `POST /admin/facilities/:id/approve` · `POST /admin/facilities/:id/reject {reason}` |
| Directory | `GET /facilities` (verified only; search and filters are applied in the browser) |
| Suspend / reinstate | `POST /admin/facilities/:id/suspend {reason}` · `POST /admin/facilities/:id/reinstate` (`:id` is the facility's database id) |
| Alerts | `GET /admin/alerts` (facility names resolved from `GET /facilities`) |

## What the server does not provide yet

The console shows an honest "not available on the server yet" state for these in live mode
(`capabilities` in `src/api/live.ts`) rather than example data:

- **Decided claims tab.** The server lists pending claims only.
- **Suspended facilities in the directory.** `GET /facilities` returns verified rows only, so a
  suspended facility drops out of the list and cannot be reinstated from the console. Staff
  counts, verification dates and suspension reasons are not returned either (shown as "—").
- **Changing an alert's status** (open / reviewing / resolved). The buttons are hidden.
- **Approver names.** Approvals carry admin ids only: the console shows "(you)" for your own and
  "Another platform administrator" otherwise.
- **Claimant name and role.** The claim form does not capture them; the contact email is shown.
- **Document links.** Claims hold storage keys only; there is no signed-link route yet.
- **Account switching.** There is no `/auth/switch`; every account needs its own sign-in code,
  and this console only serves `PLATFORM` accounts, so the switcher lists the current account only.
