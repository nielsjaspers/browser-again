# Browser Again

An iOS Safari extension with five-minute YouTube passes that blocks Hacker News, X / Twitter, and Nitter. Requires iOS 17 or later.

Known hosts other than YouTube and their subdomains are blocked with Safari's declarative network rules. Top-level visits show a blocked page. Embedded content from listed hosts is blocked too. The list includes the public Nitter instances listed in the official project wiki on November 12, 2026, plus common aliases.

New Nitter domains are detected from their hostname or standard Nitter page metadata and markup. Detection runs locally and requires Safari permission for all websites. Unknown domains load far enough to expose that markup. Modified forks can evade detection. There is no analytics or remote reporting. Opening counts are stored only on this device.

## Timed access

YouTube and custom sites set to timed access start with a seven-second breathing prompt. A centered orb grows across the prompt and controls for three seconds, inverting their colors where it overlaps, then shrinks for four; it stays still when Reduce Motion is enabled. After breathing, choose Continue for five minutes of access, or Close this tab to leave. The extension does not automatically open the site when the pause ends.

When the five minutes expire, the access screen returns. Emergency appears after the first completed access cycle and grants fifteen minutes without waiting for breathing. After those fifteen minutes end, the breathing screen returns and Emergency is unavailable for the following hour. The cooldown is per site and survives closing tabs, Safari restarts, and app updates. Normal five-minute passes remain available during the cooldown. It does not extend a currently active pass. When eligible, the choice offers five-minute access or a fifteen-minute Emergency pass. Closing the access screen ends that site’s session. Closing all associated tabs, or navigating those tabs away from the site, also requires a fresh breathing cycle next time. Each site has its own session; tabs for the same site share one deadline.

The extension stores current session deadlines and associated tab IDs locally. It also stores successful opening timestamps per timed site to show a rolling 24-hour count. A new timed pass counts once, including an Emergency renewal. Reloads, other tabs sharing an active pass, and canceled visits do not count. Counts survive session resets and app updates; older timestamps are removed on the next access check. Counting starts with this version because older openings were not recorded. Full page URLs are not stored. Content scripts pause media and return to the access screen at expiration. iOS can suspend tabs and extension workers; suspended tabs check their deadlines when they resume.

## Custom sites

In Safari, open the page menu and choose Browser Again. The form fills in the current site. You can also enter another domain or paste an HTTP or HTTPS URL. Choose whether to include all subdomains, then choose Always blocked or Breathe, then 5 minutes. Tap Block site to save.

Unchecking subdomains blocks only the exact hostname shown. With subdomains enabled, a leading www is removed so the entry covers both the main domain and its subdomains. Adding a saved domain again updates its options. Remove deletes only your custom entry. Existing custom entries remain permanent blocks with subdomains included after an app update. More specific custom domains take precedence over broader custom rules. Built-in rules stay in place.

Your list is stored on this device in the Safari extension profile. Saving a rule also applies it to matching open tabs. Manage sites on a permanently blocked page opens the same controls.

## Build

Open `Browser Again/Browser Again.xcodeproj` with Xcode 27.2 or later. Select your signing team for both targets, then run on an iPhone or simulator. The project uses Xcode's current project format.

Edit `Extension/hosts.json`, then run `bun scripts/build-extension.ts` to regenerate rules and bundle the background script. The background and page guard sources are in `scripts/background.js` and `scripts/guard.js`; their copies in `Extension` are generated. Run `bun test` for the blocking, countdown, shared-pass, and expiration checks.

## Install

The extension ships inside an iOS app and must be signed for installation. Use TestFlight or a signed IPA with a provisioning profile that includes the target iPhone. Development builds require Developer Mode and expire with their provisioning profile.

After installation, open Settings > Apps > Safari > Extensions > Browser Again Extension. Enable it and set All Websites to Allow. Enable it for each Safari profile and Private Browsing as needed. Standalone apps and other browsers are outside its scope.

## Private download page

After exporting a signed IPA, run:

```sh
bun scripts/prepare-download.ts path/to/app.ipa https://your-device.your-tailnet.ts.net/browser-again/
PORT=36784 bun scripts/serve-download.ts
```

In another terminal, add a private Tailscale Serve route:

```sh
tailscale serve --bg --https=443 --set-path=/browser-again http://127.0.0.1:36784
```

The server binds to localhost and serves only the installation page, manifest, and IPA. Keep the Mac awake and the server running during installation. To remove this route without changing other routes, run:

```sh
tailscale serve --https=443 --set-path=/browser-again off
```
