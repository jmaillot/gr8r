# Feature Research

**Domain:** Self-hosted project-management workspace (Gr8r Studio) — localisation / i18n milestone v1.2, English base + complete French
**Researched:** 2026-10-22
**Confidence:** HIGH (inventory read directly from the repository; every file, route, modal, popover and test named below exists in the tree)

---

## Feature Landscape

### The question this answers

A "complete localisation surface" for *this* app is not "add French strings". It is: **every user-visible
byte the app can emit**, in five classes, plus a per-user locale that decides which class is used.

| Class | What it is | Where it lives in this repo |
|-------|-----------|------------------------------|
| **1. Strings** | Literal English in template strings and JS | ~1 800 occurrences across 37 files (`PROJECT.md`) |
| **2. Pseudo-strings** | English *values* stored as data | `src/core/constants.js` (STATUSES, PRIOS, LABELS, PSTAT), `ROLE_LABELS` in `src/core/store.js:250`, seed rows |
| **3. Formats** | Dates, times, numbers, plurals, sizes, durations | `src/core/utils.js` (`fmtDate`, `relDate`, `ago`, `dayBucket`), `S.prefs` |
| **4. Server-emitted** | Error payloads and the invite email | `server.js` (58 error strings), `mailer.js` (`buildInviteMessage`) |
| **5. Document metadata** | `<html lang>`, seed content, titles | `index.html`, `src/data/seed.js` |

Missing any one of the five produces a "half-translated" app that fails the milestone's own
no-English-leak test.

---

### Table Stakes (Users Expect These)

These are non-negotiable for "the app speaks French". Missing them = the product feels broken in
French even when every button is translated.

#### A. The i18n layer itself

| Feature | Why Expected | Complexity | Notes for Gr8r |
|---------|--------------|------------|----------------|
| `t(key, params)` runtime + JSON catalogue per locale | The whole premise; no runtime dependency allowed (`PROJECT.md` decision 1) | MEDIUM | New module `src/i18n/` — `t()`, `locales/en.json`, `locales/fr.json`. Must be plain JSON importable by **both** Vite (browser) and plain `node server.js` (Node 24 import attributes). `server.js` currently imports *only* `mailer.js` and node builtins — it does **not** import from `src/`, so a shared catalogue path must be added deliberately. |
| English as the base catalogue | Fallback language, and the source of truth for key names | HIGH | ~600–900 keys. Extraction is mechanical but touches 37 files; the EN catalogue must be the *literal* current strings so nothing changes for existing users. |
| Named-parameter interpolation | "3 people have access to {ws}", "{n} invite{plural} sent" | LOW | `t('members.access', { n: 3, ws: name })`. |
| Plural rules | "1 task" vs "3 tasks" — the app pluralises by hand in ~15 places (`actions.js:1010,1021,1202,1216,1634,1660,1662,1664,1666`, `auth.js:171`, `modals.js:58`) | MEDIUM | Needs at minimum English one/other and French one/many (`0` and `1` are singular in French — French has no separate zero form). CLDR plural categories are overkill here; a two-form `{one|many}` is enough. |
| Missing-key fallback to English | A partially translated locale must not render `undefined` | LOW | Log the miss in dev; render the EN string. |
| Per-user locale (column + migration) | "A French speaker in an English workspace keeps their own language" (`PROJECT.md` decision 3) | MEDIUM | `users` table has no locale column today (`server.js:79-87`). Add `locale text not null default 'en'` + a migration in the same style as `migrateTenancy()` (`server.js:844`), with the pre-migration `vacuum into` backup that v1.1 already proves. Server returns it on `/api/me`. |
| Language selector offers only EN + FR | The current selector offers six languages that do nothing (`src/pages/settings.js:176`) | LOW | `Deutsch`, `Español`, `日本語`, `English (UK)` must disappear. `prefs.lang` currently lives in the **shared** workspace document — it must move to the account. |
| `<html lang>` reflects the active locale | Screen readers, browser translation prompts, hyphenation | LOW | `index.html` is hard-coded `<html lang="en">`; set it at boot from the user's locale. |

#### B. The user-visible surfaces — every one must be translated

This is the inventory the roadmapper needs. Each row is a real file in this repo.

