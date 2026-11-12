import { findPolicy } from "./policy.js";

let policy = findPolicy(location.href, []);
let expiresAt = 0;
let timer;
let redirected = false;
let checking;
const hide = () => document.documentElement?.style.setProperty("visibility", "hidden", "important");
function block() {
  if (redirected) return;
  redirected = true;
  hide();
  document.querySelectorAll("video, audio").forEach(media => media.pause());
  const page = policy?.mode === "timed" ? `gate.html#${encodeURIComponent(location.href)}` : "blocked.html";
  location.replace(browser.runtime.getURL(page));
}
async function check() {
  if (checking || redirected) return checking;
  checking = (async () => {
    const { customSites } = await browser.storage.local.get("customSites");
    const previous = policy;
    policy = findPolicy(location.href, customSites);
    if (!policy) {
      clearTimeout(timer);
      expiresAt = 0;
      if (previous) document.documentElement?.style.setProperty("visibility", "visible", "important");
      return;
    }
    if (policy.mode === "block") { block(); return; }
    if (expiresAt <= Date.now()) hide();
    const response = await browser.runtime.sendMessage({ type: "site-session", action: "status" });
    expiresAt = response?.state?.expiresAt || 0;
    clearTimeout(timer);
    if (expiresAt <= Date.now()) { block(); return; }
    document.documentElement?.style.setProperty("visibility", "visible", "important");
    timer = setTimeout(block, expiresAt - Date.now());
  })().catch(() => { if (policy) block(); }).finally(() => { checking = undefined; });
  return checking;
}
document.addEventListener("play", event => {
  if (policy?.mode === "timed" && expiresAt <= Date.now() && event.target instanceof HTMLMediaElement) event.target.pause();
}, true);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) { if (policy && expiresAt <= Date.now()) hide(); check(); }
});
window.addEventListener("pageshow", check);
browser.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (changes.customSites || (policy && changes.siteSessions))) check();
});
check();
