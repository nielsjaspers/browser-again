# Browser Again

An iOS Safari extension with five-minute YouTube passes that blocks Hacker News, X / Twitter, and Nitter. Requires iOS 17 or later.

Known hosts other than YouTube and their subdomains are blocked with Safari's declarative network rules. Top-level visits show a blocked page. Embedded content from listed hosts is blocked too. The list includes the public Nitter instances listed in the official project wiki on November 12, 2026, plus common aliases.

New Nitter domains are detected from their hostname or standard Nitter page metadata and markup. Detection runs locally and requires Safari permission for all websites. Unknown domains load far enough to expose that markup. Modified forks can evade detection. There is no analytics, browsing history storage, or remote reporting.

## YouTube passes

Opening YouTube shows a confirmation page. Yes starts a ten-second countdown, then opens the original URL for five minutes. Emergency skips the countdown and grants the same five minutes. All YouTube tabs in the Safari extension profile share one deadline. Refreshing, opening another tab, and pressing Emergency during an active pass do not extend it.

The extension stores the deadline locally. Content scripts hide YouTube until access is checked and pause media and return to the prompt at expiration. A background alarm also redirects open YouTube tabs. iOS can suspend background tabs and extension workers; suspended tabs enforce the deadline when they resume. YouTube embeds use the same pass.

## Build

Open `Browser Again/Browser Again.xcodeproj` with Xcode 27.2 or later. Select your signing team for both targets, then run on an iPhone or simulator. The project uses Xcode's current project format.

Edit `Extension/hosts.json`, then run `bun scripts/build-extension.ts` to regenerate rules and bundle the background script. The background source is `scripts/background.js`; `Extension/background.js` is generated. Run `bun test` for the blocking, countdown, shared-pass, and expiration checks.

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