| Surface | File | Concrete English that must become a key | Complexity |
|---------|------|------------------------------------------|------------|
| **Sidebar / topbar / bottom nav / breadcrumbs** | `src/shell/layout.js` | "Home", "Inbox", "My Tasks", "Favorites", "Notifications", "Workspace", "Overview", "Projects", "Tasks", "Calendar", "Timeline", "Members", "Activity", "Archive", "Teams", "Help & resources", "Settings", "New", "Search or jump to…", "More", "Skip to content", "You're offline." | MEDIUM |
| **Page routes (13)** | `src/pages/home.js`, `inbox.js`, `my-tasks.js`, `favorites.js`, `notifications.js`, `search.js`, `overview.js`, `projects.js`, `project.js`, `tasks.js`, `members.js`, `activity.js` + `src/features/archive.js` | Page headings, lead paragraphs, empty states, table headers, tab labels | HIGH |
| **View routes (5)** | `src/views/board.js`, `list` via `src/components/task-list.js`, `table.js`, `calendar.js`, `timeline.js`, `files.js`, `project-overview.js` | Column headers ("Member", "Role", "Team", "Active projects", "Tasks", "Last active", "Status"), view names ("Board", "List", "Table", "Overview", "Timeline", "Files"), filter/sort labels | HIGH |
| **Modals (10 types)** | `src/overlays/modals.js` | `task` ("New task", "Create task", "Add a description… (optional)", "Subtasks", "Attachments", "Attach files", "Create more"), `project` ("New project", "Project name", "Description", "Icon", "Color", "Team", "Lead", "Target date", "Template", "Create project"), `share` ("Share “{name}”", "Invite by email", "Permission", "People with access", "General access", "Copy link", "Done", "Remove access"), `invite` ("Email addresses", "Role", "Team", "Guests", "Invite links", "Send invites", "Copy invite link"), `confirm` ("Type {x} to confirm"), `prompt` ("Cancel", "Save"), `shortcuts` (4 group headings + 19 shortcut names), `team`, `filePreview` ("Uploaded by {name}", "Attached to"), `saveView` ("Save view", "View name", "Layout", "Save view") | HIGH |
| **Popovers (~22 types)** | `src/overlays/popovers.js` | "Create", "Task", "Project", "Team", "Invite member", "Unassigned", "Assign to…", "Assign subtask to…", "Filter labels…", "Move to project…", "Does not repeat", "Daily", "Weekly", "Every 2 weeks", "Monthly", "Clear estimate", "Blocked by…", "Today", "Tomorrow", "Next week", "In 2 weeks", "Clear", "Role for {name}", "Full control…", "Manage members…", "Create projects…", "Only sees projects…", "Workspaces", "Workspace settings", "Invite members", "Sign out", "Theme", "Light", "Dark", "System", "Keyboard shortcuts", "Command menu", "Help & resources", "Design system", "System states", "Replay onboarding", "Simulate offline", "Reset demo data", "Sort by", "Group by", "Visible columns", "Reset widths", "Filter by", "Clear all", "Add filter:", "Where", "and", "is", "is not", "Select…", "Remove filter", "No matches" | HIGH |
| **Context menu** | `src/overlays/context-menu.js` | Every item label | MEDIUM |
| **Task drawer / comments** | `src/overlays/drawer.js` | "Conversation", "Reply… use @ to mention", "Send comment", activity verbs | MEDIUM |
| **Toasts (~135 call sites)** | `src/ui/toast.js` + `src/actions/actions.js` (118 sites), `teams.js`, `drag-drop.js`, `subtasks.js`, `archive.js` | "Dark mode on", "Changes saved", "Task duplicated", "Archived “{t}”", "Deleted “{t}”", "Moved {p} up", "Completed “{t}”", "Added to favorites", "Updated {n} tasks", "Marked {n} tasks as done", "Created {key}", "Created {p} with {n} starter tasks", "Access requested. We'll notify you when {name} responds.", "Only the project lead, an admin or the owner can change access", "Enter a valid email address, like name@company.com", "Your changes couldn't be saved. You're offline.", plus the toast **action labels** "Undo", "Open", "Try again", "Copy" | HIGH |
| **Notifications + inbox** | `src/pages/notifications.js`, `src/pages/inbox.js` | "Notifications", "{n} unread", "All", "Unread", "Mark all as read", "Mark as unread", "Mark as read", "Mentions", "Assignments", "Comments", "Updates", "Select a notification", "Open project", "Back", "Reply", "Conversation" | MEDIUM |
| **Notification *fragments* (pseudo-strings)** | `src/data/seed.js` `notifs[].text` + `src/pages/inbox.js` `notifText()` | The seed stores English sentence fragments as data: `"mentioned you in"`, `"assigned you"`, `"commented on"`, `"moved to Review"`, `"completed"`, `"is due today"`, `"Product Launch is at risk"`. `notifText()` splices them: `"{who} mentioned you in {task}"`. **These are data, not templates** — the FR seed needs FR fragments, or the fragments become catalogue keys with interpolation. | HIGH |
| **Empty states** | `src/ui/helpers.js` `empty()` | "You're all caught up.", "No unread notifications. We'll let you know when something needs you.", "No results found", "No members match that search.", "Try a different keyword, or press Tab to search everything." | LOW |
| **Validation messages (client)** | `src/actions/actions.js` via `S.ui.errors.*` | "Give the task a name", "Give the project a name", "Enter at least one email address", "{email} isn't a valid email address" | LOW |
| **Validation + error messages (server)** | `server.js` — **58** `error:` payloads (55 literal + 3 template) | "Email or password is incorrect", "Use at least 10 characters, including a number or symbol", "That URL is already taken", "Workspace changed elsewhere", "Only workspace admins can do that", "Your account has read-only access", "This invite has expired", "This invite has already been used", "An account with this email already exists. Sign in to accept the invite.", "Too many attempts. Try again in 15 minutes.", "That person is not a member of this workspace", "Promote someone else to owner before you leave", "Every workspace needs an owner", "Use “Leave workspace” to remove yourself" … | HIGH — see dependency note |
| **Command palette** | `src/overlays/palette.js` | 18 command names ("Create task", "Go to Home", "Switch workspace…", "Open settings", "Sign out"…), group headings ("Suggestions", "Recent tasks", "Navigation", "Commands", "Tasks", "Projects", "People", "Files", "Comments", "Switch workspace"), search-scope tabs ("All", "Tasks", "Projects", "People", "Files", "Comments"), placeholders ("Search tasks, projects, people, files, comments…", "Find a workspace…", "Type a command or search…"), footer hints ("navigate", "select", "search mode", "back to commands"), suggested items ("Overdue tasks", "Tasks assigned to me", "High priority in {p}", "Files in {p}") | HIGH |
| **Settings pages (18 sections)** | `src/pages/settings.js` | `SET_NAV` group headings ("General", "Workspace", "Notifications", "Personal", "Security", "Billing") + 19 nav items, plus every section's lead paragraph, row title, row description, hint, alert and button: "Workspace icon", "Workspace name", "Workspace URL", "Changing the URL will break existing links.", "Only workspace admins can change these settings.", "Save changes", "Danger zone", "Leave workspace", "Delete workspace", "Theme", "Light", "Dark", "System", "Accent color", "Density", "Sidebar density", "Task display", "Motion", "Follow system", "Reduce motion", "Language", "The language used throughout the interface.", "Spellcheck", "Time zone", "Date format", "Preview:", "Start week on", "Time format", "12-hour (2:30 PM)", "24-hour (14:30)", "Default project view", "Show completed tasks on boards", "Archived projects", "Restore", "Delete", "No archived projects…", "Members can create projects", "Members can invite guests", "Allow public share links", "Role permissions", "Mentions", "Assignments", "Comments", "Daily digest", "Due date reminders", "@team mentions", "@workspace mentions", "When I'm assigned a task", "When my task changes status", "When my task is overdue", "Avatar color", "Full name", "Title", "Email", "Contact a workspace owner to change your sign-in email.", "Save profile", "Open on launch", "Open tasks in", "Side panel", "Full page", "Confirm before deleting tasks", "Keyboard shortcuts", "Current password", "New password", "Confirm new password", "At least 10 characters with a number or symbol.", "Password updated. Other sessions stay signed in.", "This device", "Sign out", "Sign out of all other sessions", "Two-factor authentication is on/off", "Recovery codes", "1. Scan the QR code", "2. Enter the 6-digit code", "Verify", "Cancel", "Your subscription and usage.", "Current plan", "Renews {d} · Billed monthly", "View invoices", "Members", "Storage", "Projects", "Current", "Upgrade", "Downgrade", "Contact the owner", "Only the workspace owner can change the plan", "Payment method and billing details.", "Expires 08/2028 · Default", "Update", "Billing email", "Billing address", "Tax ID", "Past invoices for this workspace.", "Invoice", "Date", "Amount", "Status", "No archived projects", plus the **password-strength meter labels** "Too short / Weak / Fair / Good / Strong" (`settings.js:452`) | HIGH |
| **Auth pages (10 states)** | `src/pages/auth.js` | `login` ("Welcome back", "Sign in to {ws}", "Email", "Password", "Forgot password?", "Hide/Show password", "Remember me for 30 days", "Sign in", "or", "Continue with Google/Microsoft/Apple", "Don't have an account?", "Sign up", "Accounts are created by your workspace admin."), `join` × 3 variants ("Invite unavailable", "Join {ws}", "This address already has a Gr8r account. Sign in with it to join this workspace.", "Sign in and join", "Create your account to get access to this workspace.", "Full name", "Your name", "This invite is for this address.", "Create account & join", "Already have an account?", "Invited with the wrong address?"), `no-workspace` ("You're not in a workspace yet", "Signed in as {email}", "Sign out"), `signup` ("Create your account", "Free for up to 3 members. No credit card required.", "or sign up with email", "Work email", "Create account", "By creating an account you agree to the Terms and Privacy Policy.", "Log in"), `forgot` ("Reset your password", "Enter your account email and we'll send you a reset link.", "Send reset link", "Back to sign in"), `forgot-sent` ("Check your email", "It expires in 30 minutes.", "Open reset link", "Didn't get it?", "Resend email"), `reset` ("Choose a new password", "for {email}", "Confirm password", "Reset password"), `reset-done` ("Password updated"), `verify` ("Verify your email", "Waiting for verification…", "I've verified my email", "Resend email in {n}s", "Wrong email?", "Change it") | HIGH |
| **Onboarding wizard (6 steps)** | `src/pages/auth.js` `renderOnboarding()` | "What are you working on?", "We'll tailor templates and views to fit. You can change this later.", "Product", "Design", "Marketing", "Engineering", "Personal", "Other", "Create your workspace", "A workspace is where your team's projects live.", "Workspace name", "Workspace URL", "Your workspace will live at {url}", "How does your team work?", "Boards", "Lists", "Timelines", "Tables", "Team size", "Just me", "Create your first project", "Start from a template or a blank project.", "Project name", "Invite your team", "Send invites", "Your workspace is ready", "Here's what we set up for you.", "starter tasks", "No invites yet", "They'll appear in Members once they join", "Open workspace", "Step {n} of 6", "Continue", "Back", "Skip for now", "Exit setup" | HIGH |
| **404 / 403 / failed states** | `src/pages/errors.js` | "ERROR 404", "Page not found", "The page you're looking for was moved, deleted, or never existed. Check the link or head back home.", "Go back", "Go to Home", "ERROR 403", "You don't have access", "{name} is a private project.", "Ask {lead} to add you, or request access and we'll let them know.", "Back to projects", "Request access", "Something went wrong.", "This page failed to load. Your data is safe — try again in a moment.", "Try again" | LOW |
| **Invite email (server-rendered)** | `mailer.js` `buildInviteMessage()` | Subject: "You're invited to {workspace}". Plain body: "Hi,", "{inviter} invited you to join {workspace} on Gr8r Studio as {role}.", "Open this link to create your account:", "This invitation is for {to} and expires on {date}. It can be used once.", "If you weren't expecting it, you can ignore this email.". HTML body: same sentences + "Accept invitation", "Or paste this link into your browser:". Plus the hard-coded role phrases **"an admin" / "a member" / "a guest"** and the hard-coded `'en-US'` date format (`mailer.js:397,401`). | MEDIUM — see dependency note |
| **Seeded demo content** | `src/data/seed.js` | 8 member names + job titles ("Head of Product", "Frontend Engineer", "Content Strategist", "Freelance Copywriter"), 7 project names + descriptions, ~50 task titles, milestone names, 14 comment texts, 10 notification texts, 4 team names + descriptions, file names, invoice rows, `notifPrefs` labels | MEDIUM |
| **`<html lang>` + document title** | `index.html` | `<html lang="en">` | LOW |

