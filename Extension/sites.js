const form = document.querySelector("#add-site");
const input = document.querySelector("#site");
const subdomains = document.querySelector("#subdomains");
const mode = document.querySelector("#mode");
const add = document.querySelector("#add");
const list = document.querySelector("#custom-sites");
const status = document.querySelector("#status");
let busy = false;
async function update(action, site) {
  if (busy) return;
  busy = true;
  add.disabled = true;
  list.querySelectorAll("button").forEach(button => { button.disabled = true; });
  try {
    const response = await browser.runtime.sendMessage({ type: "custom-sites", action, site });
    if (!response || response.error) throw new Error(response?.error || "Could not load your sites. Reopen Browser Again to try again.");
    if (action === "list" && response.currentHost) input.value = response.currentHost;
    list.replaceChildren();
    for (const entry of response.sites) {
      const item = document.createElement("li");
      const label = document.createElement("span");
      label.textContent = entry.host;
      const options = document.createElement("small");
      options.textContent = `${entry.includeSubdomains ? "Includes subdomains" : "Exact domain"} · ${entry.mode === "timed" ? "Breathe, then 5 minutes" : "Always blocked"}`;
      label.append(options);
      const remove = document.createElement("button");
      remove.type = "button"; remove.className = "secondary"; remove.textContent = "Remove";
      remove.setAttribute("aria-label", `Remove ${entry.host}`);
      remove.addEventListener("click", () => update("remove", entry.host));
      item.append(label, remove); list.append(item);
    }
    status.textContent = action === "add" ? "Site saved." : response.sites.length ? "" : "No custom sites yet.";
    if (action === "add") input.value = "";
  } catch (reason) { status.textContent = reason.message; }
  finally {
    busy = false; add.disabled = false;
    list.querySelectorAll("button").forEach(button => { button.disabled = false; });
  }
}
form.addEventListener("submit", event => {
  event.preventDefault();
  update("add", { host: input.value, includeSubdomains: subdomains.checked, mode: mode.value });
});
update("list");
