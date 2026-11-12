(() => {
  let expiresAt = 0;
  let timer;
  let redirected = false;
  const hide = () => document.documentElement?.style.setProperty("visibility", "hidden", "important");
  function block() {
    if (redirected) return;
    redirected = true;
    hide();
    document.querySelectorAll("video, audio").forEach(media => media.pause());
    window.location.replace(`${browser.runtime.getURL("youtube.html")}#${encodeURIComponent(window.location.href)}`);
  }
  function apply(state) {
    clearTimeout(timer);
    expiresAt = state?.expiresAt ?? 0;
    if (expiresAt <= Date.now()) { block(); return; }
    document.documentElement?.style.setProperty("visibility", "visible", "important");
    timer = setTimeout(block, expiresAt - Date.now());
  }
  async function check() {
    if (expiresAt <= Date.now()) hide();
    try { apply(await browser.runtime.sendMessage({ type: "youtube-session", action: "status" })); }
    catch { block(); }
  }
  document.addEventListener("play", event => {
    if (expiresAt <= Date.now() && event.target instanceof HTMLMediaElement) event.target.pause();
  }, true);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) check();
  });
  window.addEventListener("pageshow", check);
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.youtubeSession) apply(changes.youtubeSession.newValue);
  });
  check();
})();
