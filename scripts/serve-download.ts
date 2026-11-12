import { resolve } from "node:path";
const directory = resolve(import.meta.dir, "../distribution");
const files = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/manifest.plist", ["manifest.plist", "application/xml"]],
  ["/BrowserAgain.ipa", ["BrowserAgain.ipa", "application/octet-stream"]]
]);
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: Number(Bun.env.PORT ?? 0),
  fetch(request) {
    const path = new URL(request.url).pathname.replace(/^\/browser-again(?=\/|$)/, "") || "/";
    const entry = files.get(path);
    if (!entry) return new Response("Not found", { status: 404 });
    const [name, type] = entry;
    return new Response(Bun.file(resolve(directory, name!)), { headers: { "Content-Type": type!, "Cache-Control": "no-store" } });
  }
});
console.log(`Download server listening on ${server.url}`);
