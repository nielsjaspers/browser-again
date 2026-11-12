import { expect, test } from "bun:test";
import { runInNewContext } from "node:vm";
const source=await Bun.file(new URL("../Extension/guard.js",import.meta.url)).text();
async function page(url:string,expiry:number,customSites:object[]=[]) {
  let time=1000;
  let timer:(()=>void)|undefined;
  let visible="hidden";
  let pauses=0;
  let changed:(...args:unknown[])=>void=()=>{};
  let resumed:()=>void=()=>{};
  const redirects:string[]=[];
  runInNewContext(source,{URL,location:{href:url,replace:(value:string)=>redirects.push(value)},Date:{now:()=>time},
    setTimeout:(fn:()=>void)=>{timer=fn;return 1;},clearTimeout:()=>{timer=undefined;},
    document:{documentElement:{style:{setProperty:(_name:string,value:string)=>{visible=value;}}},querySelectorAll:()=>[{pause:()=>{pauses++;}}],addEventListener:()=>{}},
    window:{addEventListener:(_event:string,fn:()=>void)=>{resumed=fn;}},
    browser:{runtime:{getURL:(value:string)=>`safari-web-extension://test/${value}`,sendMessage:async()=>({state:{expiresAt:expiry}})},storage:{local:{get:async()=>({customSites})},onChanged:{addListener:(fn:typeof changed)=>{changed=fn;}}}}
  });
  const settle=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
  await settle();
  return {redirects,visible:()=>visible,pauses:()=>pauses,expire:()=>{time=expiry;timer?.();},resume:async()=>{time=expiry+1;resumed();await settle();},changed};
}
test("expired visits preserve their original URL in the breathing screen",async()=>{
  const p=await page("https://www.youtube.com/watch?v=123",0);
  expect(p.redirects).toEqual(["safari-web-extension://test/gate.html#https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3D123"]);
});
test("active pages pause media and hide at expiration, including after suspension",async()=>{
  const p=await page("https://www.youtube.com/",301000);
  expect(p.visible()).toBe("visible");p.expire();expect(p.pauses()).toBe(1);expect(p.visible()).toBe("hidden");
  const suspended=await page("https://www.youtube.com/",301000);await suspended.resume();expect(suspended.redirects).toHaveLength(1);
});
test("custom timed sites receive the same guard while ordinary pages remain open",async()=>{
  const custom=await page("https://www.linkedin.com/feed",0,[{host:"linkedin.com",mode:"timed",includeSubdomains:true}]);
  expect(custom.redirects[0]).toContain("gate.html#");
  const ordinary=await page("https://example.org/",0);expect(ordinary.redirects).toEqual([]);
});
