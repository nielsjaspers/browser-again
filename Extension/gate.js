const site = document.querySelector("#site");
const eyebrow = document.querySelector("#eyebrow");
const heading = document.querySelector("#heading");
const detail = document.querySelector("#detail");
const close = document.querySelector("#close");
const proceed = document.querySelector("#continue");
const emergency = document.querySelector("#emergency");
const retry = document.querySelector("#retry");
const error = document.querySelector("#error");
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
  emergency.hidden = state.cycle === 0 || activePass;
  proceed.hidden = true;
  const remaining = activePass ? 0 : state.readyAt - Date.now();
  if (remaining <= 0) {
    document.body.dataset.phase = "choice";
    eyebrow.textContent = "A little more intentional";
    heading.textContent = "Still want to open it?";
    detail.textContent = activePass ? "Continue within your current session. Its deadline stays the same." : "You’ll have 5 minutes.";
    proceed.textContent = "Continue for 5 minutes";
    proceed.hidden = false;
    return;
  }
  const elapsed = Math.max(0, Math.min(10_000, 10_000 - remaining));
  const inhale = elapsed < 5000;
  const progress = inhale ? elapsed / 5000 : (10000 - elapsed) / 5000;
  document.body.dataset.phase = inhale ? "inhale" : "exhale";
  document.body.style.setProperty("--fill", `${12 + 84 * progress}%`);
  eyebrow.textContent = state.cycle ? "Your 5 minutes are up" : "Take a deep breath";
  const instruction = inhale ? "Breathe in." : "Breathe out.";
  if (heading.textContent !== instruction) heading.textContent = instruction;
  detail.textContent = "There’s no hurry.";
  timer = setTimeout(() => draw(state), Math.min(100, remaining));
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
      document.body.dataset.phase = "choice";
      site.textContent = new URL(url).hostname;
      eyebrow.textContent = "Rule removed";
      heading.textContent = "This site is unblocked.";
      detail.textContent = "You can open it without a time limit.";
      proceed.textContent = "Continue to site";
      proceed.hidden = false;
      emergency.hidden = true;
      return;
    }
    if (response.policy.mode === "block") { leaving = true; location.replace(browser.runtime.getURL("blocked.html")); return; }
    label = response.policy.label;
    site.textContent = label;
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
  if (area !== "local" || leaving || (!changes.siteSessions && !changes.customSites)) return;
  if (busy) refreshPending = true;
  else act("begin");
});
try { tabId = (await browser.tabs.getCurrent())?.id; } catch {}
act("begin");
