(() => {
  // Extension/hosts.json
  var hosts_default = [
    "youtube.com",
    "youtu.be",
    "youtube-nocookie.com",
    "news.ycombinator.com",
    "x.com",
    "twitter.com",
    "nitter.net",
    "xcancel.com",
    "twiiit.com",
    "nitter.poast.org",
    "nitter.privacyredirect.com",
    "nitter.tiekoetter.com",
    "nuku.trabun.org",
    "nitter.catsarch.com",
    "nitter.kareem.one",
    "nitter.privacydev.net",
    "nitter.space"
  ];

  // scripts/policy.js
  var YOUTUBE_HOSTS = ["youtube.com", "youtu.be", "youtube-nocookie.com"];
  function hostnameFromURL(value) {
    try {
      const url = new URL(value);
      return /^https?:$/.test(url.protocol) ? url.hostname.toLowerCase().replace(/\.$/, "") : null;
    } catch {
      return null;
    }
  }
  function matchesHost(hostname, site) {
    return hostname === site.host || site.includeSubdomains && hostname.endsWith(`.${site.host}`);
  }
  function readSites(value) {
    return Array.isArray(value) ? value.map((site) => typeof site === "string" ? { host: site, includeSubdomains: true, mode: "block" } : site).filter((site) => site && typeof site.host === "string" && typeof site.includeSubdomains === "boolean" && ["block", "timed"].includes(site.mode)) : [];
  }
  function findPolicy(value, sites) {
    const hostname = hostnameFromURL(value);
    if (!hostname)
      return null;
    if (YOUTUBE_HOSTS.some((host) => matchesHost(hostname, { host, includeSubdomains: true })))
      return { key: "youtube", label: "YouTube", mode: "timed" };
    if (hosts_default.some((host) => matchesHost(hostname, { host, includeSubdomains: true })))
      return { key: hostname, label: hostname, mode: "block" };
    const site = readSites(sites).filter((site2) => matchesHost(hostname, site2)).sort((a, b) => b.host.length - a.host.length)[0];
    return site ? { key: site.host, label: site.host, mode: site.mode } : null;
  }

  // scripts/guard.js
  var policy = findPolicy(location.href, []);
  var expiresAt = 0;
  var timer;
  var redirected = false;
  var checking;
  var hide = () => document.documentElement?.style.setProperty("visibility", "hidden", "important");
  function block() {
    if (redirected)
      return;
    redirected = true;
    hide();
    document.querySelectorAll("video, audio").forEach((media) => media.pause());
    const page = policy?.mode === "timed" ? `gate.html#${encodeURIComponent(location.href)}` : "blocked.html";
    location.replace(browser.runtime.getURL(page));
  }
  async function check() {
    if (checking || redirected)
      return checking;
    checking = (async () => {
      const { customSites } = await browser.storage.local.get("customSites");
      const previous = policy;
      policy = findPolicy(location.href, customSites);
      if (!policy) {
        clearTimeout(timer);
        expiresAt = 0;
        if (previous)
          document.documentElement?.style.setProperty("visibility", "visible", "important");
        return;
      }
      if (policy.mode === "block") {
        block();
        return;
      }
      if (expiresAt <= Date.now())
        hide();
      const response = await browser.runtime.sendMessage({ type: "site-session", action: "status" });
      expiresAt = response?.state?.expiresAt || 0;
      clearTimeout(timer);
      if (expiresAt <= Date.now()) {
        block();
        return;
      }
      document.documentElement?.style.setProperty("visibility", "visible", "important");
      timer = setTimeout(block, expiresAt - Date.now());
    })().catch(() => {
      if (policy)
        block();
    }).finally(() => {
      checking = undefined;
    });
    return checking;
  }
  document.addEventListener("play", (event) => {
    if (policy?.mode === "timed" && expiresAt <= Date.now() && event.target instanceof HTMLMediaElement)
      event.target.pause();
  }, true);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      if (policy && expiresAt <= Date.now())
        hide();
      check();
    }
  });
  window.addEventListener("pageshow", check);
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && (changes.customSites || policy && changes.siteSessions))
      check();
  });
  check();
})();
