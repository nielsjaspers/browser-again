import { mkdir, copyFile, rename } from "node:fs/promises";
import { resolve } from "node:path";

const [ipaPath, baseURL] = Bun.argv.slice(2);
if (!ipaPath || !baseURL) throw new Error("Usage: bun scripts/prepare-download.ts path/to/app.ipa https://host/path/");
const base = new URL(baseURL.endsWith("/") ? baseURL : baseURL + "/");
if (base.protocol !== "https:") throw new Error("iOS installation requires HTTPS.");
const out = resolve(import.meta.dir, "../distribution");
await mkdir(out, { recursive: true });
await copyFile(ipaPath, resolve(out, "BrowserAgain.ipa.pending"));
await rename(resolve(out, "BrowserAgain.ipa.pending"), resolve(out, "BrowserAgain.ipa"));
const xml = (text: string) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
await Bun.write(resolve(out, "manifest.plist"), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>items</key><array><dict>
<key>assets</key><array><dict><key>kind</key><string>software-package</string><key>url</key><string>${xml(new URL("BrowserAgain.ipa", base).href)}</string></dict></array>
<key>metadata</key><dict><key>bundle-identifier</key><string>org.browseragain.app</string><key>bundle-version</key><string>1.7</string><key>kind</key><string>software</string><key>title</key><string>Browser Again</string></dict>
</dict></array></dict></plist>`);
const installURL = `itms-services://?action=download-manifest&url=${encodeURIComponent(new URL("manifest.plist", base).href)}`;
await Bun.write(resolve(out, "index.html"), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Install Browser Again</title><style>
:root{color-scheme:light dark;font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#f5f3ed;color:#222822}body{max-width:34rem;margin:0 auto;padding:4rem 1.5rem}h1{font-size:3rem;letter-spacing:-.045em;line-height:1.05}p,li{line-height:1.6}li{margin:.8rem 0}.install{display:inline-block;background:#304e34;color:white;padding:1rem 1.5rem;border-radius:.8rem;text-decoration:none;font-weight:600}a{color:inherit}@media(prefers-color-scheme:dark){:root{background:#171c18;color:#eeeee6}}
</style></head><body><h1>Browser Again</h1><p>Breathe before opening distracting sites. Block the current site, or allow five-minute sessions.</p><p><a class="install" href="${xml(installURL)}">Install on iPhone</a></p>
<p>Open this page in Safari with Tailscale connected. This development build is signed for devices already registered in the Apple Developer account.</p><ol>
<li>Enable Developer Mode in Settings &gt; Privacy &amp; Security. Restart if prompted.</li>
<li>Tap Install on iPhone. Confirm, then find Browser Again on the Home Screen.</li>
<li>Open Settings &gt; Apps &gt; Safari &gt; Extensions &gt; Browser Again Extension. Turn it on and set All Websites to Allow.</li>
<li>Enable it for each Safari profile and allow Private Browsing if you use private tabs.</li></ol>
<p>Unknown Nitter instances are detected on your device as their pages load. Modified forks can evade detection. Opening counts stay on this device. No browsing data is sent.</p>
<p>Development signing expires with its provisioning profile. If iOS rejects this install, an ad hoc build needs Xcode signed in to the Apple Developer account. <a href="BrowserAgain.ipa">Download IPA</a>.</p></body></html>`);
console.log(base.href);
