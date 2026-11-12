import "./build-rules";
const result = await Bun.build({
  entrypoints: ["background.js", "guard.js"].map(name => new URL(name, import.meta.url).pathname),
  outdir: new URL("../Extension", import.meta.url).pathname,
  target: "browser",
  format: "iife"
});
if (!result.success) throw new AggregateError(result.logs, "Could not bundle extension scripts");