#### C. Pseudo-strings: English stored as data

These are the strings that are *values*, not templates. They are easy to miss and they leak into the
UI through `s.name`, `p.name`, `v.name` lookups.

| Pseudo-string | Where | Complexity | Note |
|---------------|-------|------------|------|
| Task statuses "Backlog / To Do / In Progress / Review / Done" | `src/core/constants.js` `STATUSES` | MEDIUM | `s.name` is rendered directly in popovers, pills, table cells. Move the *display name* to the catalogue; keep the `id` as the stable key. |
| Priorities "Urgent / High / Medium / Low / No priority" | `constants.js` `PRIOS` | LOW | Same pattern. |
| Project statuses "Planning / In Progress / At Risk / On Hold / Completed" | `constants.js` `PSTAT` | LOW | Also used as the sidebar status-dot `title` attribute. |
| Labels "Design / Frontend / Backend / Research / Content / Bug / QA / Growth" | `constants.js` `LABELS` | LOW | Seeded labels are user data in the document; the *catalogue* names should win for the built-in set. |
| Roles "Owner / Admin / Member / Guest" | `src/core/store.js:250` `ROLE_LABELS` + `constants.js` `ROLES` | MEDIUM | Two vocabularies: lowercase server roles (`owner/admin/member/viewer`) and title-case display roles (`Owner/Admin/Member/Guest`). Both must map to FR: "Propriétaire / Administrateur / Membre / Invité". **Gender agreement**: "Invité" is masculine; a neutral "Invité·e" or the noun form "Invité" must be chosen once. |
| Permission levels "Can view / Can comment / Can edit / Full access" | `src/overlays/modals.js` `PERMS` (line 176) | LOW | FR: "Lecture / Commentaire / Édition / Accès complet". |
| File type names "Figma / PDF / Archive / Image / Spreadsheet / Document / File" | `src/ui/helpers.js` `FT` (line 74) | LOW | "Archive" → "Archive" (same), "Spreadsheet" → "Tableur", "Document" → "Document". |
| Recurrence "Does not repeat / Daily / Weekly / Every 2 weeks / Monthly" | `src/overlays/popovers.js:173` | LOW | Stored as the *value* `t.recur` in the task document — so the FR label is a display mapping over English values. |
| Estimates "30m / 1h / 2h / 4h / 1d / 2d / 3d / 5d / 8d" | `src/overlays/popovers.js:183` | LOW | FR display: "30 min / 1 h / 2 h / 1 j / 2 j…". The stored value stays ASCII; only the label is localised. |
| Sort/group field names | `src/overlays/popovers.js:277-312`, `src/shell/view-engine.js` `FIELDS` | LOW | "Manual", "Priority", "Due date", "Start date", "Title", "Status", "Assignee", "Created", "Last updated", "No grouping". |
| Filter operators "is / is not" | `src/overlays/popovers.js:341` | LOW | FR: "est / n'est pas". |
| Project templates (7) + their 6 task names each | `src/overlays/modals.js` `TEMPLATES` (line 95) | MEDIUM | "Blank project", "Product Development", "Website", "Marketing Campaign", "Design Project", "Software Development", "Personal Project" + "Discovery to launch", "Spec, build, ship" + 42 starter-task names ("Define problem statement", "User research plan", "Write PRD"…). These are **created content** — the FR template must create FR task titles, which means the template's task list is catalogue data, not a constant. |
| Invoice status "Paid" | `src/data/seed.js:520` | LOW | FR: "Payée" — **feminine**, agreeing with "facture". A concrete gender-agreement case. |
| Plan names "Free / Team / Business" | `src/pages/settings.js:395,410` | LOW | Stored in the workspace document as a display value. Decision: keep them as product names (untranslated) or translate ("Gratuit / Équipe / Entreprise"). If translated, the change-plan request (`server.js:1479` validates against `['Free','Team','Business']`) still uses the English ids. |
| Toast **action** labels "Undo", "Open", "Try again", "Copy" | `src/ui/toast.js:14,31` | LOW | These are separate strings from the toast body — easy to forget. |

#### D. Formats: the parts that are not strings but behave like them

