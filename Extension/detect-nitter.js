(() => {
  let blocked = false;
  let observer;
  const detect = () => {
    if (blocked) return;
    // Nitter sets this even when the instance uses a custom name and domain.
    const site = document.querySelector('meta[property="og:site_name"]')?.content;
    const hasNitterAssets = document.querySelector('link[href*="/css/fontello.css"]') &&
      document.querySelector('link[href*="/css/style.css"]');
    const hasNitterNav = document.querySelector('a[href="https://liberapay.com/zedeus"]');
    if (site?.trim().toLowerCase() === "nitter" || (hasNitterAssets && hasNitterNav)) {
      blocked = true;
      observer?.disconnect();
      window.location.replace(browser.runtime.getURL("blocked.html"));
    }
  };
  observer = new MutationObserver(detect);
  observer.observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ["content", "property", "href"] });
  detect();
  // Standard Nitter metadata and navigation arrive with the initial document.
  document.addEventListener("DOMContentLoaded", () => { detect(); observer.disconnect(); }, { once: true });
})();
