import { expect, test } from "bun:test";
import { runInNewContext } from "node:vm";
import rules from "../Extension/rules.json";

const source = await Bun.file(new URL("../Extension/detect-nitter.js", import.meta.url)).text();
function detectPage(initial: Record<string, object>) {
  const nodes = { ...initial };
  const redirects: string[] = [];
  let changed = () => {};
  let ready = () => {};
  let disconnected = false;
  runInNewContext(source, {
    document: {
      querySelector: (selector: string) => nodes[selector],
      addEventListener: (_event: string, callback: () => void) => { ready = callback; }
    },
    MutationObserver: class {
      constructor(callback: () => void) { changed = callback; }
      observe() {}
      disconnect() { disconnected = true; }
    },
    window: { location: { replace: (url: string) => redirects.push(url) } },
    browser: { runtime: { getURL: (path: string) => `safari-web-extension://test/${path}` } }
  });
  return { nodes, redirects, changed: () => changed(), ready: () => ready(), disconnected: () => disconnected };
}

test("detects a new instance from metadata arriving during parsing", () => {
  const page = detectPage({});
  expect(page.redirects).toEqual([]);
  page.nodes['meta[property="og:site_name"]'] = { content: "Nitter" };
  page.changed(); page.changed();
  expect(page.redirects).toEqual(["safari-web-extension://test/blocked.html"]);
  expect(page.disconnected()).toBe(true);
});

test("detects renamed instances from their assets and navigation", () => {
  const page = detectPage({
    'link[href*="/css/fontello.css"]': {},
    'link[href*="/css/style.css"]': {},
    'a[href="https://liberapay.com/zedeus"]': {}
  });
  expect(page.redirects).toHaveLength(1);
});

test("does not block an article about Nitter or a site sharing a stylesheet name", () => {
  const page = detectPage({
    'meta[property="og:site_name"]': { content: "An article about Nitter" },
    'link[href*="/css/style.css"]': {}
  });
  page.changed(); page.ready();
  expect(page.redirects).toEqual([]);
  expect(page.disconnected()).toBe(true);
});

test("known domains include subdomains without matching lookalike domains", () => {
  const domains = rules[0].condition.requestDomains ?? [];
  const blocked = (host: string) => domains.some(domain => host === domain || host.endsWith(`.${domain}`));
  for (const host of ["news.ycombinator.com", "xcancel.com", "nuku.trabun.org", "x.com"]) expect(blocked(host)).toBe(true);
  for (const host of ["example.com", "ycombinator.com", "notyoutube.com", "youtube.com.example.org"]) expect(blocked(host)).toBe(false);
});

test("Nitter DNS rule matches new Nitter domains and only the URL host", () => {
  const regex = new RegExp(rules[2].condition.regexFilter!);
  for (const url of ["https://nitter.new.org/", "https://nitter-new.example.org/user", "http://www.nitter.example.net:8080/"]) expect(regex.test(url)).toBe(true);
  for (const url of ["https://example.org/nitter.net/", "https://notnitter.example.org/", "https://example.org/?site=nitter.net"]) expect(regex.test(url)).toBe(false);
});
