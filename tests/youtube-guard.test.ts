import { expect, test } from "bun:test";
import { runInNewContext } from "node:vm";
const source = await Bun.file(new URL("../Extension/youtube-guard.js", import.meta.url)).text();

async function guard(initialExpiry: number) {
  let now = 1000;
  let visible = "hidden";
  let timer: (() => void) | undefined;
  let storageChanged: (changes: object, area: string) => void = () => {};
  let returned: (() => void) | undefined;
  const redirects: string[] = [];
  let pauses = 0;
  runInNewContext(source, {
    Date: { now: () => now },
    setTimeout: (callback: () => void) => { timer = callback; return 1; },
    clearTimeout: () => { timer = undefined; },
    document: {
      documentElement: { style: { setProperty: (_key: string, value: string) => { visible = value; } } },
      querySelectorAll: () => [{ pause: () => { pauses++; } }],
      addEventListener: () => {}
    },
    window: {
      location: { href: "https://www.youtube.com/watch?v=123", replace: (url: string) => redirects.push(url) },
      addEventListener: (_event: string, callback: () => void) => { returned = callback; }
    },
    browser: {
      runtime: { getURL: (path: string) => `safari-web-extension://test/${path}`, sendMessage: async () => ({ expiresAt: initialExpiry }) },
      storage: { onChanged: { addListener: (callback: typeof storageChanged) => { storageChanged = callback; } } }
    }
  });
  await Promise.resolve(); await Promise.resolve();
  return {
    redirects, visible: () => visible, pauses: () => pauses,
    expire: () => { now = initialExpiry; timer?.(); },
    resume: async () => { now = initialExpiry + 1; returned?.(); await Promise.resolve(); },
    revoke: () => storageChanged({ youtubeSession: { newValue: { expiresAt: 0 } } }, "local")
  };
}

test("unapproved visits return to the prompt with the original video URL", async () => {
  const page = await guard(0);
  expect(page.visible()).toBe("hidden");
  expect(page.redirects).toEqual(["safari-web-extension://test/youtube.html#https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3D123"]);
});

test("expiration pauses media, hides the page, and returns to the prompt", async () => {
  const page = await guard(301000);
  expect(page.visible()).toBe("visible");
  expect(page.redirects).toEqual([]);
  page.expire();
  expect(page.visible()).toBe("hidden");
  expect(page.pauses()).toBe(1);
  expect(page.redirects).toHaveLength(1);
});

test("a suspended page checks the deadline when it resumes", async () => {
  const page = await guard(301000);
  await page.resume();
  expect(page.redirects).toHaveLength(1);
});

test("shared storage revocation closes other open tabs", async () => {
  const page = await guard(301000);
  page.revoke();
  expect(page.redirects).toHaveLength(1);
  expect(page.pauses()).toBe(1);
});
