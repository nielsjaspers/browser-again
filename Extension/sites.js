const form = document.querySelector("#add-site");
const input = document.querySelector("#site");
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
    if (!response || response.error) throw new Error(response?.error || "Could not load your sites. Try reopening Browser Again.");
    list.replaceChildren();
    for (const host of response.sites) {
      const item = document.createElement("li");
      const label = document.createElement("span");
      label.textContent = host;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "secondary";
      remove.textContent = "Remove";
      remove.setAttribute("aria-label", `Remove ${host}`);
      remove.addEventListener("click", () => update("remove", host));
      item.append(label, remove);
      list.append(item);
    }
    status.textContent = response.sites.length ? "" : "No custom sites yet.";
    if (action === "add") { input.value = ""; input.focus(); }
  } catch (error) { status.textContent = error.message; }
  finally {
    busy = false;
    add.disabled = false;
    list.querySelectorAll("button").forEach(button => { button.disabled = false; });
  }
}
form.addEventListener("submit", event => { event.preventDefault(); update("add", input.value); });
update("list");
