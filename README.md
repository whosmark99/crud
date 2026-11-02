# Laptop Inventory Management

A inventory dashboard built with **Express.js**, **SQLite** (Node built-in `node:sqlite`), vanilla HTML/CSS/JS, Chart.js and Lucide icons.

## Quick start

```bash
cd laptop-inventory-management
npm install
cp .env.example .env        # Windows: copy .env.example .env
# edit .env and set SESSION_SECRET to a long random string
npm start
```

Open **http://localhost:3000**, click **Create an account**, then sign in.
The **first account registered becomes the Administrator**; later accounts are **Staff**.

The SQLite file (`database/inventory.db`) and all tables are created automatically on first start,
along with starter brands and categories. Nothing else to configure.

Requires Node.js 22.13 or newer (uses the built-in `node:sqlite`, so there is nothing native to compile on Windows).

## Environment variables (`.env`)

| Variable | Purpose | Default |
|---|---|---|
| `PORT` | Server port | `3000` |
| `NODE_ENV` | `production` enables trust-proxy and requires `SESSION_SECRET` | `development` |
| `SESSION_SECRET` | Signs the session cookie (**required in production**) | dev-only fallback |
| `DATABASE_FILE` | SQLite file path | `./database/inventory.db` |
| `MAX_UPLOAD_MB` | Max laptop image size | `3` |
| `COOKIE_SECURE` | Set `true` only when serving over HTTPS | `false` |

## Roles
- **Administrator**: everything, plus editing application settings.
- **Staff**: manage laptops, brands, categories, reports and their own profile.

## Project structure
```
server.js              Express app, sessions, guarded page routes
database/              SQLite schema + session store
middleware/auth.js     requireAuth / requirePage / requireAdmin
routes/                auth, dashboard, laptops, brands, categories, reports, profile (+ settings)
views/                 HTML pages (served only to signed-in users, except login/register)
public/css|js          Styles and client scripts
public/uploads/        Uploaded laptop images
```

## Security notes
- Passwords hashed with bcrypt (`bcryptjs`, same algorithm, no native build step), cost 12.
- Session cookie is `httpOnly` + `SameSite=Lax`; session id regenerated on login; sessions stored in SQLite.
- All SQL uses prepared statements; sort columns are whitelisted.
- Uploads: MIME-type whitelist, size limit, random file names.
- CSV exports neutralise spreadsheet formula injection.
- Login attempts are rate-limited per IP (10 failures / 15 minutes).

## Testing checklist
**Auth**
- [ ] Visiting `/dashboard` while signed out redirects to `/login`
- [ ] Register: duplicate username / email rejected; weak or mismatched password rejected
- [ ] Login works with username **and** email; wrong password shows an error
- [ ] "Remember me" keeps you signed in after closing the browser; without it, the cookie is a session cookie
- [ ] Logout asks for confirmation, then returns to login; Back button does not reopen the dashboard

**Layout**
- [ ] Sidebar collapses/expands with animation; tooltips appear when collapsed; state persists on refresh
- [ ] Profile block stays pinned to the bottom of the sidebar (both states) and opens `/profile`
- [ ] Topbar user menu: My Profile, Account Settings, Logout
- [ ] Notifications dropdown lists recent activity; badge clears after opening
- [ ] Dark/light toggle works and persists after refresh
- [ ] On a phone-width window the sidebar becomes a drawer opened by the menu button

**Dashboard**
- [ ] Five stat cards match the Inventory table counts
- [ ] Brand bar, category doughnut and activity line charts update after adding/editing laptops
- [ ] Recently added table links to laptop details

**Inventory**
- [ ] Add laptop (with image) → toast, table refreshes; modal is centered, even when the page is scrolled
- [ ] Duplicate serial number is rejected (case-insensitive)
- [ ] Edit pre-fills all fields; save updates the row; replacing/removing the image works
- [ ] View details modal; Delete asks for confirmation; bulk delete via checkboxes
- [ ] Search, brand/category/status filters, sort (header click or dropdown), pagination and rows-per-page

**Brands / Categories**
- [ ] Add, rename, delete; deleting one that's in use is blocked with a clear message

**Reports**
- [ ] All five reports load, date filter works, CSV downloads and opens in Excel

**Profile / Settings**
- [ ] Edit profile updates the sidebar/topbar name instantly
- [ ] Change password (wrong current password is rejected); sign in with the new one
- [ ] Theme, rows-per-page and sidebar preferences persist; org name/currency only editable by an administrator