| Format | Current implementation | English default | French requirement | Complexity |
|--------|------------------------|-----------------|---------------------|------------|
| **Absolute dates** | `fmtDate()` in `src/core/utils.js:49` — a hand-rolled formatter over 4 hard-coded formats (`MMM d`, `d/M`, `M/d`, `yyyy-MM-dd`) with English month/weekday arrays `MON`, `MONL`, `WD`, `WDL` (lines 40-43) | `MMM d` → "Oct 1, 2026" | `d/M` → **"01/10/2026"** (JJ/MM/AAAA), month names "janv., févr., mars, avr., mai, juin, juil., août, sept., oct., nov., déc.", long months "janvier…décembre", weekdays "dim., lun., mar., mer., jeu., ven., sam." — and **no comma** before the year ("1 oct. 2026", not "Oct 1, 2026") | HIGH |
| **Relative dates** | `relDate()` `utils.js:58` — "Today", "Tomorrow", "Yesterday", else a weekday name | — | "Aujourd'hui", "Demain", "Hier" | LOW |
| **Relative times** | `ago()` `utils.js:67` — "just now", "2m ago", "3h ago", "2d ago" | — | "à l'instant", "il y a 2 min", "il y a 3 h", "il y a 2 j" — **French puts the unit after the number and the verb first**; the English concatenation `m + 'm ago'` does not compose | MEDIUM |
| **Day buckets** | `dayBucket()` `utils.js:78` — "Today", "Yesterday", "This week", "Earlier" | — | "Aujourd'hui", "Hier", "Cette semaine", "Plus tôt" | LOW |
| **Numbers / counters** | raw template interpolation (`d.members.length`, `ap`, `ot`, `unread`) | `1234` | `1 234` with **narrow no-break space U+202F** as thousands separator; decimal comma (`12,4` not `12.4`) | MEDIUM |
| **Plurals** | hand-rolled `` `${n} task${n > 1 ? 's' : ''}` `` (~10 sites) | "1 task" / "3 tasks" | "1 tâche" / "3 tâches" — French **0 is singular** ("0 tâche"), English is plural ("0 tasks") | MEDIUM |
| **File sizes** | stored as literal strings in the seed: `'4.2 MB'`, `'860 KB'`, `'128 MB'` (`seed.js:286-288,477-479`); rendered as `x.size` | "4.2 MB" | "4,2 Mo" — decimal comma **and** `Mo` not `MB`. Requires the seed to store a numeric value + unit, or a size formatter over the existing literal | MEDIUM |
| **Durations / estimates** | `'30m','1h','1d'` in the estimate popover; `'est: '5d''` on seed tasks | "5d" | "5 j" (jour) — day/week/month units are words in French, not letters | LOW |
| **Storage quota** | `'12.4'` + `' GB'` + "of" (`settings.js:401-406`) — English string concat | "12.4 GB of 100 GB" | "12,4 Go sur 100 Go" | MEDIUM |
| **First day of week** | `S.prefs.weekStart`, default `1` (Monday); consumed by `miniCal()` (`popovers.js:96`) and `src/views/calendar.js` | Monday | **Monday is already correct for France** — only the *labels* change ("Start week on" → "Premier jour de la semaine"; "Monday/Sunday/Saturday" → "Lundi/Dimanche/Samedi"). No logic change needed | LOW |
| **Clock format** | `S.prefs.timeFmt` default `'12'`; the settings option offers "12-hour (2:30 PM)" / "24-hour (14:30)" | 12-hour | French default must be **24-hour** ("14:30"). The app default is 12 — so `fr` must override the default, not just the label | MEDIUM |
| **Time zone** | `S.prefs.tz` — five hard-coded zones: "(GMT-08:00) Pacific Time", "(GMT-05:00) Eastern Time", "(GMT+00:00) London", "(GMT+01:00) Berlin", "(GMT+08:00) Singapore" | — | "(GMT+01:00) Paris" (Berlin/Paris share an offset), "(GMT+00:00) Londres". The `GMT±HH:MM` notation is *identical* in French — only the city names change | LOW |
| **Date-format preview** | `settings.js:190-200` renders `fmtDate(dOff(8))` with a literal preview per option ("Oct 1", "1/10", "10/1", "2026-10-01") | — | The **previews themselves are English-specific** ("Oct 1" shows an English month). The FR preview must be computed with the FR formatter, not hard-coded | MEDIUM |

#### E. French-specific typography, orthography and register

These are the things English does not demand and that a naive "translate the strings" pass gets wrong.

| Requirement | Rule | Where it bites in this app | Complexity |
|-------------|------|---------------------------|------------|
| **Espaces insécables before `:` `;` `?` `!`** | French typography puts a non-breaking space before two-part punctuation. Modern recommendation: **narrow no-break space U+202F** | Everywhere: "Invite à {ws} : …", "Mot de passe :", "Tâche :". Today the app writes "Sign in to {ws}", "Language and regional formats." — a colon-bearing English string becomes "Choisir la langue :". Every colon-bearing FR string needs the nbsp, and **the nbsp must be in the catalogue, not added by the renderer** | HIGH |
| **Espaces insécables around guillemets** | `« texte »` — nbsp before `«` and inside before `»` | `shareModal` renders `Share “{name}”` with **English curly quotes**; FR must use `« {name} »` with nbsp. Also `server.js:1414` uses `"Use “Leave workspace” to remove yourself"` — a server string with English quotes | MEDIUM |
| **`N°` convention** | French writes "numéro" as `N°` (or `n°` mid-sentence) | The invoices table (`settings.js:440`) prints the raw id "INV-2026-009" under a header "Invoice". FR: header "Facture", and the reference presented as "Facture n° INV-2026-009" — `N°` is the natural home for this convention. No other screen in the app carries a human-facing serial number | LOW |
| **Accents & casing of headings** | French uses **sentence case** for headings ("Préférences du projet", not "Préférences Du Projet"); and every accent must survive | `SET_NAV` has 6 group headings + 19 items; the app capitalises them English-style ("Date & time", "Keyboard shortcuts", "Two-factor authentication"). FR: "Date et heure", "Raccourcis clavier", "Authentification à deux facteurs" | MEDIUM |
| **French date format** | `JJ/MM/AAAA` | The app's own date-format setting already offers `d/M` — FR should default to it. Note the `M/d` (US) option should still be *available* to a French user (a preference, not a locale law) but must not be the default | MEDIUM |
| **24-hour clock** | French convention is 24-hour | `S.prefs.timeFmt` default `'12'` → FR default `'24'` | MEDIUM |
| **Thousands separator: narrow no-break space (U+202F)** | "1 234" not "1,234" | Any count above 999: member counts, task counts, storage | MEDIUM |
| **Decimal separator: comma** | "12,4" not "12.4" | Storage meter "12.4 GB" | LOW |
| **Unisex / inclusive forms** | French requires gender agreement where a person is referred to; the modern neutral is the `·` form ("invité·e", "connecté·e") | Concrete cases in this app: (a) `auth.js:70` "Signed in as {email}" → "Connecté en tant que {email}" — *"Connecté"* is masculine-agreeing; the neutral is "Session ouverte en tant que {email}" or "Identité : {email}". (b) `popovers.js:224-228` role descriptions "Only sees projects they are invited to" → a French verb needs a subject form. (c) The invite email "*{inviter} invited you*" → "*{inviter} vous a invité·e à rejoindre…*" — but see below, there is a cleaner solution | MEDIUM |
| **Register: vouvoiement** | French must choose **vous** (formal) or **tu** (informal) *once*, and apply it consistently to ~900 keys. English has no equivalent choice | Every FR catalogue entry. The app's tone is professional/enterprise (project management for teams) → **vouvoiement**. This is a one-line editorial decision that, if changed later, invalidates the whole FR catalogue | MEDIUM |
| **Elision** | "l'invitation", "d'équipe", "aujourd'hui" | Common in the catalogue | LOW |
| **Avoid anglicisms** | "Importer" → "Importer", "Réinitialiser le mot de passe" not "Reset password"; "Connexion" not "Login" | Auth pages, settings | LOW |

