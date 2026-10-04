"use strict";
// Isolated review prototype: no API calls, persistence, submissions or valuation math.
const samples = [
  { id: "ultima", name: "ULTIMA", price: 12000000, image: "listing-3a.jpg", location: "Caloocan, Metro Manila", type: "house", offer: "sale" },
  { id: "carrera", name: "CARRERA", price: 8500000, image: "bt2.jpg", location: "Caloocan, Metro Manila", type: "house", offer: "sale" }
];
const money = n => "₱" + n.toLocaleString("en-PH");
function cards(rows) {
  return rows.map(p => `<article class="property-card"><div class="card-image"><img src="../../assets/listings/${p.image}" alt="Architectural illustration for ${p.name}" width="1536" height="1024"><span class="card-label">FOR SALE · SAMPLE</span></div><div class="card-body"><div class="card-top"><h3>${p.name}</h3><span class="card-price">${money(p.price)}</span></div><p class="card-location">${p.location}</p><div class="card-bottom"><small>Ask for complete property details</small><a class="text-link" href="#property-${p.id}">View property <span aria-hidden="true">↗</span></a></div></div></article>`).join("");
}
document.querySelector('[data-cards="home"]').innerHTML = cards(samples);
document.querySelector('[data-cards="results"]').innerHTML = cards(samples);
const menu = document.querySelector(".menu-toggle");
const nav = document.querySelector("#main-nav");
function closeMenu() { menu.setAttribute("aria-expanded", "false"); nav.dataset.open = "false"; }
menu.addEventListener("click", () => {
  const open = menu.getAttribute("aria-expanded") !== "true";
  menu.setAttribute("aria-expanded", String(open)); nav.dataset.open = String(open);
});
document.addEventListener("keydown", ev => { if (ev.key === "Escape" && menu.getAttribute("aria-expanded") === "true") { closeMenu(); menu.focus(); } });
document.querySelector("#direction").addEventListener("change", ev => { document.documentElement.dataset.direction = ev.target.value; });
function route(focus = true) {
  let name = location.hash.slice(1) || "home";
  if (name === "main") { document.querySelector("#main").focus(); return; }
  const property = samples.find(p => name === "property-" + p.id);
  if (property) {
    name = "property-detail";
    document.querySelector("#detail-title").textContent = property.name;
    document.querySelector("#detail-price").textContent = money(property.price);
    const img = document.querySelector("#detail-image");
    img.src = "../../assets/listings/" + property.image; img.alt = "Architectural illustration for " + property.name;
  }
  if (!document.querySelector(`[data-page="${name.replace(/[^a-z-]/g, "")}"]`)) name = "home";
  document.querySelectorAll("[data-page]").forEach(p => { p.hidden = p.dataset.page !== name; });
  document.querySelectorAll("[data-nav]").forEach(a => {
    if (a.dataset.nav === name || (name === "property-detail" && a.dataset.nav === "properties")) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  closeMenu();
  document.title = "SEA Estates — " + (name === "home" ? "Design preview" : name.replace(/-/g, " ") + " preview");
  if (focus) {
    const title = document.querySelector("[data-page]:not([hidden]) h1");
    title.setAttribute("tabindex", "-1"); title.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }
}
window.addEventListener("hashchange", () => route()); route(false);
const search = document.querySelector("#property-search");
function filter() {
  const f = new FormData(search);
  const locationText = String(f.get("location") || "").trim().toLowerCase();
  const budget = Number(f.get("budget"));
  const rows = samples.filter(p => (!locationText || p.location.toLowerCase().includes(locationText)) && (!budget || p.price <= budget) && (!f.get("type") || p.type === f.get("type")) && (!f.get("offer") || p.offer === f.get("offer")));
  document.querySelector('[data-cards="results"]').innerHTML = cards(rows);
  document.querySelector("#result-count").textContent = `${rows.length} sample ${rows.length === 1 ? "property" : "properties"}`;
  document.querySelector("#empty-results").hidden = rows.length > 0;
}
search.addEventListener("submit", ev => { ev.preventDefault(); filter(); });
document.querySelector("#clear-filters").addEventListener("click", () => { search.reset(); filter(); });
const locationSamples = {
  batangas: { barangay: "ALANGILAN", street: "AGUDA COMPOUND" },
  bauan: { barangay: "POBLACION III", street: "BINAY ST (RESSURRECCION ST)" },
  lipa: { barangay: "ADYA", street: null }
};
const municipality = document.querySelector("#municipality"), barangay = document.querySelector("#barangay"), street = document.querySelector("#street"), unlisted = document.querySelector("#unlisted");
function resetStreet() { street.replaceChildren(new Option("Choose a barangay first", "")); street.disabled = true; unlisted.checked = false; }
municipality.addEventListener("change", () => {
  const sample = locationSamples[municipality.value];
  barangay.replaceChildren(new Option(sample ? "Choose a barangay" : "Choose a municipality first", ""));
  if (sample) barangay.add(new Option(sample.barangay, sample.barangay));
  barangay.disabled = !sample; barangay.value = ""; resetStreet();
});
barangay.addEventListener("change", () => {
  resetStreet(); if (!barangay.value) return;
  const sample = locationSamples[municipality.value];
  street.replaceChildren(new Option(sample.street ? "Choose a street" : "No sample street — select not listed", ""));
  if (sample.street) street.add(new Option(sample.street, sample.street));
  street.disabled = false;
});
unlisted.addEventListener("change", () => { if (unlisted.checked) street.value = ""; street.disabled = unlisted.checked || !barangay.value; });
document.querySelector("#guide-preview").addEventListener("submit", ev => {
  ev.preventDefault();
  document.querySelectorAll('[aria-invalid="true"]').forEach(e => e.removeAttribute("aria-invalid"));
  const fields = [[municipality, "Choose a municipality."], [barangay, "Choose a barangay."], [street, "Choose a street or select My street is not listed."], [document.querySelector("#classification"), "Choose a BIR classification."], [document.querySelector("#lot-area"), "Enter a lot area above zero."]];
  const missing = fields.find(([f]) => f === street ? !unlisted.checked && !f.value : f.type === "number" ? !(Number(f.value) > 0) : !f.value);
  const message = document.querySelector("#guide-feedback"); message.hidden = false;
  message.setAttribute("role", missing ? "alert" : "status");
  if (missing) { message.textContent = missing[1]; missing[0].setAttribute("aria-invalid", "true"); missing[0].focus(); }
  else { message.textContent = "Location layout preview complete. In the live redesign, the existing calculator will continue to property details. No estimate was calculated here."; message.focus(); }
});
