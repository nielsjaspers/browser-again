const status = document.querySelector("#status");
const confirm = document.querySelector("#confirm");
const emergency = document.querySelector("#emergency");
let ticking = false;
let busy = false;

function destination() {
  try {
    const url = new URL(decodeURIComponent(location.hash.slice(1)));
    if (/^https?:$/.test(url.protocol) && ["youtube.com", "youtu.be", "youtube-nocookie.com"]
      .some(domain => url.hostname === domain || url.hostname.endsWith(`.${domain}`))) return url.href;
  } catch {}
  return "https://www.youtube.com/";
}
const send = action => browser.runtime.sendMessage({ type: "youtube-session", action });
function showError() {
  status.textContent = "Could not check your pass. Try again.";
  confirm.disabled = false;
  emergency.disabled = false;
}
async function render(state) {
  if (!state) throw new Error("Missing session state");
  if (state.expiresAt > Date.now()) { location.replace(destination()); return; }
  emergency.disabled = false;
  if (!state.readyAt) {
    status.textContent = "You can open YouTube for 5 minutes.";
    confirm.disabled = false;
    return;
  }
  confirm.disabled = true;
  const seconds = Math.max(0, Math.ceil((state.readyAt - Date.now()) / 1000));
  status.textContent = seconds ? `Opening in ${seconds} ${seconds === 1 ? "second" : "seconds"}…` : "Opening YouTube…";
  if (ticking) return;
  ticking = true;
  setTimeout(async () => {
    ticking = false;
    try { await render(await send(Date.now() >= state.readyAt ? "open" : "status")); }
    catch { showError(); }
  }, Math.min(250, Math.max(0, state.readyAt - Date.now())));
}
async function act(action) {
  if (busy) return;
  busy = true;
  confirm.disabled = true;
  emergency.disabled = true;
  try { await render(await send(action)); }
  catch { showError(); }
  finally { busy = false; }
}
confirm.addEventListener("click", () => act("begin"));
emergency.addEventListener("click", () => act("emergency"));
act("status");