#### F. The regression test that proves it works

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **"No English leaks" test** | The milestone's own acceptance criterion (`PROJECT.md`: "a regression test that proves the interface is in French when the locale is `fr`, and that no English string leaks") | MEDIUM | The tractable implementation is a **runtime** test, not a static scan: render every route in `fr`, walk the DOM, and assert no visible text node equals (or starts with) a string from the EN catalogue. A static grep for literals in template strings is brittle and will produce false positives on user content (task titles, project names) — which is exactly why the runtime shape is better. |
| **Catalogue completeness test** | A missing key must fail CI, not production | LOW | Assert every key referenced in code exists in `fr.json` (and that `en.json` is the superset). |
| **Locale-aware Chromium assertions** | The 8 new flows are all string-selected | MEDIUM | See the dedicated section below |

---

### Differentiators (Competitive Advantage)

Not required to ship, but they are what makes the French *good* rather than *merely present*.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Per-user locale inside a shared workspace** | The app's differentiator is tenancy (v1.1). Locale follows the *person*, not the tenant — a French-speaking member of an English workspace keeps French, and the workspace document stays language-neutral | MEDIUM | Already decided (`PROJECT.md` decision 3). The reward: the *shared document* keeps English role/status/label values, and the **client** maps them to the reader's locale at render time — so an English member and a French member can share one workspace without fighting over a language setting. This is a genuinely stronger design than a workspace-level language switch |
| **Locale-correct *values* inside a shared document** | Statuses, priorities, labels, roles and project templates are stored in English and displayed in the reader's locale — one document, many languages | MEDIUM | Requires the catalogue to key on the **stable English id** (`STATUSES[].id`), not the display name. `src/core/constants.js` already has both — the id is the wire format |
| **A locale-aware *email* that matches the inviter** | The invite email is the first French sentence a recipient ever sees | MEDIUM | The server can resolve the inviter's locale from `users.locale` at send time (`server.js:1555-1562` already has `ctx.user` in scope) — **no `invites` schema change needed**. But the *recipient* may be French while the inviter is English: a reasonable rule is "the email is sent in the **inviter's** language, with the role phrase and date in the recipient's likely language" — or simpler and defensible: **inviter's locale only**, documented |
| **French typography done properly** | Correct nbsp, `N°`, `« »`, `Mo`/`Go`, 24-hour clock, `JJ/MM/AAAA` — this is the difference between a French UI that reads as French and one that reads as translated | MEDIUM | The nbsp rule must be applied **in the catalogue**, and a lint rule should forbid a plain space before `:` `;` `?` `!` in `fr.json`. That lint rule is the cheapest, highest-leverage guard in the whole milestone |
| **Locale-aware *date* picker, not just date *display*** | The `miniCal()` popover and `src/views/calendar.js` render month and weekday names from English arrays | MEDIUM | Must move to the catalogue, and the calendar's first-day-of-week must stay Monday for `fr` |
| **French personalisation that English cannot express** | "Bienvenue, {name}" and "Connecté en tant que {email}" | LOW | Note: "Welcome back" is genuinely gender-free in English, so the FR catalogue must *choose* an idiom that is too. "Bon retour" or "Content de vous revoir" — both gender-free; "Bienvenue {name}" is also fine because "bienvenue" is invariable |
| **A French UI that survives long text** | French runs ~15-20% longer than English; the layout uses fixed-width chips, 6-column tables and a 280px popover | MEDIUM | A French string can overflow where the English one fit. The UI has no i18n-aware wrapping. This is a real quality risk that only appears once the FR catalogue exists — a "stress the layout in French" pass belongs in the milestone |
| **Per-locale keyboard-shortcut labels** | The `SHORTCUTS` table (`src/overlays/modals.js:268`) is shown on two surfaces (settings + modal) and mixes translated names with untranslated keys | LOW | The keys themselves ("⌘K", "G", "H") must **not** be translated — only the names |

---

### Anti-Features (Commonly Requested, Often Problematic)

These must be explicitly excluded — the milestone's scope in `PROJECT.md` already says so for the
translation UI; the rest need naming so they do not creep in.

| Anti-Feature | Why Requested | Why Problematic | Alternative |
|--------------|---------------|----------------|-------------|
| **Translation-management UI** (edit strings in Settings, per-locale screens, a "Translations" admin page) | "Let non-developers fix a typo" — a familiar pattern from Jira, Zendesk, Lokalise | The catalogues are **files in the repository, edited like code** (`PROJECT.md` out-of-scope). A UI needs a write path to the repo, a merge/conflict model, a permission model, an audit trail and a fallback story. It converts a static asset into a mutable runtime dependency | Keep the JSON catalogues in-repo. A translator edits a file, opens a PR, CI checks completeness + the French typography lint |
| **Machine translation at runtime** (call an LLM/translation API to fill missing keys) | "Ship all 30 languages for free" | Non-deterministic output that changes between renders; a network dependency in a self-hosted app that is explicitly dependency-free; untranslated quality on exactly the strings that matter (role descriptions, legal-adjacent copy in the invite email); it silently makes the product *look* localised while being unusable | Only offer a language that is **completely** human-translated. `PROJECT.md` decision 2 already states the selector only lists what really exists |
| **A locale switcher that offers untranslated languages** | The current selector already offers six (`settings.js:176`); removing them feels like a downgrade | Four of the six are lies — choosing "日本語" changes nothing. A locale switcher is a *promise* that the interface speaks that language. It is also the exact defect this milestone exists to fix | Offer **EN and FR only**. If a language is added later, add it with a complete catalogue in the same change |
| **Per-string overrides in the UI** (a user edits "Save" to "Enregistrer" for themselves) | Personalisation, and it looks enterprise-y | Breaks the shared-document model: an override has to live somewhere per-user (a new table, a new column, a JSON blob). It multiplies the state space for a feature nobody asked for, and it makes the "no English leaks" test ambiguous | Nothing. If a string is wrong, fix the catalogue |
| **RTL support** | "Arabic/Hebrew are big markets" | No RTL language is offered or planned. True RTL needs `dir="rtl"`, logical CSS properties, mirrored icons, and a different plural system — a project, not a feature. Doing it "in passing" produces a broken RTL layout that is worse than no RTL | Out of scope until a real RTL catalogue exists. The `t()` API should not preclude it (key by id, not by position), and that is enough |
| **Locale-specific number / currency formatting for data the app does not have** | "French uses euros and commas" | **Billing is fake.** `PROJECT.md`: "Real billing and plan enforcement … Out of scope"; the plan is a display value, `invoices` are seeded rows, `amt: '$96.00'` is a literal string. There is no price, no seat count, no tax, no FX. Building a currency layer means building a currency layer over nothing — and it would invite a half-real billing model | Format **numbers** (counts, decimals, thousands separator) per locale. Keep **currency** as a literal `$` display value, and state in the product docs that the plan figures are illustrative. Do not build an FX table |
| **Locale-specific *sorting* of user content** (collation: `fr` sorts accented characters differently from `en`) | "French sorts accents after plain letters" | The app sorts tasks and members with `localeCompare`-free comparisons (`.toLowerCase().includes(...)` in `members.js:14`, `popovers.js:87`, `palette.js:71,82`). Real French collation needs `Intl.Collator('fr')`. This is *correct* to do, but it changes search results and sort order — so it is a **behavioural** change that must be tested, not a cosmetic one | Use `Intl.Collator` for search/sort, and **pin the existing e2e assertions** so the change is visible. Treat it as a separate, small, testable work item |
| **A third language "because the file already exists"** (English UK, Deutsch, Español, 日本語) | The selector lists them today; removing them looks like a regression | Four incomplete catalogues produce the half-translated app the milestone exists to eliminate | EN + FR now. Each new language is its own milestone with a complete catalogue and a no-leak test |
| **Translating *user content*** (project names, task titles, comment text in the seed) | "The demo should be in French" | Seed content is **content**, not UI. Translating it means the demo no longer demonstrates a workspace whose members write in their own language — which is the point of a per-user locale | Keep the seed in English as *user content* and translate only the **chrome** around it. Exception: the *invite email* body is app-authored prose and **must** be translated |
| **Translating the `demo`/`design-system`/`states` prototype pages** | They are in the route table (`layout.js:63-64`) | They are internal prototype surfaces reached from the Help popover, not product screens. Translating them doubles the key count for zero user value | Leave them English, or remove them from the FR catalogue's completeness test — but pick one and document it |
| **Localising the `Terminal`-style `dist/` bundle or the SMTP protocol strings** | Everything is English | `dist/` is a build artefact; SMTP error strings (`mailer.js:258,279,292,362,365`) are operator-facing logs for a self-hoster, not end-user UI | Leave both in English |

