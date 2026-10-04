"use strict";
// Loaded BEFORE the original application. Isolate storage and block mutations.
(() => {
  window.SEA_PREVIEW = { blocked: [], storageIsolated: true, ready: false };
  const memory = new WeakMap();
  for (const [method, fn] of Object.entries({
    getItem(key) { return memory.get(this)?.get(String(key)) ?? null; },
    setItem(key, value) { if (!memory.has(this)) memory.set(this, new Map()); memory.get(this).set(String(key), String(value)); },
    removeItem(key) { memory.get(this)?.delete(String(key)); },
    clear() { memory.get(this)?.clear(); }
  })) Object.defineProperty(Storage.prototype, method, { value: fn, configurable: true });
  const originalFetch = window.fetch.bind(window);
  window.fetch = function (resource, options) {
    const method = String(options?.method || resource?.method || "GET").toUpperCase();
    if (!["GET", "HEAD"].includes(method)) {
      window.SEA_PREVIEW.blocked.push({ type: "fetch", method, url: String(resource?.url || resource) });
      return Promise.reject(new Error("Design preview: submissions are disabled; nothing was sent."));
    }
    return originalFetch(resource, options);
  };
  const xhrOpen = XMLHttpRequest.prototype.open, xhrSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, ...rest) { this.seaMethod = String(method).toUpperCase(); return xhrOpen.call(this, method, ...rest); };
  XMLHttpRequest.prototype.send = function (...args) { if (!["GET", "HEAD"].includes(this.seaMethod)) throw new Error("Design preview: XHR writes disabled."); return xhrSend.apply(this, args); };
  navigator.sendBeacon = () => false;
  document.addEventListener("submit", event => {
    if (event.target.matches("[data-sf-search]")) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const form = event.target;
    let message = form.querySelector(".sf-form-status, [data-est-lead-status], .sea-preview-feedback");
    if (!message) { message = document.createElement("p"); message.className = "sea-preview-feedback"; form.appendChild(message); }
    message.setAttribute("role", "status"); message.textContent = "Design preview: nothing was submitted. The existing live service will be retained.";
    window.SEA_PREVIEW.blocked.push({ type: "submit" });
  }, true);
  document.addEventListener("click", event => {
    if (event.target.closest("[data-sf-auth], [data-sf-save]")) {
      event.preventDefault(); event.stopImmediatePropagation();
      window.SEA_PREVIEW.blocked.push({ type: "account-action" });
      const notice = document.getElementById("sea-preview-notice");
      if (notice) notice.textContent = "Preview only: account actions are disabled. Your existing account flow stays in the live site.";
    }
  }, true);
  if (!location.hash) history.replaceState(null, "", "#/home");
})();
