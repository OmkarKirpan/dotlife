# Dotlife

A local-first PWA that draws a span of time as a grid of dots and shows how much of it is left.
No backend, no accounts, no analytics. Your data lives in this browser's IndexedDB and nowhere else.

## Use

- **Scope** (tap the label top-left): This hour · Today · This week · This month · This year · Life · your spans.
- **Lenses** (bottom bar): **Left** shows what remains, **Since** shows what has passed, **Ahead** lists upcoming spans.
- **Headline**: tap it to switch between a count and a percentage.
- **Make a span**: on any day- or week-dotted grid, drag across dots, or press and hold one dot for a single day.
  It saves when you let go, named from its dates (`Sep 28 – Oct 28`). **Undo** is in the toast.
- **Rename or delete**: press and hold a span in the scope menu or in Ahead (right-click on desktop).
- **Any date, not just this one**: the chevrons beside the scope name step back and forward a window at a
  time — last year, next month — and **Now** returns. Drag on a stepped grid to plan a span there.
  **New span…** in the scope menu places one by date instead.
- **Keyboard**: tab to the grid, arrow keys move through the dots, shift-arrow selects a range, Enter
  creates a span from it, Escape clears the selection.
- **See your spans**: they are drawn as tinted bands on any day- or week-dotted grid, so a trip shows
  up inside your year. Press a dot to name the spans covering it. Settings → Grid turns them off.
- **Wallpaper**: scope menu → Wallpaper. Draws the current grid at your phone's resolution, with the
  scope name and headline, and the top kept clear for the lock-screen clock. Share it (on iPhone:
  Save to Photos, then set it as the wallpaper), or download the PNG or the SVG.
- **Back up**: Settings → Copy JSON or Download. Import checks `version` and rejects the whole file
  if anything is wrong. You choose whether it merges with your spans or replaces them.

The app icon badge counts down **whatever scope you are on**, as long as one dot is a day or a week.
This hour and Today fall back to days left in the year: a minute or hour count would be wrong within
the hour and nothing refreshes it in the background. It updates on launch, when the app comes back
to the foreground, and at local midnight while it is open. iOS has no background refresh, so if the app
stays closed for a week the badge will be out of date by seven.

## Install it, don't just bookmark it

Safari deletes storage for sites you haven't opened in about 7 days. Home Screen web apps are exempt.
Installing the app is what keeps your data on iOS, so the app asks you to do it once.

**Pick the final domain before the first install.** The data belongs to the origin, and moving to another
domain leaves it behind (export first, then import on the new domain).

## Develop

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # domain tests in your local timezone
npm run test:tz    # same tests under New York, London, Kolkata, Lord Howe (30-min DST), Auckland
npm run build      # typecheck + production build to dist/
```

## Deploy (Cloudflare Pages)

Dashboard: connect the repo. Build command `npm run build`, output directory `dist`, then add the custom domain.

CLI: `npx wrangler login`, then `npm run deploy`.

`public/_headers` stops the service worker, manifest and HTML from being cached, and lets hashed
assets be cached forever. Updates come through `registerType: 'autoUpdate'`.

## Deploy (GitHub Pages)

`.github/workflows/deploy.yml` runs the tests (under UTC, then the four DST timezones), builds, and
publishes on every push to `main`. It also runs the tests on pull requests, skipping the Pages steps.
It can be run by hand from the Actions tab. One-time setup:
**Settings → Pages → Source → GitHub Actions**.

A project site is served from `/<repo>/`, so the workflow builds with `BASE_PATH=/dotlife/`. The
base is read from `BASE_PATH` in `vite.config.ts` and feeds the manifest `id`, `start_url` and
`scope` as well as the service worker registration; it defaults to `/`, so the Cloudflare build
above is unaffected. On a custom domain at the root, set `BASE_PATH: /` in the workflow.

`public/_headers` is Cloudflare-only — GitHub Pages ignores it and sends its own cache headers.

## Design

| Scope | 1 dot = | Dots |
|---|---|---|
| This hour | minute | 60 |
| Today | hour | 24 (23/25 on DST days) |
| This week | day | 7 (weeks start Monday) |
| This month | day | 28–31 |
| This year | day | 365/366 |
| Life | week | ~4,175 at 80 years |
| Your span | day, or week if longer than 730 days | varies |

- `src/domain/time.ts`: `resolve(span, now)` is the whole domain layer and a pure function.
  Everything uses the local wall clock, with boundaries at local midnight. Day counts come from
  `differenceInCalendarDays`, never from `ms / 86_400_000`. `'YYYY-MM-DD'` is parsed as local midnight,
  not as UTC.
- `elapsed` counts dots that have fully passed. The dot you are in now counts as remaining, so Dec 31
  shows 1 day left.
- `src/domain/grid.ts`: the grid always fits the viewport and never scrolls. Time runs bottom-up: the
  earliest dots are at the bottom, and the leftover partial row sits at the bottom holding the first dots.
- The UI has one dark palette and one accent. There are no themes and no light mode.
- `resolve` takes an `anchor` separate from `now`: the anchor picks the window, `now` fills it. It
  defaults to `now`, and `build` clamps, so a past window comes back fully elapsed and a future one
  empty with no special cases. Life and fixed spans ignore it — their windows come from a birth date
  and from their own dates.
- Writes to IndexedDB can fail, and there is no server copy. `saveSpans` and `saveSettings` reject on
  failure and `App` rolls the optimistic state back, so the screen never claims a save that did not
  happen.
- `src/domain/overlay.ts`: a span's dates become dot indices in whatever scope is on screen. The dot
  fill already means elapsed or remaining, and `--accent` flips meaning with the lens, so an overlay
  may only tint the space *behind* a dot, never its fill. Overlapping spans nest into lanes. On a
  week-dotted grid a short span still fills its whole week dot, the same way `dotLastDay` does.
- `src/domain/wallpaper.ts`: builds a display list, which `src/wallpaper.ts` paints onto a canvas.
  Laid out at logical size and scaled up, because `MAX_PITCH` is a CSS-pixel constant — laying out
  at device pixels would strand a 7-dot week in a huge empty frame.

Not in v1: sync, push notifications, themes, notes on dots, a native widget.

MIT