---

### Feature Dependencies

```
[1. i18n layer: t() + JSON catalogues]
     ├──requires──> [2. Per-user locale column + migration]      (t() needs to know whose locale)
     ├──requires──> [3. FR catalogue (600-900 keys)]              (t() needs a catalogue to read)
     │                    └──requires──> [4. French typography rules]   (nbsp, N°, « », 24h, JJ/MM)
     │                    └──requires──> [5. French plural + gender + register]
     ├──requires──> [6. Locale-aware formats: dates, times, numbers, sizes, durations]
     │                    └──requires──> [2. Per-user locale]
     └──requires──> [7. Server-side error codes]  ──> [8. FR server error strings]

[3. FR catalogue]
     ├──requires──> [9. FR seed fragments for notifications]     (notifText() splices English fragments)
     └──requires──> [10. FR project templates + starter tasks]   (templates create user-visible content)

[11. Invite email i18n]
     ├──requires──> [1. i18n layer]                (catalogue must be importable by plain Node)
     └──requires──> [2. Per-user locale]            (the inviter's locale decides the email language)

[12. FR e2e assertions for the 8 untested flows]
     ├──requires──> [1. i18n layer] + [3. FR catalogue] + [2. per-user locale]
     └──requires──> [13. Existing 6 e2e tests pinned to locale=en]

[14. "No English leaks" regression test]
     ├──requires──> [1. i18n layer] + [3. FR catalogue]
     └──requires──> [15. Catalogue completeness test]  (a missing key must fail CI first)

[16. French typography lint rule]  ──enhances──> [4. French typography rules]
[17. FR layout pass (long text)]  ──enhances──> [3. FR catalogue]
[18. Intl.Collator collation]     ──enhances──> [3. FR catalogue]   (changes search + sort order)
```

#### Dependency Notes

- **[1] requires [2]:** `t()` resolves against a single active locale. Because the locale is per-user
  and not per-workspace, the client must know the user's locale **before** the first render, or it
  paints English and then repaints French. That means the locale arrives with the session/`/api/me`
  payload, not as a second round-trip. It also means the locale is a **per-session** concern in the
  browser: the `S` store gains a `locale` field that is set once at boot.
