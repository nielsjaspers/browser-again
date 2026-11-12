import { expect, test } from "bun:test";
import { runInNewContext } from "node:vm";
const source=await Bun.file(new URL("../Extension/background.js",import.meta.url)).text();
test("only the gate can grant access or close a tab; ordinary pages can read status",async()=>{
  const listeners: Array<(message: object,sender: object)=>unknown> = [];
  const store:Record<string,unknown>={};
  const removed:number[]=[];
  const tabs=[{id:1,url:"safari-web-extension://test/gate.html#video"}];
  runInNewContext(source,{URL,Date,browser:{
    runtime:{getURL:(path:string)=>`safari-web-extension://test/${path}`,onMessage:{addListener:(fn:typeof listeners[number])=>listeners.push(fn)},onInstalled:{addListener:()=>{}},onStartup:{addListener:()=>{}}},
    storage:{local:{get:async(key:string|string[])=>Object.fromEntries((Array.isArray(key)?key:[key]).map(k=>[k,structuredClone(store[k])])),set:async(data:object)=>Object.assign(store,structuredClone(data)),remove:async()=>{}}},
    alarms:{create:async()=>{},onAlarm:{addListener:()=>{}}},
    tabs:{query:async()=>tabs,get:async(id:number)=>tabs.find(tab=>tab.id===id),remove:async(id:number)=>{removed.push(id);},update:async()=>{},onRemoved:{addListener:()=>{}},onUpdated:{addListener:()=>{}}},
    declarativeNetRequest:{getDynamicRules:async()=>[],updateDynamicRules:async()=>{}}
  }});
  const send=async(action:string,sender:object)=>await listeners[0]({type:"site-session",action,url:"https://www.youtube.com/",tabId:1},sender) as {error?:string,state?:{cycle:number}};
  expect((await send("emergency",{url:"https://www.youtube.com/",tab:{id:1}})).error).toContain("access screen");
  expect((await send("emergency",{url:"safari-web-extension://test/gate.html",tab:{id:1}})).error).toContain("first breathing cycle");
  expect((await send("begin",{url:"safari-web-extension://test/gate.html",tab:{id:1}})).state?.cycle).toBe(0);
  await send("close",{url:"safari-web-extension://test/gate.html",tab:{id:1}});
  expect(removed).toEqual([1]);
  // Closing remains available when the custom site is no longer configured.
  await listeners[0]({type:"site-session",action:"close",url:"https://removed.example.org/",tabId:1},{url:"safari-web-extension://test/gate.html",tab:{id:1}});
  expect(removed).toEqual([1,1]);
});

test("moving between site access screens removes the old tab association", async () => {
  let time = 100000;
  const sites = ["a.example.org", "b.example.org"].map(host => ({ host, mode: "timed", includeSubdomains: true }));
  const store: Record<string, unknown> = { customSites: sites };
  const listeners: Array<(message: object, sender: object) => unknown> = [];
  let updated: (id: number, change: { url: string }) => void = () => {};
  let removed: (id: number) => unknown = () => {};
  const gate = "safari-web-extension://test/gate.html";
  const tabs = [{ id: 1, url: gate + "#https%3A%2F%2Fa.example.org%2F" }, { id: 2, url: gate + "#https%3A%2F%2Fa.example.org%2F" }];
  runInNewContext(source, { URL, Date: { now: () => time }, browser: {
    runtime: { getURL: (path: string) => `safari-web-extension://test/${path}`, onMessage: { addListener: (fn: typeof listeners[number]) => listeners.push(fn) }, onInstalled: { addListener: () => {} }, onStartup: { addListener: () => {} } },
    storage: { local: { get: async (key: string|string[]) => Object.fromEntries((Array.isArray(key)?key:[key]).map(k=>[k,structuredClone(store[k])])), set: async (data: object) => Object.assign(store, structuredClone(data)), remove: async () => {} } },
    alarms: { create: async () => {}, onAlarm: { addListener: () => {} } },
    declarativeNetRequest: { getDynamicRules: async () => [], updateDynamicRules: async () => {} },
    tabs: { get: async (id: number) => tabs.find(tab => tab.id === id), query: async () => tabs, update: async () => {}, remove: async () => {}, onUpdated: { addListener: (fn: typeof updated) => { updated = fn; } }, onRemoved: { addListener: (fn: typeof removed) => { removed = fn; } } }
  } });
  const send = async (action: string, id: number, host = "a.example.org") => await listeners[0]({ type: "site-session", action, url: `https://${host}/` }, { url: gate, tab: { id } }) as { state: { expiresAt: number } };
  await send("begin", 1); await send("begin", 2);
  tabs[0].url = gate + "#https%3A%2F%2Fb.example.org%2F";
  updated(1, { url: tabs[0].url });
  for (let i = 0; i < 100; i++) await Promise.resolve();
  await send("begin", 2); time += 10000;
  const activeA = await send("open", 2);
  await removed(1);
  expect((await send("status", 2)).state.expiresAt).toBe(activeA.state.expiresAt);
  expect(activeA.state.expiresAt).toBeGreaterThan(time);
  time = activeA.state.expiresAt;
  const emergency = await send("emergency", 2);
  expect(emergency.state.expiresAt).toBe(time + 15 * 60_000);
  expect(store.siteOpenings).toEqual({ "a.example.org": [time - 5 * 60_000, time] });
  expect(store.siteCooldowns).toEqual({ "a.example.org": time + 75 * 60_000 });
  await send("close", 2);
  expect(store.siteOpenings).toEqual({ "a.example.org": [time - 5 * 60_000, time] });
  expect(store.siteCooldowns).toEqual({ "a.example.org": time + 75 * 60_000 });
});
