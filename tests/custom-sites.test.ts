import { expect, test } from "bun:test";
import { createCustomSitesController, customRules, normalizeSite } from "../scripts/custom-sites.js";
import { findPolicy, matchesHost, readSites } from "../scripts/policy.js";
import permanentRules from "../Extension/rules.json";
const entry = (host = "linkedin.com", includeSubdomains = true, mode = "block") => ({ host, includeSubdomains, mode });
test("URLs normalize with optional exact host preservation", () => {
  expect(normalizeSite(" https://WWW.LinkedIn.com/feed ")).toBe("linkedin.com");
  expect(normalizeSite("https://www.linkedin.com/feed", false)).toBe("www.linkedin.com");
  expect(normalizeSite("https://bücher.de")).toBe("xn--bcher-kva.de");
  for (const value of ["", "com", "not a domain", "*.example.com", "ftp://example.com", "https://user:password@example.com", "youtube.com", "m.youtube.com", "news.ycombinator.com"]) expect(() => normalizeSite(value)).toThrow();
});
test("existing string entries preserve their original permanent blocking behavior", () => {
  expect(readSites(["reddit.com"])).toEqual([entry("reddit.com")]);
});
test("exact-domain rules exclude subdomains and lookalike hosts", () => {
  const exact = entry("www.linkedin.com", false);
  const rules = customRules([exact]);
  const regex = new RegExp(rules[0].condition.regexFilter!);
  expect(regex.test("https://www.linkedin.com/feed")).toBe(true);
  for (const url of ["https://linkedin.com/", "https://sub.www.linkedin.com/", "https://www.linkedin.com.example.org/"]) expect(regex.test(url)).toBe(false);
  expect(matchesHost("mail.linkedin.com", entry())).toBe(true);
  expect(matchesHost("mail.linkedin.com", entry("linkedin.com", false))).toBe(false);
});
test("timed sites use the session guard while built-ins stay permanent", () => {
  const sites = [entry("linkedin.com", true, "timed")];
  expect(customRules(sites)[0].action.type).toBe("allow");
  expect(findPolicy("https://www.linkedin.com/feed", sites)).toMatchObject({ key:"linkedin.com", mode:"timed" });
  expect(findPolicy("https://www.youtube.com/watch?v=123", sites)?.key).toBe("youtube");
  expect(permanentRules[0].condition.requestDomains).toContain("news.ycombinator.com");
});
test("add, edit, remove, and restore preserve the selected options", async () => {
  let saved: unknown = ["reddit.com"];
  let applied = customRules([]);
  const f = createCustomSitesController({get:async()=>saved,set:async value=>{saved=value;}},async rules=>{applied=rules;},async()=>{});
  await f.request("add", entry("linkedin.com",false,"timed"));
  expect(await f.request("list")).toContainEqual(entry("linkedin.com",false,"timed"));
  await f.request("add",entry("linkedin.com",true,"block"));
  expect((await f.request("list")).filter(site=>site.host==="linkedin.com")).toHaveLength(1);
  await f.request("remove","linkedin.com");
  expect(await f.request("restore")).toEqual([entry("reddit.com")]);
  expect(applied).toHaveLength(2);
});
test("failed rules do not save a non-working block list", async () => {
  let writes=0;
  const f=createCustomSitesController({get:async()=>[],set:async()=>{writes++;}},async()=>{throw new Error("Rule update failed");},async()=>{});
  await expect(f.request("add",entry())).rejects.toThrow("Rule update failed");
  expect(writes).toBe(0);
});

test("specific timed and permanent rules override broader custom rules while built-ins win", () => {
  const sites = [{ host: "example.com", includeSubdomains: true, mode: "block" }, { host: "work.example.com", includeSubdomains: true, mode: "timed" }, { host: "private.work.example.com", includeSubdomains: false, mode: "block" }];
  const rules = customRules(sites);
  const decision = (hostname: string) => rules.filter(rule => {
    const condition = rule.condition;
    return condition.requestDomains?.some(host => hostname === host || hostname.endsWith(`.${host}`)) || (condition.regexFilter && new RegExp(condition.regexFilter).test(`https://${hostname}/`));
  }).sort((a,b) => b.priority-a.priority)[0]?.action.type;
  expect(decision("example.com")).toBe("redirect");
  expect(decision("work.example.com")).toBe("allow");
  expect(decision("cdn.work.example.com")).toBe("allow");
  expect(decision("private.work.example.com")).toBe("redirect");
  expect(permanentRules[0].priority).toBeGreaterThan(Math.max(...rules.map(rule => rule.priority)));
});
