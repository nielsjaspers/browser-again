const heading = document.querySelector("#heading");
const cooldown = document.querySelector("#cooldown");
const usage = document.querySelector("#usage");
const detail = document.querySelector("#detail");
const close = document.querySelector("#close");
const proceed = document.querySelector("#continue");
const emergency = document.querySelector("#emergency");
const retry = document.querySelector("#retry");
const error = document.querySelector("#error");
const orb = document.querySelector("#orb");
let breathAnimation;
let breathDeadline;
function stopBreathing() {
  breathAnimation?.cancel();
  breathAnimation = undefined;
  breathDeadline = undefined;
}
let timer;
let busy = false;
let refreshPending = false;
let leaving = false;
let label = "this site";
let tabId;
function destination() {
  try {
    const url = new URL(decodeURIComponent(location.hash.slice(1)));
    if (/^https?:$/.test(url.protocol) && !url.username && !url.password) return url.href;
  } catch {}
  return "https://www.youtube.com/";
}
const url = destination();
async function send(action) {
  const response = await browser.runtime.sendMessage({ type: "site-session", action, url, tabId });
  if (!response || response.error) throw new Error(response?.error || "Could not check your session. Reload to try again.");
  return response;
}
function draw(state) {
  clearTimeout(timer);
  const activePass = state.expiresAt > Date.now();
  usage.textContent = `Opened ${state.opens24h} ${state.opens24h === 1 ? "time" : "times"} in the last 24 hours.`;
  usage.hidden = false;
  const cooldownLeft = state.emergencyReadyAt - Date.now();
  const cooldownMinutes = Math.ceil(cooldownLeft / 60_000);
  emergency.hidden = state.cycle === 0 || activePass || cooldownLeft > 0 || state.readyAt > Date.now();
  cooldown.hidden = cooldownLeft <= 0 || activePass;
  cooldown.textContent = cooldownLeft > 0 ? `Emergency available in ${cooldownMinutes} ${cooldownMinutes === 1 ? "minute" : "minutes"}.` : "";
  proceed.hidden = true;
  const remaining = activePass ? 0 : state.readyAt - Date.now();
  if (remaining <= 0) {
    stopBreathing();
    document.body.dataset.phase = "choice";
    heading.textContent = `Open ${label}?`;
    detail.textContent = activePass ? "Continue within your current session. Its deadline stays the same." : emergency.hidden ? "You’ll have 5 minutes." : "";
    proceed.textContent = activePass ? "Continue to site" : "Continue for 5 minutes";
    proceed.hidden = false;
    if (cooldownLeft > 0) timer = setTimeout(() => act("begin"), Math.min(60_000, cooldownLeft));
    return;
  }
  document.body.dataset.phase = "breathing";
  heading.textContent = "Take a slow breath.";
  detail.textContent = "";
  if (breathDeadline !== state.readyAt) {
    stopBreathing();
    breathAnimation = orb.animate([
      { transform: "scale(.08)", easing: "ease-in-out" },
      { transform: "scale(1)", offset: 3 / 7, easing: "ease-in-out" },
      { transform: "scale(.08)" }
    ], { duration: 7_000, fill: "both" });
    breathAnimation.currentTime = Math.max(0, 7_000 - remaining);
    breathDeadline = state.readyAt;
  }
  timer = setTimeout(() => draw(state), remaining);
}
async function act(action) {
  if (busy) return;
  busy = true;
  error.textContent = "";
  retry.hidden = true;
  for (const button of [close, proceed, emergency, retry]) button.disabled = true;
  try {
    const response = await send(action);
    if (action === "close") { leaving = true; return; }
    if (!response.policy) {
      if (action === "open") { leaving = true; location.replace(url); return; }
      clearTimeout(timer);
      stopBreathing();
      document.body.dataset.phase = "choice";
      usage.hidden = true;
      cooldown.hidden = true;
      heading.textContent = "This site is unblocked.";
      detail.textContent = "You can open it without a time limit.";
      proceed.textContent = "Continue to site";
      proceed.hidden = false;
      emergency.hidden = true;
      return;
    }
    if (response.policy.mode === "block") { leaving = true; location.replace(browser.runtime.getURL("blocked.html")); return; }
    label = response.policy.label;
    document.title = `Take a moment · ${label}`;
    const activePass = response.state.expiresAt > Date.now();
    if (activePass && ["open", "emergency"].includes(action)) { leaving = true; location.replace(url); return; }
    if (!response.state.readyAt && !activePass) { refreshPending = true; return; }
    draw(response.state);
  } catch (reason) { error.textContent = reason.message; retry.hidden = false; }
  finally {
    busy = false;
    for (const button of [close, proceed, emergency, retry]) button.disabled = false;
    if (refreshPending && !leaving) { refreshPending = false; act("begin"); }
  }
}
retry.addEventListener("click", () => act("begin"));
close.addEventListener("click", () => act("close"));
proceed.addEventListener("click", () => act("open"));
emergency.addEventListener("click", () => act("emergency"));
browser.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || leaving || (!changes.siteSessions && !changes.customSites && !changes.siteOpenings && !changes.siteCooldowns)) return;
  if (busy) refreshPending = true;
  else act("begin");
});
try { tabId = (await browser.tabs.getCurrent())?.id; } catch {}
act("begin");