- **[1] requires [7]/[8] — the server-error decision (the largest hidden dependency in this milestone):**
  `server.js` returns **58** `{ error: 'English sentence' }` payloads. The client renders them
  **verbatim** in toasts (`actions.js:354,1677,1687,1732,1768,1785,1806` — `toast(res.error || 'Could not …')`).
  Three options:
  1. *Translate on the client* — the server returns an English string and the client cannot translate
     an unknown sentence. **Rejected.**
  2. *Server formats the message* — the server knows the user's locale, but `server.js` currently does
     not import from `src/`, and each of the 58 sites would need a locale lookup. Doable but it makes
     every API response locale-dependent and mixes presentation into the API.
  3. **Recommended: the server returns a stable error *code* plus params, the client translates the code.**
     `{ error: { code: 'email_taken', params: { email } } }`. The client maps code → FR key. The 58
     server strings become 58 codes, and the FR catalogue gets 58 more keys. This also fixes the
     current inconsistency where `res.error` is sometimes French-worded English ("Could not change that
     role") and sometimes a bare API phrase.
     **This is a MEDIUM-HIGH complexity item that the roadmap must not under-schedule.** A cheaper
     interim is to keep the English string but add a parallel `code` field, and translate the code when
     present and fall back to the string otherwise.
- **[11] requires [1] — the catalogue must be loadable by plain Node:** `server.js` runs unbundled
  (`node server.js`, Node 24) and `mailer.js` imports only `node:net`/`node:tls`/`node:os`/`node:crypto`.
  A JSON catalogue at, say, `src/i18n/locales/fr.json` is importable from `mailer.js` via
  `import fr from './src/i18n/locales/fr.json' with { type: 'json' }` (stable import attributes in
  Node 24, and Vite handles the same import). The alternative — keeping the catalogue in a `src/` module
  that only Vite can bundle — blocks server-side translation entirely. **Design the catalogue location
  before the first line of `t()`.**
- **[11] requires [2] — the invite email language:** the recipient of an invite may not have an
  account, so the recipient's locale is unknowable. The defensible rule is **the inviter's locale**
  (the person who wrote the invitation), which the server already has in scope at `server.js:1555`
  (`ctx.user`). No `invites` schema change is required. The alternative rule — "the workspace
  default" — does not exist, because the locale is per-user.
- **[12] requires [13] — the existing 6 Chromium tests must be pinned:** all 6 select on English
  strings: `getByLabel('Email')`, `getByLabel('Password', {exact:true})`, `getByRole('button',{name:'Sign in'})`,
  `getByRole('heading',{name:'Page not found'})`, `getByRole('button',{name:'Members'})`,
  `getByRole('button',{name:'New project'})`, `getByLabel('Project name')`,
  `getByRole('button',{name:'Create project'})`, `getByRole('button',{name:'Member'})`,
  `getByRole('button',{name:/^Admin Manage members/})`, `getByText(/Carol Member is now an Admin/)`.
  If the test accounts' locale is `en` by default, they keep passing — but only by accident, and a
  future change to the account default breaks them for a reason unrelated to tenancy. **The fixtures
  must set the locale explicitly**, and one of the new tests should deliberately run in `fr` to prove
  the switch works end to end.
- **[9] requires the FR catalogue:** `notifText()` (`src/pages/inbox.js`) assembles a sentence from
  a **stored English fragment** (`"mentioned you in"`, `"assigned you"`, `"commented on"`,
  `"moved to Review"`). A French catalogue cannot fix this with a lookup on the rendered string
  alone — either the FR seed stores FR fragments, or the fragments become keys with `{actor}`/`{target}`
  interpolation. **This is the clearest example in the codebase of why a catalogue key must be
  designed per sentence, not per word.**
- **[10] requires the FR catalogue:** `TEMPLATES` (`src/overlays/modals.js:95`) embeds 7 template
  names + 7 descriptions + **42 starter-task titles** as literal English. A French user who picks
  "Product Development" today gets 6 English task titles created in their workspace. Since the
  milestone promises a *complete* French interface, the templates must come from the catalogue.
- **[16] enhances [4]:** the French typography lint (no plain space before `:` `;` `?` `!`; no plain
  space inside `« »`; U+202F not U+00A0 where the narrow space is required) is a CI check over
  `fr.json`. It is cheap and it is the only thing standing between "translated" and "French".
- **[18] enhances [3] but changes behaviour:** switching to `Intl.Collator('fr')` changes search
  ordering and `sortTasks` ordering. This is invisible to a French reader but **visible to the
  existing e2e tests** if any of them depend on order. It needs its own test, not a silent change.

---

### The 8 untested UI flows: which assertions must be locale-aware

**All eight are locale-aware.** Every one of them is selected in Chromium by visible text, so
translating the interface translates the selector. This is the concrete reason the milestone couples
"French UI" and "browser coverage" instead of shipping them separately.

| # | Flow | Surface in the code | The strings the assertion will select on | Locale-aware? |
|---|------|--------------------|--------------------------------------------|---------------|
| 1 | **Onboarding wizard** | `src/pages/auth.js` `renderOnboarding()` | "What are you working on?", "Create your workspace", "How does your team work?", "Create your first project", "Invite your team", "Your workspace is ready", "Step {n} of 6", "Continue", "Back", "Skip for now", "Send invites", "Open workspace", "Exit setup", "Workspace name", "Workspace URL", "Team size", "Just me", plus the 6 template names and "{n} starter tasks" | **Yes — mandatory.** The wizard's step counter ("Step 3 of 6") and the "{n} starter tasks" / "{n} invites sent" counters are the plural and interpolation test cases. FR: "Étape 3 sur 6" |
| 2 | **Invite modal** | `src/overlays/modals.js` `inviteModal()` | "Invite to {ws}", "Email addresses", "Role", "Team", "Guests", "Send invites" / "Create links", "Invite links", "Sent" / "Not sent", "Copy invite link", "Copy", the hint "Separate multiple addresses with commas." | **Yes — mandatory.** Note the button label is *conditional* (`api.mailEnabled ? 'Send invites' : 'Create links'`) — the FR catalogue needs both, and the test must know which mode it is in |
| 3 | **`/join` page** | `src/pages/auth.js` `join` branch (3 sub-states) | "Join {ws}", "Create your account to get access to this workspace.", "Full name", "Email", "Password", "Create account & join", "Already have an account?", "Sign in and join", "Invite unavailable", "This address already has a Gr8r account. Sign in with it to join this workspace.", "This invite is for this address." | **Yes — mandatory.** The "existing account" sub-state and the "invite unavailable" sub-state are two *different* FR sentences and both need assertions |
| 4 | **Share modal** | `src/overlays/modals.js` `shareModal()` | "Share « {name} »", "Invite by email", "Permission", "Can view" / "Can comment" / "Can edit" / "Full access", "People with access", "General access", "Only people invited", "Everyone at {ws}", "Copy link", "Done", "Remove access", "(you)" | **Yes — mandatory.** The `« »` + nbsp and the `(you)` → `(vous)` are the two French-specific assertions this flow can carry |
| 5 | **Member removal** | `src/pages/members.js` context menu → `src/overlays/modals.js` `confirmModal()` → `src/actions/actions.js` | "Remove from workspace", "Type {ws} to confirm", "Cancel", "Remove", the toast "Removed {name}" with the action "Undo" | **Yes — mandatory.** The "type the name to confirm" flow means the FR test must type the **French** workspace name in the confirm field |
| 6 | **Workspace switcher** | `src/overlays/popovers.js` `case 'ws'` | "Workspaces", the role label ("Owner"/"Admin"/"Member"/"Guest"), "Create workspace", "Workspace settings", "Invite members", "Sign out" | **Yes — mandatory.** The role label is a **pseudo-string** (from `ROLE_LABELS`), so this flow exercises the value→label mapping, not just the string catalogue |
| 7 | **Plan change** | `src/pages/settings.js` `case 'plan'` | "Current plan", "View invoices", "Free" / "Team" / "Business", "Upgrade" / "Downgrade", "Contact the owner", "Current", "per member / month", "Members" / "Storage" / "Projects", "{v} of {m}" | **Yes — mandatory.** Also the **first flow that asserts a number format**: the storage meter "12,4 Go sur 100 Go" and the member counter. This is where the FR number formatting becomes observable |
| 8 | **Project creation** | `src/overlays/modals.js` `projectModal()` + `TEMPLATES` | "New project", "Project name", "Description", "Icon", "Color", "Team", "Lead", "Target date", "Template", "Create project", "Cancel", the 7 template names, "{n} starter tasks" | **Yes — mandatory.** The template names are catalogue *data*, not chrome — so this flow is the regression test for dependency [10] |

**Additional constraint on the 8 new tests:** they must not assume the account's locale. Each test
must either (a) explicitly set the locale on the account it drives, or (b) be parameterised over
`en`/`fr`. If the fixtures default to `en`, the FR catalogue is never exercised in a browser and the
"no English leaks" claim is untested end to end. **At least one of the eight — ideally the invite
modal (#2), the most string-dense — should run in `fr` with FR assertions.**

**Also affected, though not in the 8:** the existing 6 Chromium tests (§ Dependency Notes [13]).
They are all English-selected and must be pinned to `locale=en` so that a future change to the
account default does not break them.

---

## MVP Definition

### Launch With (v1.2)

- [ ] **i18n layer** — `t()` + `locales/en.json` + `locales/fr.json`, no runtime dependency, importable
      by both Vite and plain Node — *everything else depends on it*
- [ ] **Per-user locale** — `users.locale` column + migration + `/api/me` returns it + the selector
      offers only EN and FR — *the locale has to be per-user or the whole premise collapses*
- [ ] **FR catalogue covering every user-visible surface** — the surface inventory in § B is the
      acceptance checklist; ~600–900 keys
- [ ] **Locale-aware formats** — dates, relative times, day buckets, numbers, plurals, sizes,
      durations, first-day-of-week, 24-hour clock
- [ ] **French typography** — nbsp before `: ; ? !`, `« »`, `N°`, sentence-case headings, `Mo`/`Go`,
      vouvoiement — *with a CI lint rule over `fr.json`*
- [ ] **Server error codes** — the 58 `{error}` payloads become codes + params, translated on the client
- [ ] **French invite email** — subject, plain body, HTML body, role phrases, expiry date, `lang` attribute
- [ ] **The 8 untested UI flows in Chromium, with locale-aware assertions** — at least one in `fr`
- [ ] **No-English-leak regression test + catalogue completeness test**

### Add After Validation

- [ ] **FR project templates** — 7 templates with 42 FR starter-task titles (dependency [10]); ship
      after the templates stop being a hard-coded constant
- [ ] **Intl.Collator collation** — French-aware search and sort; ship with its own ordering test
- [ ] **FR layout pass** — French runs 15-20% longer; audit the fixed-width chips, the 6-column
      members table and the 280px popovers once the FR catalogue exists
- [ ] **`<title>` and `meta description`** — `index.html` is English-only; worth it for the browser tab
      and search engines, not for the interface

### Future Consideration (v2+)

- [ ] **A third language** — each new language is a full milestone with a complete catalogue, a
      no-leak test and its own plural/typography rules. Do not add a language "because the file exists"
- [ ] **Per-locale date-format and time-format defaults** — today `fr` overrides the 12-hour default;
      a user who prefers US formats in a French UI is a future preference, not a locale rule
- [ ] **Locale-specific currency** — only when billing is real. Not before
- [ ] **RTL** — only when a real RTL catalogue exists, and then as a project

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| i18n layer (`t()` + JSON catalogues) | HIGH | MEDIUM | P1 |
| Per-user locale column + migration | HIGH | MEDIUM | P1 |
| FR catalogue — navigation, pages, modals, popovers | HIGH | HIGH | P1 |
| FR catalogue — toasts, validation, empty states, errors page | HIGH | MEDIUM | P1 |
| Locale-aware formats (dates, times, numbers, plurals) | HIGH | MEDIUM | P1 |
| French typography (nbsp, « », N°, 24h, sentence case) | HIGH | MEDIUM | P1 |
| Server error codes + FR error strings | HIGH | HIGH | P1 |
| FR invite email | HIGH | MEDIUM | P1 |
| 8 locale-aware Chromium flows | HIGH | MEDIUM | P1 |
| No-English-leak + completeness tests | HIGH | MEDIUM | P1 |
| Language selector = EN + FR only | HIGH | LOW | P1 |
| `<html lang>` per locale | MEDIUM | LOW | P1 |
| FR notification fragments (seed) | MEDIUM | MEDIUM | P2 |
| FR project templates + starter tasks | MEDIUM | MEDIUM | P2 |
| Intl.Collator collation | MEDIUM | MEDIUM | P2 |
| FR layout pass | MEDIUM | MEDIUM | P2 |
| Password-strength labels, file-type names, sort/group labels | LOW | LOW | P2 |
| FR demo/dev pages (`design-system`, `states`) | LOW | LOW | P3 |
| `<title>` / meta description | LOW | LOW | P3 |
| Locale-specific currency | LOW (no data) | — | P3 / out of scope |
| Per-string overrides, translation UI, MT runtime, RTL | — | — | Anti-feature |

---

## Competitor Feature Analysis

Reference points for what "complete" means in the localisation of comparable project-management
tools (Linear, Notion, GitLab, Trello, Asana, Plane, Taiga, Vikunja):

| Feature | Linear | GitLab | Plane / Taiga (open-source, self-hosted peers) | Our approach (Gr8r v1.2) |
|---------|--------|--------|--------------------------------------------|---------------------------|
| Languages offered | ~10, all genuinely translated | ~40, Crowdin-managed | Taiga: en/fr/es/de/it/pt-BR — **all complete**; Plane: en + community translations | **EN + FR only, both complete.** The selector never offers a language that does not work |
| Locale scope | per-user | per-user | per-user | **per-user**, and the shared workspace document stays language-neutral |
| Date/time formatting | `Intl.DateTimeFormat`, full locale awareness | locale-aware, configurable | Taiga: per-user date format | `Intl.DateTimeFormat` per locale + the existing `dateFmt` preference, with `fr` defaults |
| Number/percent formatting | `Intl.NumberFormat` | locale-aware | partial | `Intl.NumberFormat` for counts/decimals/thousands; currency left as literal |
| Plural handling | CLDR via the framework | Crowdin plural forms | hand-rolled | hand-rolled two-form (`one`/`many`) — enough for EN + FR, no framework needed |
| Server-side i18n (emails, API errors) | yes, separate mail template set | yes, Crowdin | Taiga: yes, Django `.po` files | **yes** — the catalogue must be importable by plain Node, and the API returns error *codes* |
| Translation-management UI | Crowdin, external | Crowdin, external | Weblate, external | **none** — files in the repository, edited like code, with a CI completeness + typography lint |
| Machine translation | no | no (Crowdin is human + MT-assisted, reviewed) | no | **no** |
| RTL | no | partial (Arabic added later, limited) | no | **no** |
| Per-user locale inside a shared project | yes | yes | yes | **yes — and this is where Gr8r can differentiate**: the *stored* values stay English ids, the *rendered* values follow the reader |

The two lessons from the peers worth naming explicitly:

1. **Taiga and Plane both already ship a complete French.** That is the reference bar. A French user
   of Gr8r should not be able to tell it apart in quality from Taiga's French — which is exactly why
   the typography rules (nbsp, `« »`, `N°`, 24-hour clock) are P1 and not "polish for later".
2. **GitLab's failure mode is instructive**: it ships ~40 languages, and a large share are
   machine-translated or community-stale. The failure mode is *offering a language that is not
   genuinely translated*. Gr8r's decision to offer two complete languages instead of six broken ones
   is the correct trade for a self-hosted app with one maintainer.

---

## Sources

Repository read directly (2026-10-22), all paths relative to `/home/jmaillot/Projects/gr8r`:

- `.planning/PROJECT.md` — milestone v1.2 goals, decisions 1-3, active requirements, out-of-scope list
- `src/pages/settings.js` — 18 settings sections, `SET_NAV` (6 groups / 19 items), the 6-language
  selector at line 176, date/time preferences, plan & invoice surfaces, password-strength labels
- `mailer.js` — `buildInviteMessage()`: subject, plain + HTML bodies, the `an admin / a member / a guest`
  role phrases (line 397), the hard-coded `'en-US'` date format (line 401), `<html lang="en">` (line 424)
- `server.js` — `users` table (79-87), `migrateTenancy()` (844), 58 `{error}` payloads, invite creation
  (1526) and invite mailing (1555-1562)
- `src/core/utils.js` — `fmtDate()` (49), `relDate()` (58), `ago()` (67), `dayBucket()` (78), the
  English month/weekday arrays (40-43)
- `src/core/constants.js` — `STATUSES`, `PRIOS`, `LABELS`, `PSTAT`, `ROLES`, `TEAMS_SEED`
- `src/core/store.js` — `ROLE_LABELS` (250), `DEFAULT_PREFS.lang` (15), the shared-document `prefs` (38, 173)
- `src/overlays/modals.js` — 10 modal types, `PERMS` (176), `SHORTCUTS` (268), `TEMPLATES` (95)
- `src/overlays/popovers.js` — ~22 popover types, recurrence/estimate values (173, 183), role descriptions (224-228),
  sort/group/column labels (277-328), filter builder (401-423)
- `src/overlays/palette.js` — 18 commands, group headings, scope tabs, placeholders, footer hints
- `src/pages/auth.js` — 10 auth states + the 6-step onboarding wizard
- `src/pages/errors.js` — 404 / 403 / failed states
- `src/pages/inbox.js`, `src/pages/notifications.js` — notification rendering and `notifText()` fragment splicing
- `src/pages/members.js` — members table headers, roles, status badges
- `src/ui/toast.js` — toast structure and the "Undo / Open / Try again / Copy" action labels
- `src/actions/actions.js` — 118 toast call sites, `S.ui.errors.*` validation messages
- `src/data/seed.js` — 8 members, 7 projects, ~50 tasks, 14 comments, 10 notification fragments,
  4 teams, file-size literals, invoice rows
- `index.html` — `<html lang="en">`
- `e2e/tenancy.spec.mjs` — the 6 existing Chromium tests and their English selectors
- `e2e/helpers/setup.mjs` — the fixture accounts (no locale is set today)

Competitor references: Linear, GitLab, Notion, Taiga and Plane localisation behaviour (observed
product behaviour and their public locale lists; used for the completeness bar and the
"don't offer an untranslated language" lesson, not as a source of implementation detail for
Gr8r's dependency-free stack).

---
*Feature research for: Gr8r Studio v1.2 localisation (English base, complete French)*
*Researched: 2026-10-22*
