# Changelog

## 1.4.0

### New
- **Recap**: a month or year summary (achievements unlocked, games completed, active days, best streak, best day/month, where you made most progress and your rarest achievements), compared with the previous period. Save it as an image to share.
- **Setup assistant**: three guided steps on first run (Steam Web API key → Steam profile → check that the key works and that game details are public, with a direct link to Steam's privacy settings). Language can be picked on the first screen. Also available from the ⋯ menu.

### Fixed
- Missing achievement icons: Steam still reports icons on its old image server, which no longer has the ones for recent games. Icons now use Steam's current server, with several fallbacks, and missing ones are downloaded again on the next refresh. Locked achievements of games without a gray icon now show the color icon grayed out instead of a blank square.
- Achievement and 100% notifications were often missing while playing: the "now playing" refresh recorded new achievements without notifying, so the regular sync no longer saw them as new. Notifications are now sent by every refresh.
- Two refreshes of the same game at the same time (now playing + automatic sync) could record the same unlock twice in the history. Only one refresh per game runs at a time.
- Saving a game sheet locked its genres even if they were not touched, so games saved before the store details arrived never got genres.
- Closing a game sheet (Esc, ✕ or Close) discarded unsaved changes in "My data" without asking.
- The showcase image now shows your Steam name, and covers that fail to load fall back to the new Steam image address or to the game name instead of a blank box.
- The library is no longer rebuilt every minute and after every sync when nothing changed (less flicker and smoother with large libraries).
- Estimated difficulty: a single isolated, extremely rare achievement (often bugged) lowers the estimate one step instead of pushing the game to 10/10.

## 1.3.0

### New (second round)
- New layout with a sidebar (library sections, collections, showcase, statistics).
- Game sheet redesigned: large header with progress ring, hours, difficulty and time to 100%; tabs for Achievements and My data.
- Now playing: detects the game you are playing, shows its pending/missable achievements and refreshes it while you play.
- Platinum showcase: all your 100% games with date, hours, days taken and rarest achievement; export as PNG image.
- Achievement tags: missable, online, co-op, grindy, hard (with filters).
- Personal collections (e.g. "Steam Deck") with sidebar entries and filter.
- Ignore games in "Add games" so they no longer show up.
- System tray: keeps syncing and notifying after closing the window; optional start with Windows.
- HowLongToBeat time to 100% (unofficial, best effort) plus manual override; "time left" on cards and list.
- Compact list view with sortable columns.
- 100% celebration with confetti.
- Statistics: 100% games per month (click a month to see them); rarest achievements show one per game.

### Fixed
- Black covers: recent games use new hashed image URLs on Steam. The app now asks the store for the real URL, tries the new CDN path and shows the game name if there is no image.
- Re-adding a game that was already in the library no longer wipes its notes, manual hours and genres.
- Genres set by hand are never overwritten again (the editor used to overwrite them for games named "App 12345").
- Games named "App 12345" now get their real name and cover.
- The achievement change history is recorded (it was always empty).
- Automatic sync now refreshes the screen when it finishes.
- Removing a game also removes its achievements and cached icons, and asks for confirmation.
- Importing a backup validates the file, asks for confirmation and saves an automatic copy of the current library first.
- Changing the language and then pressing "Cancel" no longer saves the language.
- Sort listener registered twice, missing filter styles, undeclared `selectAllOwned`.

### Performance / Steam API
- One player-achievements call per game instead of two; schema cached 7 days, global % cached 3 days.
- Automatic sync only refreshes games that were played recently, changed playtime, are "In progress" or are older than 24 h.
- Minimum automatic sync interval is now 15 min (default 30). Old values of 1–5 min are migrated.
- Manual and automatic sync can no longer overlap.
- Store requests are throttled (no more HTTP 429 when adding many games). The 30-game limit when adding is gone.
- Data is written once per batch with atomic writes, and achievements live in their own file.
- Clear error messages for invalid API key, private profile, rate limiting and network errors.

### Security
- API key encrypted with Windows (Electron `safeStorage`) and never included in backups.
- Content-Security-Policy, sandboxed renderer, no inline handlers, all network calls in the main process.
- Single-instance lock so two windows cannot corrupt the data files.

### New
- Estimated 100% difficulty from global achievement rarity.
- Achievement list: easiest/rarest first, search, "next target", missable flag and personal note per achievement.
- Alert when Steam adds achievements to a game you had at 100%.
- "Almost 100%" tab (≥ 80 % or ≤ 3 achievements left).
- Statistics window: heatmap, achievements per month, 100% per year, streaks, rarest achievements.
- Yearly 100% goal; personal priority order with drag & drop.
- Desktop notifications.
- Play / Store / Steam achievements / Guides buttons; progress bar and click-anywhere on cards.
- Add-games window: "only games with achievements", "hide already added", playtime shown.
- Steam profile can be a SteamID64, a profile URL or a custom name.
- Separate language for achievement names; app language defaults to the system language.
- Window size and position are remembered; view (tab, sort, filters) is remembered.
- Update check: installer builds update automatically from GitHub Releases, ZIP builds show a link.

### Project
- Electron 44, no `electron-store` / `node-fetch`; renderer split into modules; key-based i18n.
- Unit tests (`npm test`) and a simulated Steam API for local testing.
- Installer (NSIS) + portable ZIP targets; `.gitignore`.
