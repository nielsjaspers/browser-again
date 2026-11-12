import { expect, test } from "bun:test";
import { createCustomSitesController, customRules, normalizeSite } from "../scripts/custom-sites.js";
import permanentRules from "../Extension/rules.json";

test("normalizes pasted URLs, www, case, and international domains", () => {
  expect(normalizeSite(" https://WWW.Reddit.com/r/popular?sort=top ")).toBe("reddit.com");
  expect(normalizeSite("example.org/path")).toBe("example.org");
  expect(normalizeSite("https://bücher.de")).toBe("xn--bcher-kva.de");
  expect(normalizeSite("localhost:36785")).toBe("localhost");
});

test("rejects malformed input, login details, and built-in sites", () => {
  for (const input of ["", "com", "not a domain", "*.example.com", "ftp://example.org", "https://user:password@example.org", "youtube.com", "m.youtube.com", "news.ycombinator.com", "xcancel.com"]) {
    expect(() => normalizeSite(input)).toThrow();
  }
});

function fixture() {
  let saved: string[] = [];
  let applied: ReturnType<typeof customRules> = [];
  let closed: string[] = [];
  const controller = createCustomSitesController({
    get: async () => saved,
    set: async (hosts: string[]) => { saved = hosts; }
  }, async (rules: ReturnType<typeof customRules>) => { applied = rules; }, async (hosts: string[]) => { closed = hosts; });
  return { controller, saved: () => saved, applied: () => applied, closed: () => closed };
}

test("adds persistently, deduplicates concurrent adds, and closes matching open tabs", async () => {
  const f = fixture();
  await Promise.all([f.controller.request("add", "reddit.com"), f.controller.request("add", "https://www.reddit.com/r/all")]);
  expect(f.saved()).toEqual(["reddit.com"]);
  expect(f.applied()[0].condition.requestDomains).toEqual(["reddit.com"]);
  expect(f.closed()).toEqual(["reddit.com"]);
});

test("removing custom sites clears their rules and leaves built-ins intact", async () => {
  const f = fixture();
  await f.controller.request("add", "reddit.com");
  await f.controller.request("remove", "news.ycombinator.com");
  expect(f.saved()).toEqual(["reddit.com"]);
  await f.controller.request("remove", "reddit.com");
  expect(f.applied()).toEqual([]);
  expect(permanentRules[0].condition.requestDomains).toContain("news.ycombinator.com");
  expect(permanentRules.map(rule => rule.id)).not.toContain(100);
});

test("failed rule updates do not save a non-working block list", async () => {
  let writes = 0;
  const f = createCustomSitesController({ get: async () => [], set: async () => { writes++; } }, async () => { throw new Error("Rule update failed"); }, async () => {});
  await expect(f.request("add", "reddit.com")).rejects.toThrow("Rule update failed");
  expect(writes).toBe(0);
});

test("a restart restores saved custom rules without changing their entries", async () => {
  const f = fixture();
  await f.controller.request("add", "reddit.com");
  expect(await f.controller.request("restore")).toEqual(["reddit.com"]);
  expect(f.applied()).toHaveLength(2);
});
