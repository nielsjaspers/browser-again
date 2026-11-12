import "./build-rules";
const result = await Bun.build({
  entrypoints: [new URL("./background.js", import.meta.url).pathname],
  outdir: new URL("../Extension", import.meta.url).pathname,
  target: "browser",
  format: "iife"
});
if (!result.success) throw new AggregateError(result.logs, "Could not bundle extension background script");
