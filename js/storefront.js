(function () {
  "use strict";

  var API = window.ESREALTY_LISTINGS_API;
  var host = null;
  var openAuth = function () {};
  var active = false;
  var requestId = 0;
  var cacheKey = "";
  var viewState = { loading: false, error: "", result: null, mode: "grid" };
  var siteContact = { eyebrow: "TALK TO A SHOPHOUSE SPECIALIST", title: "Ready to put the ground floor to work?", description: "Tell us your province, budget, and business plan. A shophouse specialist from ES Realty will reply within one business day with listings and next steps.", phone: "+63 900 000 0000", email: "hello@esrealty.ph", address: "Batangas, Philippines", hours: "Monday–Saturday, 9:00 AM–6:00 PM" };

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
    });
  }

  function safeImage(value) {
    try {
      var url = new URL(String(value || ""));
      return url.protocol === "https:" ? url.href : "";
    } catch (e) { return ""; }
  }

  function money(value, suffix) {
    var amount = Number(value || 0);
    return "₱" + new Intl.NumberFormat("en-PH", { maximumFractionDigits: 0 }).format(amount) + (suffix || "");
  }

  function route() {
    var raw = location.hash.replace(/^#\/?/, "");
    var split = raw.split("?");
    var path = split[0] || "home";
    return { path: path, params: new URLSearchParams(split.slice(1).join("?")) };
  }

  function go(path) {
    location.hash = path.charAt(0) === "/" ? "#" + path : "#/" + path;
  }

  function header() {
    return '<header class="sf-header"><a class="sf-brand" href="#/home" aria-label="ES Realty home">' +
      '<span class="sf-brand-mark">ES</span><span><b>ES Realty</b><small>Property, clearly.</small></span></a>' +
      '<nav class="sf-nav"><a href="#/home">Home</a><a href="#/search">Properties</a><a href="#/project-bt">Project B.T</a><a href="#/home" data-sf-services>Services</a></nav>' +
      '<div class="sf-header-actions"><button class="sf-link-btn" data-sf-auth="signin">Sign in</button>' +
      '<button class="sf-primary-btn" data-sf-auth="signup">Create account</button>' +
      '<button class="sf-menu-btn" data-sf-menu aria-label="Open menu" aria-expanded="false"><span></span><span></span><span></span></button></div>' +
      '<div class="sf-menu" data-sf-menu-panel><a href="#/home">Home</a><a href="#/search">Properties</a><a href="#/project-bt">Project B.T</a><a href="#/home" data-sf-services>Services</a><button data-sf-auth="signin">Sign in</button><button data-sf-auth="signup">Create account</button></div></header>';
  }

  function footer() {
    return '<footer class="sf-footer"><div class="sf-brand"><span class="sf-brand-mark">ES</span><span><b>ES Realty</b><small>Philippine property intelligence</small></span></div>' +
      '<p>Find, compare, and inquire about verified properties from one secure platform.</p>' +
      '<div><a href="#/search">Browse properties</a><button data-sf-auth="signin">Agent sign in</button></div></footer>';
  }

  function shell(content) {
    return '<div class="sf-site">' + header() + '<main class="sf-main">' + content + '</main>' + footer() + '</div>';
  }

  function loadSiteContact() {
    if (!API || !API.siteSettings) return;
    API.siteSettings().then(function (result) {
      if (result && result.data) siteContact = Object.assign({}, siteContact, result.data);
      if (active && route().path === "home") renderCurrent();
    }).catch(function () {});
  }

  function firstImage(listing) {
    var images = Array.isArray(listing.images) ? listing.images : [];
    return images.length ? safeImage(images[0].url || images[0]) : "";
  }

  function cardImages(listing) {
    var images = Array.isArray(listing.images) ? listing.images : [];
    return images.map(function (item) { return safeImage(item.url || item); }).filter(Boolean);
  }

  function cardMedia(listing) {
    var images = cardImages(listing);
    if (!images.length) return '<div class="sf-image-empty">ES</div>';
    if (images.length === 1) return '<img src="' + esc(images[0]) + '" alt="' + esc(listing.title) + '" loading="lazy">';
    var slides = images.map(function (image, i) {
      return '<div class="sf-slide" aria-hidden="' + (i ? "true" : "false") + '"><img src="' + esc(image) + '" alt="' + esc(listing.title) + ' photo ' + (i + 1) + '" loading="lazy"></div>';
    }).join("");
    var dots = images.map(function (_, i) {
      return '<button type="button" data-sf-car-dot="' + i + '"' + (i === 0 ? ' class="active"' : "") + ' aria-label="Go to photo ' + (i + 1) + '"></button>';
    }).join("");
    return '<div class="sf-carousel" data-sf-carousel data-images="' + images.length + '" data-index="0">' +
      '<div class="sf-car-track">' + slides + '</div>' +
      '<span class="sf-car-count">1/' + images.length + '</span>' +
      '<button type="button" class="sf-car-btn prev" data-sf-car-prev aria-label="Previous photo"></button>' +
      '<button type="button" class="sf-car-btn next" data-sf-car-next aria-label="Next photo"></button>' +
      '<div class="sf-car-dots">' + dots + '</div></div>';
  }

  function setCarousel(car, index) {
    var count = Number(car.getAttribute("data-images") || 1);
    var current = ((index % count) + count) % count;
    car.setAttribute("data-index", String(current));
    var track = car.querySelector(".sf-car-track");
    if (track) track.style.transform = "translateX(-" + (current * 100) + "%)";
    var dots = car.querySelectorAll(".sf-car-dots button");
    for (var i = 0; i < dots.length; i++) dots[i].classList.toggle("active", i === current);
    var countEl = car.querySelector(".sf-car-count");
    if (countEl) countEl.textContent = (current + 1) + "/" + count;
    var gallery = car.closest(".sf-gallery");
    if (gallery) {
      var thumbs = gallery.querySelectorAll(".sf-thumbs button");
      for (var j = 0; j < thumbs.length; j++) thumbs[j].classList.toggle("active", j === current);
    }
  }

  function detailGallery(listing, images) {
    if (!images.length) return '<div class="sf-gallery empty"><div>ES Realty</div></div>';
    var slides = images.map(function (image, i) {
      return '<div class="sf-slide" aria-hidden="' + (i ? "true" : "false") + '"><img src="' + esc(image) + '" alt="' + esc(listing.title) + ' photo ' + (i + 1) + '"></div>';
    }).join("");
    var multi = images.length > 1;
    var dots = multi ? images.map(function (_, i) {
      return '<button type="button" data-sf-car-dot="' + i + '"' + (i === 0 ? ' class="active"' : "") + ' aria-label="Go to photo ' + (i + 1) + '"></button>';
    }).join("") : "";
    var thumbs = multi ? '<div class="sf-thumbs">' + images.map(function (image, i) {
      return '<button type="button" data-sf-thumb="' + i + '"' + (i === 0 ? ' class="active"' : "") + ' aria-label="View photo ' + (i + 1) + '"><img src="' + esc(image) + '" alt="" loading="lazy"></button>';
    }).join("") + '</div>' : "";
    return '<div class="sf-gallery"><div class="sf-gallery-stage">' +
      '<div class="sf-carousel" data-sf-carousel data-images="' + images.length + '" data-index="0">' +
      '<div class="sf-car-track">' + slides + '</div>' +
      (multi ? '<span class="sf-car-count">1/' + images.length + '</span>' : "") +
      (multi ? '<button type="button" class="sf-car-btn prev" data-sf-car-prev aria-label="Previous photo"></button>' : "") +
      (multi ? '<button type="button" class="sf-car-btn next" data-sf-car-next aria-label="Next photo"></button>' : "") +
      (multi ? '<div class="sf-car-dots">' + dots + '</div>' : "") +
      '</div></div>' + thumbs + '</div>';
  }

  function locationText(listing) {
    return [listing.barangay, listing.city, listing.province].filter(Boolean).join(", ") || listing.region || "Philippines";
  }

  function typeLabel(value) {
    var labels = { "house-and-lot": "House & Lot", condominium: "Condominium", "lot-only": "Land", townhouse: "Townhouse", shophouse: "Shophouse", commercial: "Commercial", industrial: "Industrial", agricultural: "Agricultural", foreclosed: "Foreclosed" };
    return labels[value] || String(value || "Property").replace(/-/g, " ");
  }

  function card(listing) {
    var price = money(listing.display_price, listing.offer_type === "rent" ? "/mo" : "");
    return '<article class="sf-property-card sf-reveal sf-reveal-up ' + (viewState.mode === "list" ? "is-list" : "") + '">' +
      '<button class="sf-card-open" data-sf-listing="' + esc(listing.id) + '" aria-label="Open ' + esc(listing.title) + '"></button>' +
      '<div class="sf-card-media">' + cardMedia(listing) +
      '<div class="sf-card-tags"><span>' + esc(listing.offer_type === "rent" ? "For rent" : "For sale") + '</span>' + (listing.featured ? '<span class="featured">Featured</span>' : '') + '</div>' +
      '<button class="sf-save" data-sf-save="' + esc(listing.id) + '" aria-label="Sign in to save">♡</button></div>' +
      '<div class="sf-card-copy"><p class="sf-card-type">' + esc(typeLabel(listing.property_type)) + '</p><h3>' + esc(price) + '</h3>' +
      '<h4>' + esc(listing.title) + '</h4><p class="sf-card-location">' + esc(locationText(listing)) + '</p>' +
      '<div class="sf-card-meta"><span><b>' + esc(listing.bedrooms || 0) + '</b> beds</span><span><b>' + esc(listing.bathrooms || 0) + '</b> baths</span>' +
      '<span><b>' + esc(listing.floor_area_sqm || listing.lot_size_sqm || 0) + '</b> sqm</span></div></div></article>';
  }

  function empty(message) {
    return '<div class="sf-empty"><div>ES</div><h3>No properties found</h3><p>' + esc(message || "Try changing your filters.") + '</p></div>';
  }

  function skeletons(count) {
    var html = "";
    for (var i = 0; i < count; i++) html += '<div class="sf-property-card sf-skeleton"><div></div><div></div></div>';
    return html;
  }

  function searchFields(params, compact) {
    function selected(name, value) { return params.get(name) === value ? " selected" : ""; }
    var types = [["", "Any property"], ["house-and-lot", "House & Lot"], ["condominium", "Condominium"], ["lot-only", "Land"], ["townhouse", "Townhouse"], ["shophouse", "Shophouse"], ["commercial", "Commercial"]];
    var options = types.map(function (item) { return '<option value="' + item[0] + '"' + (params.get("property_type") === item[0] ? " selected" : "") + '>' + item[1] + '</option>'; }).join("");
    return '<form class="sf-search-form' + (compact ? " compact" : "") + '" data-sf-search>' +
      '<label><span>Location</span><input name="city" value="' + esc(params.get("city") || "") + '" placeholder="City or municipality"></label>' +
      '<label><span>Property type</span><select name="property_type">' + options + '</select></label>' +
      '<label><span>Budget up to</span><select name="max_price"><option value=""' + selected("max_price", "") + '>Any price</option><option value="3000000"' + selected("max_price", "3000000") + '>₱3M</option><option value="5000000"' + selected("max_price", "5000000") + '>₱5M</option><option value="10000000"' + selected("max_price", "10000000") + '>₱10M</option><option value="20000000"' + selected("max_price", "20000000") + '>₱20M</option></select></label>' +
      '<button type="submit">Search properties</button></form>';
  }

  function constructionSection() {
    return '<section class="sf-construction"><div class="sf-construction-track sf-motion-track"><div class="sf-construction-sticky">' +
      '<div class="sf-construction-heading"><p class="sf-eyebrow">BUILT IN MOTION</p><h2>Shophouse. <em>One thriving address.</em></h2><p>Scroll to develop a connected live-work row, layer by architectural layer.</p></div>' +
      '<div class="sf-construction-stage"><svg class="sf-construction-svg" viewBox="0 0 720 520" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Three connected two-storey shophouses being developed">' +
        '<defs>' +
          '<linearGradient id="sf-glass" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#d9eff8"/><stop offset=".48" stop-color="#82b7cc"/><stop offset="1" stop-color="#47778d"/></linearGradient>' +
          '<linearGradient id="sf-wall" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#fff"/><stop offset="1" stop-color="#e8e9e6"/></linearGradient>' +
          '<linearGradient id="sf-concrete" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#c7c9c8"/><stop offset="1" stop-color="#858b8d"/></linearGradient>' +
          '<linearGradient id="sf-night" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#1e3439"/><stop offset="1" stop-color="#101d20"/></linearGradient>' +
          '<pattern id="sf-roof-tiles" width="18" height="12" patternUnits="userSpaceOnUse"><rect width="18" height="12" fill="#4c4b47"/><path d="M0 1Q4.5 8 9 1M9 1Q13.5 8 18 1" fill="none" stroke="#74716a" stroke-width="1"/></pattern>' +
          '<pattern id="sf-grid" width="28" height="28" patternUnits="userSpaceOnUse"><path d="M28 0H0V28" fill="none" stroke="#6a737d" stroke-width=".6" opacity=".18"/></pattern>' +
          '<g id="sf-upper-window"><rect width="52" height="66" rx="2" fill="url(#sf-glass)" stroke="#355d6c"/><path d="M26 1V65M1 33H51" stroke="#f3fbff" stroke-width="1.4" opacity=".72"/><path d="M5 5H22L5 28Z" fill="#fff" opacity=".16"/></g>' +
          '<g id="sf-storefront"><rect width="128" height="76" rx="2" fill="url(#sf-night)" stroke="#263c42"/><path d="M42 1V75M86 1V75M1 18H127" stroke="#78909a" stroke-width="1.3"/><path d="M8 25H37L8 66Z" fill="#fff" opacity=".1"/></g>' +
          '<filter id="sf-shadow" x="-30%" y="-30%" width="160%" height="180%"><feDropShadow dx="0" dy="18" stdDeviation="15" flood-color="#1b2027" flood-opacity=".16"/></filter>' +
        '</defs>' +
        '<rect x="28" y="20" width="664" height="456" rx="28" fill="url(#sf-grid)"/>' +
        '<ellipse cx="360" cy="419" rx="270" ry="30" fill="#1b2027" opacity=".08"/>' +
        '<g class="sf-phase sf-phase-ground" data-phase="1">' +
          '<rect x="72" y="397" width="576" height="35" rx="3" fill="#e6e7e3" stroke="#a8afaa"/><rect x="72" y="432" width="576" height="44" fill="#777b7a"/>' +
          '<path d="M72 430H648M72 443H648" stroke="#f8f8f5" stroke-width="2"/><path d="M115 462H196M320 462H400M524 462H605" stroke="#d8dbd8" stroke-width="2" stroke-dasharray="18 12"/>' +
          '<path class="sf-draw-line" d="M105 396V158M275 396V158M445 396V158M615 396V158M105 397H615" fill="none" stroke="#8f9993" stroke-width="1" stroke-dasharray="6 7"/>' +
          '<circle cx="105" cy="397" r="4" fill="#f97316"/><circle cx="275" cy="397" r="4" fill="#f97316"/><circle cx="445" cy="397" r="4" fill="#f97316"/><circle cx="615" cy="397" r="4" fill="#f97316"/>' +
        '</g>' +
        '<g class="sf-phase sf-phase-foundation" data-phase="2" filter="url(#sf-shadow)">' +
          '<rect x="99" y="382" width="522" height="22" rx="2" fill="url(#sf-concrete)" stroke="#747b7d"/><rect x="105" y="367" width="160" height="15" fill="#b6bab9"/><rect x="280" y="367" width="160" height="15" fill="#aeb3b2"/><rect x="455" y="367" width="160" height="15" fill="#a5abaa"/>' +
          '<path d="M275 368V404M445 368V404" stroke="#666e70" stroke-width="2"/>' +
        '</g>' +
        '<g class="sf-phase sf-phase-structure" data-phase="3">' +
          '<g fill="#c2c6c5" stroke="#7e8586" stroke-width="1.2"><rect x="105" y="171" width="14" height="211"/><rect x="268" y="171" width="14" height="211"/><rect x="438" y="171" width="14" height="211"/><rect x="601" y="171" width="14" height="211"/></g>' +
          '<rect x="101" y="288" width="518" height="15" fill="#aeb3b2" stroke="#7e8586"/><rect x="101" y="171" width="518" height="14" fill="#babfbd" stroke="#7e8586"/>' +
          '<path class="sf-draw-line" d="M112 178H608M112 295H608M112 375H608" fill="none" stroke="#f97316" stroke-width="2" stroke-dasharray="7 8"/>' +
        '</g>' +
        '<g class="sf-phase sf-phase-envelope" data-phase="4" filter="url(#sf-shadow)">' +
          '<rect x="109" y="178" width="502" height="204" fill="url(#sf-wall)" stroke="#c2c7c4"/>' +
          '<rect x="109" y="284" width="502" height="18" fill="#e1e2df" stroke="#b9bfbb"/><rect x="99" y="174" width="522" height="13" fill="#f8f8f5" stroke="#b9bfbb"/>' +
          '<g fill="#f5f5f2" stroke="#c5cac7"><rect x="101" y="164" width="22" height="222"/><rect x="267" y="164" width="22" height="222"/><rect x="437" y="164" width="22" height="222"/><rect x="597" y="164" width="22" height="222"/></g>' +
          '<path d="M109 207H611M109 277H611M109 310H611" stroke="#d0d4d1"/>' +
        '</g>' +
        '<g class="sf-phase sf-phase-glazing" data-phase="5">' +
          '<use href="#sf-upper-window" x="132" y="213"/><use href="#sf-upper-window" x="191" y="213"/><use href="#sf-upper-window" x="302" y="213"/><use href="#sf-upper-window" x="361" y="213"/><use href="#sf-upper-window" x="472" y="213"/><use href="#sf-upper-window" x="531" y="213"/>' +
          '<use href="#sf-storefront" x="126" y="306"/><use href="#sf-storefront" x="296" y="306"/><use href="#sf-storefront" x="466" y="306"/>' +
        '</g>' +
        '<g class="sf-phase sf-phase-roof" data-phase="6">' +
          '<path d="M105 171L124 137H266L282 171Z" fill="url(#sf-roof-tiles)" stroke="#393936"/><path d="M275 171L294 137H436L452 171Z" fill="url(#sf-roof-tiles)" stroke="#393936"/><path d="M445 171L464 137H606L622 171Z" fill="url(#sf-roof-tiles)" stroke="#393936"/>' +
          '<path d="M96 169H624V181H96Z" fill="#f2f2ee" stroke="#b4bab6"/><g fill="#f6f6f2" stroke="#b8bdb9"><path d="M99 169V130H115V169Z"/><path d="M269 169V126H285V169Z"/><path d="M439 169V126H455V169Z"/><path d="M609 169V130H625V169Z"/></g>' +
          '<g><path d="M121 300H259L251 327H129Z" fill="#292d2d"/><path d="M291 300H429L421 327H299Z" fill="#292d2d"/><path d="M461 300H599L591 327H469Z" fill="#292d2d"/></g>' +
        '</g>' +
        '<g class="sf-phase sf-phase-final" data-phase="7">' +
          '<g font-family="Inter,sans-serif" font-size="10" font-weight="700" letter-spacing="2" fill="#f4f2eb" text-anchor="middle"><text x="190" y="318">SHOP 01</text><text x="360" y="318">SHOP 02</text><text x="530" y="318">SHOP 03</text></g>' +
          '<g fill="#ffd18c" class="sf-window-light" opacity=".22"><rect x="132" y="219" width="111" height="54"/><rect x="302" y="219" width="111" height="54"/><rect x="472" y="219" width="111" height="54"/></g>' +
          '<g><circle cx="118" cy="373" r="12" fill="#6a737d"/><path d="M118 383V401" stroke="#5f6771" stroke-width="4"/><path d="M102 403H134L130 386H106Z" fill="#a96e40"/><circle cx="603" cy="373" r="12" fill="#6a737d"/><path d="M603 383V401" stroke="#5f6771" stroke-width="4"/><path d="M587 403H619L615 386H591Z" fill="#a96e40"/></g>' +
          '<path class="sf-phase-glow" d="M99 174H621M105 404H615M275 171V404M445 171V404" fill="none" stroke="#f97316" stroke-width="2.5" opacity=".48"/>' +
          '<text x="360" y="500" text-anchor="middle" font-family="Georgia,serif" font-size="18" fill="#3f464e" font-style="italic">Three businesses. Three homes. One connected community.</text>' +
        '</g>' +
      '</svg><div class="sf-construction-step"><span>01</span><b>Scroll to build</b></div></div>' +
      '<div class="sf-construction-labels"><span data-phase="1">Site</span><span data-phase="2">Foundation</span><span data-phase="3">Structure</span><span data-phase="4">Envelope</span><span data-phase="5">Glazing</span><span data-phase="6">Details</span><span data-phase="7">Complete</span></div>' +
      '<div class="sf-construction-progress"></div>' +
    '</div></div></section>';
  }

  function whyShopSection() {
    return '<section class="sf-why-shop"><div class="sf-why-shop-track sf-motion-track"><div class="sf-construction-sticky">' +
      '<div class="sf-construction-heading"><p class="sf-eyebrow">WHY SHOPHOUSES</p><h2>Shophouse. <em>Two ways to earn.</em></h2><p>See every unit combine ground-floor retail with residential income above.</p></div>' +
      '<div class="sf-construction-stage"><svg class="sf-construction-svg" viewBox="0 0 720 520" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Three two-storey shophouses with businesses below and residences above">' +
        '<defs>' +
          '<linearGradient id="sf2-warm" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#f7b25a"/><stop offset="1" stop-color="#d97b2e"/></linearGradient>' +
          '<linearGradient id="sf2-upper" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#f7dcab"/><stop offset="1" stop-color="#e2ac5c"/></linearGradient>' +
          '<linearGradient id="sf2-meter" x1="0" y1="1" x2="0" y2="0"><stop stop-color="#b9853f"/><stop offset="1" stop-color="#f5b04a"/></linearGradient>' +
          '<linearGradient id="sf2-meter2" x1="0" y1="1" x2="0" y2="0"><stop stop-color="#d99b45"/><stop offset="1" stop-color="#f7dcab"/></linearGradient>' +
          '<marker id="sf2-arr" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="#f97316"/></marker>' +
        '</defs>' +
        '<rect x="24" y="18" width="672" height="464" rx="26" fill="url(#sf-grid)"/>' +
        '<g class="sf-phase sf2-sh1" data-phase="1">' +
          '<ellipse cx="360" cy="438" rx="260" ry="12" fill="#1e2a3a" opacity=".07"/>' +
          '<rect x="40" y="435" width="640" height="4" fill="#eef0f1"/><rect x="40" y="439" width="640" height="45" fill="#777b7a"/>' +
          '<g fill="url(#sf-wall)" stroke="#9aa4ae" stroke-width="1.2"><rect x="190" y="190" width="104" height="248"/><rect x="308" y="190" width="104" height="248"/><rect x="426" y="190" width="104" height="248"/></g>' +
          '<g stroke="#3f464e" stroke-width="1.2"><polygon points="186,190 242,158 298,190" fill="#68737d"/><polygon points="304,190 360,148 416,190" fill="#7b858e"/><polygon points="422,190 478,158 534,190" fill="#68737d"/></g>' +
          '<g fill="#eef0f1"><rect x="186" y="188" width="112" height="5"/><rect x="304" y="188" width="112" height="5"/><rect x="422" y="188" width="112" height="5"/></g>' +
          '<rect x="184" y="330" width="352" height="16" fill="#a5afb9" stroke="#7d8791"/>' +
          '<path class="sf-draw-line" d="M190 190V438M294 190V438M308 190V438M412 190V438M426 190V438M530 190V438" fill="none" stroke="#f97316" stroke-width="1.2" stroke-dasharray="6 7"/>' +
        '</g>' +
        '<g class="sf-phase sf2-sh2" data-phase="2">' +
          '<g fill="url(#sf2-warm)" opacity=".92"><rect x="196" y="346" width="92" height="100"/><rect x="314" y="346" width="92" height="100"/><rect x="432" y="346" width="92" height="100"/></g>' +
          '<g fill="#f97316"><path d="M188 344H296L290 322H194Z"/><path d="M306 344H414L408 322H312Z"/><path d="M424 344H532L526 322H430Z"/></g>' +
          '<g fill="#fff" text-anchor="middle" font-family="Inter,sans-serif" font-size="8" font-weight="700" letter-spacing="2"><text x="242" y="340">SHOP</text><text x="360" y="340">SHOP</text><text x="478" y="340">SHOP</text></g>' +
          '<g fill="url(#sf-glass)" stroke="#355d6c"><rect x="202" y="356" width="80" height="64" rx="3"/><rect x="320" y="356" width="80" height="64" rx="3"/><rect x="438" y="356" width="80" height="64" rx="3"/></g>' +
          '<g class="sf2-window-glow" fill="#ffd18c" opacity=".3"><rect x="206" y="360" width="72" height="56" rx="2"/><rect x="324" y="360" width="72" height="56" rx="2"/><rect x="442" y="360" width="72" height="56" rx="2"/></g>' +
          '<g stroke="#f3fbff" stroke-width="1.2" opacity=".55"><path d="M242 356V420M202 388H282"/><path d="M360 356V420M320 388H400"/><path d="M478 356V420M438 388H518"/></g>' +
          '<g class="sf2-coins"><circle cx="242" cy="378" r="6" fill="#f5b04a" stroke="#b9853f"/><circle cx="360" cy="378" r="6" fill="#f5b04a" stroke="#b9853f"/><circle cx="478" cy="378" r="6" fill="#f5b04a" stroke="#b9853f"/></g>' +
          '<text x="42" y="404" font-family="Georgia,serif" font-size="13" font-style="italic" fill="#3f464e">Retail below</text><path d="M136 400L178 392" stroke="#5f6771" stroke-width="1" fill="none"/>' +
        '</g>' +
        '<g class="sf-phase sf2-sh3" data-phase="3">' +
          '<g fill="url(#sf2-upper)" opacity=".92"><rect x="196" y="204" width="92" height="126"/><rect x="314" y="204" width="92" height="126"/><rect x="432" y="204" width="92" height="126"/></g>' +
          '<g class="sf2-window-glow" fill="#ffd18c" opacity=".5" stroke="#c08a3f"><rect x="210" y="220" width="64" height="72" rx="2"/><rect x="328" y="220" width="64" height="72" rx="2"/><rect x="446" y="220" width="64" height="72" rx="2"/></g>' +
          '<g stroke="#c08a3f" stroke-width="1.4"><path d="M242 220V292M210 256H274"/><path d="M360 220V292M328 256H392"/><path d="M478 220V292M446 256H510"/></g>' +
          '<rect x="184" y="330" width="352" height="5" fill="#5f6b76"/><g stroke="#5f6b76" stroke-width="2"><path d="M196 330V320M242 330V320M288 330V320M314 330V320M360 330V320M406 330V320M432 330V320M478 330V320M524 330V320"/></g>' +
          '<g class="sf2-coins"><circle cx="242" cy="256" r="6" fill="#f5b04a" stroke="#b9853f"/><circle cx="360" cy="256" r="6" fill="#f5b04a" stroke="#b9853f"/><circle cx="478" cy="256" r="6" fill="#f5b04a" stroke="#b9853f"/></g>' +
          '<text x="42" y="300" font-family="Georgia,serif" font-size="13" font-style="italic" fill="#3f464e">Homes above</text><path d="M142 296L178 284" stroke="#5f6771" stroke-width="1" fill="none"/>' +
        '</g>' +
        '<g class="sf-phase sf2-sh4" data-phase="4">' +
          '<rect x="602" y="292" width="36" height="148" rx="18" fill="#e9ebec" stroke="#c5cdd6"/>' +
          '<rect x="608" y="388" width="24" height="46" rx="12" fill="url(#sf2-meter)"/>' +
          '<path class="sf-flow" d="M512 400C560 404 575 408 598 410" fill="none" stroke="#f97316" stroke-width="2.5" stroke-dasharray="6 7" marker-end="url(#sf2-arr)"/>' +
          '<path class="sf-flow" d="M512 300C560 310 578 330 598 350" fill="none" stroke="#d4a66e" stroke-width="2.5" stroke-dasharray="6 7" marker-end="url(#sf2-arr)"/>' +
          '<circle cx="592" cy="404" r="6" fill="#f5b04a" stroke="#b9853f"/><circle cx="594" cy="344" r="6" fill="#f5b04a" stroke="#b9853f"/>' +
          '<text x="620" y="266" text-anchor="middle" font-size="8" font-weight="700" letter-spacing="2" fill="#6a737d">INCOME</text><text x="620" y="284" text-anchor="middle" font-family="Georgia,serif" font-size="13" fill="#3f464e">&#8369;</text>' +
        '</g>' +
        '<g class="sf-phase sf2-sh5" data-phase="5">' +
          '<rect class="sf2-meter-rise" x="608" y="320" width="24" height="68" rx="12" fill="url(#sf2-meter2)"/>' +
          '<g class="sf2-pop"><circle cx="620" cy="308" r="6" fill="#f5b04a" stroke="#b9853f"/><circle cx="606" cy="326" r="6" fill="#f5b04a" stroke="#b9853f"/><circle cx="634" cy="326" r="6" fill="#f5b04a" stroke="#b9853f"/></g>' +
          '<text x="360" y="90" text-anchor="middle" font-size="8" font-weight="700" letter-spacing="1.6" fill="#6a737d">POTENTIAL YIELD</text><rect x="320" y="99" width="80" height="30" rx="15" fill="#f97316"/><text x="360" y="119" text-anchor="middle" font-weight="800" font-size="13" fill="#fff">6–8%</text>' +
          '<path class="sf2-appr-line" d="M60 240C92 232 118 214 150 188" fill="none" stroke="#f97316" stroke-width="2.5" stroke-linecap="round"/><circle class="sf2-appr-dot" cx="60" cy="240" r="3.2" fill="#f97316"/><circle class="sf2-appr-dot" cx="150" cy="188" r="3.2" fill="#f97316"/>' +
          '<text x="42" y="262" font-size="9" font-weight="700" letter-spacing="2" fill="#6a737d">APPRECIATION</text>' +
          '<path class="sf-phase-glow" d="M190 190L242 158L294 190V438H190ZM308 190L360 148L412 190V438H308ZM426 190L478 158L530 190V438H426Z" fill="none" stroke="#f97316" stroke-width="2.2" opacity=".45"/>' +
        '</g>' +
      '</svg></div>' +
      '<div class="sf-why-equation" aria-label="Three shophouses with retail and residential income"><span><small>Three ground floors</small><b>Retail income</b></span><i>+</i><span><small>Three upper floors</small><b>Residential income</b></span><i>=</i><strong>Three assets<br>Six income paths</strong></div>' +
      '<div class="sf-construction-labels"><span data-phase="1">Three properties</span><span data-phase="2">Retail income</span><span data-phase="3">Home income</span><span data-phase="4">Cash flow</span><span data-phase="5">Value growth</span></div>' +
      '<div class="sf-construction-progress"></div>' +
    '</div></div></section>';
  }

  function home() {
    var listings = viewState.result && viewState.result.data || [];
    var cards = viewState.loading ? skeletons(3) : listings.length ? listings.slice(0, 6).map(card).join("") : empty(viewState.error || "New listings will appear here once published.");
    var heroImage = listings.length ? firstImage(listings[0]) : "";
    var cities = ["Batangas City", "Lipa", "Tanauan", "Santo Tomas", "Imus", "Bacoor", "Dasmariñas", "General Trias", "Santa Rosa", "Calamba", "Biñan", "Angeles", "San Fernando", "Antipolo", "Taytay", "Iloilo City", "Cebu City", "Lapu-Lapu", "Cagayan de Oro", "Davao City", "General Santos"];
    var chips = cities.map(function (city, i) { return '<a class="sf-reveal sf-reveal-zoom" style="--d:' + (Math.min(i, 11) * 0.05).toFixed(2) + 's" href="#/search?city=' + encodeURIComponent(city) + '">' + esc(city) + '</a>'; }).join("");
    return shell('<section class="sf-hero"><div class="sf-hero-copy"><p class="sf-eyebrow">PHILIPPINE SHOPHOUSE SPECIALISTS</p><h1>Shophouses that <em>work</em> harder.</h1>' +
      '<p>Storefront below, living space above — one address for your business, family, and investment. ES Realty verifies live-work listings across the Philippines.</p>' +
      '<div class="sf-hero-actions"><a class="sf-hero-btn" href="#/project-bt">Learn about Project B.T <span>→</span></a><button class="sf-hero-link" type="button" data-sf-scroll="#sf-contact">Talk to a Shophouse Specialist</button></div>' +
      '<div class="sf-proof"><span><b>Verified</b> live-work listings</span><span><b>Direct</b> developer access</span><span><b>Feasibility</b> guidance</span></div></div>' +
      '<div class="sf-hero-art"><div class="sf-hero-frame">' + (heroImage ? '<img src="' + esc(heroImage) + '" alt="Two-storey shophouse with retail below and living space above" fetchpriority="high" decoding="async">' : '') + '<span>Live-work, done right</span></div><div class="sf-floating-stat"><b>Business below.</b><span>Living above.</span></div></div><div class="sf-scroll-cue" aria-hidden="true"><i></i></div></section>' +

      '<div class="sf-marquee" aria-hidden="true"><div class="sf-marquee-track">' + cities.concat(cities).map(function (c) { return '<span>' + esc(c) + '</span>'; }).join('<b>&bull;</b>') + '<b>&bull;</b></div></div>' +

      '<section class="sf-why"><div class="sf-why-head sf-reveal"><div><p class="sf-eyebrow">WHY SHOPHOUSES</p><h2>One address. <em>Three kinds of value.</em></h2></div><p>The shophouse is the backbone of Philippine daily commerce — and one of the most durable live-work investments you can make.</p></div>' +
      '<div class="sf-why-grid">' +
      '<article class="sf-why-card sf-reveal sf-reveal-up"><div class="sf-why-ic"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M5 21V5.5L12 3v18M12 21v-8h7v8M12 8.5h1.6M12 12h1.6M16 8.5h1.6M16 12h1.6"/></svg></div><h3>Built for business</h3><p>Ground-floor retail with residence above — a storefront and a home on a single lot, designed for how Philippine communities actually trade.</p></article>' +
      '<article class="sf-why-card sf-reveal sf-reveal-up"><div class="sf-why-ic"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21h16M4 21V4l8-2v19M12 21V11h8v10M8 8h1.6M8 12h1.6M8 16h1.6"/></svg></div><h3>Two income streams</h3><p>Run the shop and rent the residence, or rent both. Owners routinely earn from every half of the same building.</p></article>' +
      '<article class="sf-why-card sf-reveal sf-reveal-up"><div class="sf-why-ic"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8h12l-1.2 12.2a1 1 0 0 1-1 .8H8.2a1 1 0 0 1-1-.8L6 8z"/><path d="M9 11V7a3 3 0 0 1 6 0v4"/></svg></div><h3>Everyday demand</h3><p>Sari-sari stores, clinics, cafés, and service shops need street-facing space — shophouses answer that demand where it lives.</p></article>' +
      '<article class="sf-why-card sf-reveal sf-reveal-up"><div class="sf-why-ic"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l6-6 4 4 7-8"/><path d="M14 7h6v6"/></svg></div><h3>Long-term appreciation</h3><p>Commercial corner positions in growing corridors hold value across cycles — an asset that keeps earning while it appreciates.</p></article>' +
      '</div></section>' +
      constructionSection() +
      whyShopSection() +

      '<section class="sf-section"><div class="sf-section-head sf-reveal"><div><p class="sf-eyebrow">FEATURED LISTINGS</p><h2>Shophouses &amp; live-work spaces, handpicked</h2></div><a href="#/search">View all properties →</a></div>' +
      '<div class="sf-featured-filter sf-reveal sf-reveal-zoom">' + searchFields(new URLSearchParams(), true) + '</div>' +
      '<div class="sf-property-grid">' + cards + '</div></section>' +

      '<section class="sf-locations"><div class="sf-locations-wrap"><div class="sf-reveal"><p class="sf-eyebrow">LOCATIONS WE COVER</p><h2>Where shophouse demand is growing.</h2><p>From CALABARZON to Central Visayas, ES Realty tracks live-work listings in the provinces where daily commerce is on the rise. Tap a city to browse its current inventory.</p></div>' +
      '<div class="sf-loc-chips">' + chips + '</div></div></section>' +

      '<section class="sf-testimonials"><div class="sf-section-head sf-reveal"><div><p class="sf-eyebrow">CLIENT VOICES</p><h2>Owners who put the ground floor to work.</h2></div></div><div class="sf-quote-grid">' +
      '<figure class="sf-quote sf-reveal sf-reveal-up"><blockquote>&ldquo;We run the store downstairs and rent the room upstairs. Two incomes from one lot — that changed our math.&rdquo;</blockquote><figcaption><b>Aling Cora</b><span>Sari-sari store owner · Lipa, Batangas</span></figcaption></figure>' +
      '<figure class="sf-quote sf-reveal sf-reveal-up"><blockquote>&ldquo;ES Realty walked us through feasibility and financing on the same call. Our clinic signed a five-year lease within months.&rdquo;</blockquote><figcaption><b>Dr. Marquez</b><span>Dental clinic founder · Dasmariñas, Cavite</span></figcaption></figure>' +
      '<figure class="sf-quote sf-reveal sf-reveal-up"><blockquote>&ldquo;I started with one shophouse and now hold four. The pipeline they showed me is exactly what I bought.&rdquo;</blockquote><figcaption><b>Robert T.</b><span>Repeat investor · Santa Rosa, Laguna</span></figcaption></figure>' +
      '</div></section>' +

      '<section class="sf-roi"><div class="sf-reveal"><p class="sf-eyebrow">THE INVESTOR CASE</p><h2>A shophouse pays you <em>twice.</em></h2><p>Ground-floor trade covers operations while the residence above rents or appreciates. Most of our buyers target returns from both halves of the same building.</p>' +
      '<div class="sf-roi-stats"><div class="sf-roi-stat sf-reveal sf-reveal-up"><b>6–8%</b><span>Indicative gross rental yield on shophouse units</span></div><div class="sf-roi-stat sf-reveal sf-reveal-up"><b data-count="2">2</b><span>Income streams — retail ground floor and residence above</span></div><div class="sf-roi-stat sf-reveal sf-reveal-up"><b data-count="3" data-suffix="+">3+</b><span>Potential tenants a single unit can host over its life</span></div></div></div>' +
      '<div class="sf-guide sf-reveal sf-reveal-right"><h3>Download the Shophouse Investment Guide</h3><p>Financing paths, a location checklist, and unit economics — free for buyers who want the full picture before they view.</p>' +
      '<form data-sf-guide><label>Email<input type="email" name="email" required maxlength="254" placeholder="you@email.com"></label><button type="submit">Send me the guide →</button><p class="sf-form-status" aria-live="polite"></p></form></div></section>' +

      '<section class="sf-process" id="sf-process"><div class="sf-section-head sf-reveal"><div><p class="sf-eyebrow">REAL ESTATE SERVICES</p><h2>Local guidance for every <em>property decision.</em></h2></div><p>Practical real estate support for buyers, sellers, landlords, investors, and developers across the Philippines.</p></div><div class="sf-process-steps">' +
      '<article class="sf-process-step sf-reveal sf-reveal-up"><b>01</b><h3>Property Sales &amp; Acquisition</h3><p>Buy or sell residential, commercial, land, condominium, townhouse, and shophouse properties with transaction guidance.</p></article>' +
      '<article class="sf-process-step sf-reveal sf-reveal-up"><b>02</b><h3>Leasing &amp; Tenant Placement</h3><p>Find suitable spaces, screen tenant requirements, and structure leasing conversations for homes and businesses.</p></article>' +
      '<article class="sf-process-step sf-reveal sf-reveal-up"><b>03</b><h3>Investment &amp; Feasibility</h3><p>Review purchase costs, financing, rental potential, development options, cash flow, and expected returns.</p></article>' +
      '<article class="sf-process-step sf-reveal sf-reveal-up"><b>04</b><h3>Property Appraisal &amp; Valuation</h3><p>Prepare market-based valuation guidance using location, comparable properties, improvements, and current demand.</p></article>' +
      '<article class="sf-process-step sf-reveal sf-reveal-up"><b>05</b><h3>Property Management</h3><p>Support owners with tenant coordination, rent tracking, maintenance, property records, and day-to-day oversight.</p></article>' +
      '<article class="sf-process-step sf-reveal sf-reveal-up"><b>06</b><h3>Due Diligence Coordination</h3><p>Organize checks for title, zoning, taxes, permits, documents, site condition, and other closing requirements.</p></article>' +
      '<article class="sf-process-step sf-reveal sf-reveal-up"><b>07</b><h3>Project Development Advisory</h3><p>Assess sites, highest and best use, product positioning, unit economics, and development planning.</p></article>' +
      '<article class="sf-process-step sf-reveal sf-reveal-up"><b>08</b><h3>Commercial &amp; Shophouse Advisory</h3><p>Match business concepts with visible locations, flexible layouts, tenant demand, and practical operating plans.</p></article>' +
      '</div></section>' +

      '<section class="sf-cta" id="sf-contact"><div class="sf-cta-band"><div class="sf-reveal"><p class="sf-eyebrow">' + esc(siteContact.eyebrow) + '</p><h2>' + esc(siteContact.title) + '</h2><p>' + esc(siteContact.description) + '</p><div class="sf-contact-details"><a href="tel:' + encodeURIComponent(String(siteContact.phone || "").replace(/[^\d+]/g, "")) + '">' + esc(siteContact.phone) + '</a><a href="mailto:' + encodeURIComponent(siteContact.email || "") + '">' + esc(siteContact.email) + '</a><span>' + esc(siteContact.address) + '</span><span>' + esc(siteContact.hours) + '</span></div></div>' +
      '<form class="sf-cta-form sf-reveal sf-reveal-right" data-sf-consult><label>Full name<input name="name" required maxlength="160" placeholder="Your name"></label><label>Email<input type="email" name="email" required maxlength="254" placeholder="you@email.com"></label><label>Phone<input name="phone" required maxlength="50" placeholder="+63 900 000 0000"></label><label>Message<textarea name="message" rows="2" maxlength="2000" placeholder="Province, budget, and business idea..."></textarea></label><button type="submit">Request a call →</button><p class="sf-form-status" aria-live="polite"></p></form></div></section>');
  }

  function btStars(score) {
    return '<span class="bt-stars" aria-label="' + score + ' out of 5 stars">' + "★".repeat(score) + '<i>' + "★".repeat(5 - score) + '</i></span>';
  }

  function projectBtPage() {
    var heroImage = "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1440&q=80";
    var conceptImage = "https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=1200&q=82";
    return shell('<section class="bt-hero"><div class="bt-hero-copy"><p class="bt-eyebrow">ES REALTY / DEVELOPMENT CONCEPT 01</p><h1>Project B.T <span>— Bahay Tindahan</span></h1>' +
      '<p class="bt-hero-lede">A modern mixed-use real estate concept combining commercial and residential spaces in a single two-storey building.</p>' +
      '<div class="bt-actions"><button class="bt-button bt-button-dark" data-bt-inquire="Project B.T">Inquire About Project B.T <span>↗</span></button><a class="bt-link" href="#bt-concept" data-sf-scroll="#bt-concept">Explore the concept <span>↓</span></a></div>' +
      '<div class="bt-hero-proof"><span><b>01</b> Business below</span><span><b>02</b> Living above</span><span><b>∞</b> Value over time</span></div></div>' +
      '<div class="bt-hero-media"><img src="' + heroImage + '" alt="Modern white and wood two-storey shophouse exterior"><div class="bt-image-label"><span>Mixed-use by design</span><b>Built for business. Made for living.</b></div><div class="bt-hero-stamp">B.T<br><small>BAHAY<br>TINDAHAN</small></div></div></section>' +

      '<section class="bt-intro bt-section"><div class="bt-section-label">01 / THE OPPORTUNITY</div><div class="bt-intro-grid"><div><h2>One address.<br><em>Multiple incomes.</em></h2></div><div class="bt-intro-copy"><p>Project B.T (BahayTindahan) is a modern mixed-use development combining commercial and residential spaces within a single two-storey building. The ground floor is designed for retail and business; the second floor becomes a residence, office, or rental unit.</p><p>It is a practical response to the way growing Philippine communities live and trade: close to home, visible from the road, and flexible enough to evolve with the owner.</p><div class="bt-note"><span>INSPIRATION NOTE</span><b>Informed by proven models like Alfamart-style retail fronts and townhouse-store concepts.</b></div></div></div></section>' +

      '<section class="bt-mission"><div class="bt-mission-image"><img src="' + conceptImage + '" alt="Warm modern mixed-use interior and exterior concept" loading="lazy"><div class="bt-image-caption">A compact footprint with room to grow</div></div><div class="bt-mission-copy"><div class="bt-section-label">02 / OUR NORTH STAR</div><h2>Real estate that works as hard as its owner.</h2><div class="bt-mission-block"><span>MISSION</span><p>Develop modern, affordable, and profitable shophouse communities that support local businesses while creating sustainable long-term real estate investments.</p></div><div class="bt-mission-block"><span>VISION</span><p>Be the leading developer of high-quality mixed-use developments in strategic locations, creating lasting value for business owners, residents, investors, and communities throughout the Philippines.</p></div></div></section>' +

      '<section class="bt-section bt-concept" id="bt-concept"><div class="bt-section-head"><div><div class="bt-section-label">03 / CONCEPT PLAN</div><h2>Two ways to make<br><em>one lot work harder.</em></h2></div><p>Minimal, functional, and designed around real daily operations. Every plan keeps circulation clear and every square meter productive.</p></div><div class="bt-concept-grid">' +
      '<article class="bt-concept-card"><div class="bt-plan-visual"><div class="bt-plan-level bt-plan-ground"><b>GROUND FLOOR</b><strong>STORE</strong><span>Retail / service frontage</span><small>Store area · Parking / service area</small></div><div class="bt-plan-level bt-plan-upper"><b>SECOND FLOOR</b><strong>HOME / OFFICE</strong><span>Private, flexible living</span><small>Kitchen · Living area · Bedroom · Balcony</small></div></div><div class="bt-concept-copy"><div class="bt-card-index">01</div><h3>Mini House with Store</h3><p>2-storey, store at ground floor, living space upstairs. A minimal and affordable format for small lots and owner-operators.</p><div class="bt-specs"><span><b>20\' × 50\'</b> lot</span><span><b>~100 sqm</b> land</span><span><b>~40 sqm</b> total floor</span></div><p class="bt-small-copy">Ideal for a sari-sari store, small café, salon, laundry shop, or a growing family that wants income at home.</p></div></article>' +
      '<article class="bt-concept-card bt-concept-card-featured"><div class="bt-plan-visual bt-plan-wide"><div class="bt-plan-level bt-plan-ground"><b>GROUND FLOOR</b><strong>SHOP + PARKING</strong><span>High-visibility commercial face</span><small>Store area · Parking / service area</small></div><div class="bt-plan-level bt-plan-upper"><b>SECOND FLOOR</b><strong>FLEXIBLE SUITE</strong><span>Home, office, or rental</span><small>Kitchen · Living area · Bedroom · Balcony</small></div></div><div class="bt-concept-copy"><div class="bt-card-index">02</div><h3>Townhouse Shophouse <i>(3-Sublot)</i></h3><p>A 2-storey minimal-design format with parking, more frontage, and a bigger built-up footprint for a multi-unit development.</p><div class="bt-specs"><span><b>20\' × 70\'</b> lots</span><span><b>~1,400 sqft</b> built-up</span><span><b>3 sublots</b> planned</span></div><p class="bt-small-copy">Designed for a stronger commercial presence while keeping the upstairs program adaptable for residence, office, or rental.</p></div></article></div></section>' +

      '<section class="bt-tiers bt-section"><div class="bt-section-head"><div><div class="bt-section-label">04 / PRODUCT TIERS</div><h2>Choose your<br><em>level of ambition.</em></h2></div><p>Three product directions, one underlying idea: make the property productive from day one.</p></div><div class="bt-tier-grid">' +
      '<article class="bt-tier-card"><div class="bt-tier-top"><span>ESSENTIAL SERIES</span><b>01</b></div><h3>TESTAROSSA</h3><div class="bt-tier-price">₱6.5M <small>– ₱8.0M</small></div><p class="bt-tier-position">Affordable, practical shophouse for first-time investors, entrepreneurs, and small business owners.</p><div class="bt-tier-rule"></div><span class="bt-list-label">IDEAL FOR</span><p class="bt-tier-ideal">Sari-sari store · Convenience store · Water refilling · Laundry · Small café · Salon / barbershop</p><ul><li>2-storey minimalist design</li><li>1 parking space and open commercial area</li><li>2–3 bedrooms, 2 bathrooms, balcony</li><li>Low-maintenance exterior</li></ul><p class="bt-tier-best"><b>Best for:</b> Value-conscious buyers seeking an accessible mixed-use investment.</p><div class="bt-tier-ratings"><span>Rental potential <b>' + btStars(3) + '</b></span><span>Capital appreciation <b>' + btStars(3) + '</b></span></div><button class="bt-tier-cta" data-bt-inquire="Testarossa">Discuss Testarossa <span>↗</span></button></article>' +
      '<article class="bt-tier-card bt-tier-card-main"><div class="bt-tier-top"><span>SIGNATURE SERIES</span><b>02</b></div><h3>CARRERA</h3><div class="bt-tier-price">₱8.5M <small>– ₱11.5M</small></div><p class="bt-tier-position">Premium shophouse with larger spaces, upgraded finishes, and enhanced flexibility for growing businesses and investors.</p><div class="bt-tier-rule"></div><span class="bt-list-label">IDEAL FOR</span><p class="bt-tier-ideal">Dental clinic · Medical clinic · Coffee shop · Pharmacy · Professional office · Boutique retail</p><ul><li>Contemporary architecture and larger frontage</li><li>2 parking spaces and spacious second floor</li><li>Premium finishes, large windows, balcony</li><li>Flexible office / residential layout</li></ul><p class="bt-tier-best"><b>Best for:</b> Business owners wanting a professional image plus long-term appreciation.</p><div class="bt-tier-ratings"><span>Rental potential <b>' + btStars(4) + '</b></span><span>Capital appreciation <b>' + btStars(4) + '</b></span></div><button class="bt-tier-cta" data-bt-inquire="Carrera">Discuss Carrera <span>↗</span></button></article>' +
      '<article class="bt-tier-card"><div class="bt-tier-top"><span>PRESTIGE SERIES</span><b>03</b></div><h3>ULTIMA</h3><div class="bt-tier-price">₱12M <small>– ₱18M+</small></div><p class="bt-tier-position">Flagship luxury shophouse for high-end businesses and investors seeking maximum visibility and premium finishes.</p><div class="bt-tier-rule"></div><span class="bt-list-label">IDEAL FOR</span><p class="bt-tier-ideal">Flagship café · Fine dining · Specialty clinic · Corporate office · Luxury retail · Showroom</p><ul><li>Premium architecture and corner-lot optimization</li><li>3–4 parking spaces and high ceilings</li><li>Floor-to-ceiling glass façade and designer finishes</li><li>Smart-home features, rooftop terrace / executive office option</li><li>Landscaped frontage</li></ul><p class="bt-tier-best"><b>Best for:</b> Established businesses wanting a landmark property with premium rental and resale potential.</p><div class="bt-tier-ratings"><span>Rental potential <b>' + btStars(5) + '</b></span><span>Capital appreciation <b>' + btStars(5) + '</b></span></div><button class="bt-tier-cta" data-bt-inquire="Ultima">Discuss Ultima <span>↗</span></button></article></div></section>' +

      '<section class="bt-compare bt-section"><div class="bt-section-head"><div><div class="bt-section-label">05 / AT A GLANCE</div><h2>Compare the<br><em>three directions.</em></h2></div><p>Use the range to match your capital, operating plan, and target customer.</p></div><div class="bt-table-wrap"><table class="bt-table"><thead><tr><th></th><th>TESTAROSSA <small>Essential</small></th><th class="bt-table-featured">CARRERA <small>Signature</small></th><th>ULTIMA <small>Prestige</small></th></tr></thead><tbody>' +
      '<tr><th>Price range</th><td>₱6.5M – ₱8.0M</td><td>₱8.5M – ₱11.5M</td><td>₱12M – ₱18M+</td></tr>' +
      '<tr><th>Market position</th><td>Essential</td><td>Premium</td><td>Luxury</td></tr><tr><th>Parking</th><td>1</td><td>2</td><td>3–4</td></tr><tr><th>Commercial space</th><td>Standard</td><td>Large</td><td>Extra Large</td></tr><tr><th>Interior finish</th><td>Standard</td><td>Premium</td><td>Luxury</td></tr><tr><th>Target buyer</th><td>First-time Investor</td><td>Growing Business</td><td>High-end Investor</td></tr><tr><th>Rental potential</th><td>' + btStars(3) + '</td><td>' + btStars(4) + '</td><td>' + btStars(5) + '</td></tr><tr><th>Capital appreciation</th><td>' + btStars(3) + '</td><td>' + btStars(4) + '</td><td>' + btStars(5) + '</td></tr></tbody></table></div></section>' +

      '<section class="bt-market"><div class="bt-market-copy"><div class="bt-section-label">06 / MARKET OPPORTUNITY</div><h2>Designed for the next wave of <em>local commerce.</em></h2><p>Growing communities in Batangas are creating demand for spaces that can serve customers, tenants, and owners at the same address. Project B.T is positioned for strategic, high-visibility locations where convenience and density support everyday trade.</p><div class="bt-market-points"><span><b>Batangas</b> growing commercial-residential demand</span><span><b>Flexible</b> formats for owners, tenants, and investors</span><span><b>Multiple</b> income streams from one land position</span></div></div><div class="bt-financial-card"><span>PROJECT B.T AT A GLANCE</span><div><small>FORMAT</small><b>2-storey<em> mixed-use</em></b></div><div><small>GROUND FLOOR</small><b>Retail<em> / service frontage</em></b></div><div><small>UPPER FLOOR</small><b>Home / office<em> / rental</em></b></div><p>Choose from Essential, Signature, and Prestige directions, then validate the site, design, permits, financing, and market before committing.</p></div></section>' +

      '<section class="bt-site bt-section"><div class="bt-section-head"><div><div class="bt-section-label">07 / SITE SELECTION</div><h2>Find the corner<br><em>that gets noticed.</em></h2></div><p>The location is part of the product. We prioritize sites that make the commercial frontage visible, useful, and easy to reach.</p></div><div class="bt-site-grid"><div class="bt-map-card"><div class="bt-map-grid"></div><div class="bt-map-road bt-road-a"></div><div class="bt-map-road bt-road-b"></div><div class="bt-map-pin">B.T</div><div class="bt-map-label">Strategic high-visibility site</div></div><div class="bt-checklist"><div><b>01</b><span>200–400 sqm</span><small>Enough scale for a compact multi-unit format.</small></div><div><b>02</b><span>Corner lot</span><small>Two-sided visibility and easier access.</small></div><div><b>03</b><span>Near highways</span><small>Capture passing traffic and commuter routines.</small></div><div><b>04</b><span>Near daily retail</span><small>Look around Alfamart, DALI, O!Save-type nodes.</small></div><div><b>05</b><span>Near subdivisions</span><small>Serve built-in residential demand.</small></div></div></div></section>' +

      '<section class="bt-timeline"><div class="bt-section-label">08 / DELIVERY PATH</div><div class="bt-timeline-head"><h2>From site to<br><em>street presence.</em></h2><span>Estimated duration<br><b>3–4 months</b></span></div><div class="bt-timeline-steps"><div><b>01</b><strong>Acquire</strong><small>Secure the right lot</small></div><i></i><div><b>02</b><strong>Design</strong><small>Plan the right mix</small></div><i></i><div><b>03</b><strong>Permits</strong><small>Prepare approvals</small></div><i></i><div><b>04</b><strong>Build</strong><small>Deliver the shell</small></div><i></i><div><b>05</b><strong>Sell</strong><small>Bring value to market</small></div></div></section>' +

      '<section class="bt-highlights bt-section"><div><div class="bt-section-label">09 / INVESTMENT HIGHLIGHTS</div><h2>Not just a building.<br><em>A repeatable model.</em></h2></div><div class="bt-highlight-grid"><article><span>01</span><h3>Rental income</h3><p>Generate income from the upstairs residence, office, or rental unit while the ground floor serves business activity.</p></article><article><span>02</span><h3>Capital appreciation</h3><p>Own a visible, useful asset in a growing community with multiple potential future users.</p></article><article><span>03</span><h3>Scalable investment</h3><p>Start with one unit or a 3-sublot development and build a repeatable shophouse portfolio.</p></article></div></section>' +

      '<section class="bt-contact" id="bt-inquiry"><div class="bt-contact-mark">BT</div><div class="bt-contact-copy"><div class="bt-section-label">10 / START A CONVERSATION</div><h2>Build the next<br><em>Bahay Tindahan.</em></h2><p>Tell us which product direction fits your site, business, or investment plan. ES REALTY will help you explore the right next step.</p></div><form class="bt-inquiry-form" data-bt-inquiry-form><label>Full name<input name="name" required maxlength="160" placeholder="Your name"></label><label>Email<input type="email" name="email" required maxlength="254" placeholder="you@email.com"></label><label>Interest<select name="interest"><option>Project B.T overview</option><option>Testarossa — Essential</option><option>Carrera — Signature</option><option>Ultima — Prestige</option><option>Site / development partnership</option></select></label><label>Message<textarea name="message" rows="3" maxlength="2000" placeholder="Tell us about your location, business, or investment goal."></textarea></label><button class="bt-button bt-button-light" type="submit">Send inquiry <span>↗</span></button><p class="bt-form-status" aria-live="polite"></p></form></section>' +
      '<section class="bt-thanks"><p>ES REALTY</p><h2>Thank you for imagining<br><em>what is possible.</em></h2><a href="#/home">Return to ES Realty <span>↗</span></a></section>');
  }

  function searchPage(params) {
    var result = viewState.result || { data: [], total: 0, page: 1, total_pages: 0 };
    var cards = viewState.loading ? skeletons(6) : result.data.length ? result.data.map(card).join("") : empty(viewState.error);
    var page = Number(result.page || 1), pages = Number(result.total_pages || 0);
    var pager = pages > 1 ? '<div class="sf-pager"><button data-sf-page="' + (page - 1) + '"' + (page <= 1 ? " disabled" : "") + '>Previous</button><span>Page ' + page + ' of ' + pages + '</span><button data-sf-page="' + (page + 1) + '"' + (page >= pages ? " disabled" : "") + '>Next</button></div>' : "";
     return shell('<section class="sf-search-page"><div class="sf-search-intro"><p class="sf-eyebrow">PROPERTY SEARCH</p><h1>Find a property that fits.</h1><p>Browse current property inventory across the Philippines.</p></div>' +
      '<div class="sf-filter-stick">' + searchFields(params, true) + '</div><div class="sf-results-bar"><p><b>' + esc(result.total || 0) + '</b> properties</p>' +
      '<div><select data-sf-sort><option value="date_desc"' + (params.get("sort") === "date_desc" || !params.get("sort") ? " selected" : "") + '>Newest</option><option value="price_asc"' + (params.get("sort") === "price_asc" ? " selected" : "") + '>Price: Low to high</option><option value="price_desc"' + (params.get("sort") === "price_desc" ? " selected" : "") + '>Price: High to low</option></select>' +
      '<button data-sf-mode="grid" class="' + (viewState.mode === "grid" ? "active" : "") + '">Grid</button><button data-sf-mode="list" class="' + (viewState.mode === "list" ? "active" : "") + '">List</button></div></div>' +
      '<div class="sf-property-grid ' + (viewState.mode === "list" ? "list" : "") + '">' + cards + '</div>' + pager + '</section>');
  }

  function detailPage(listing) {
    if (viewState.loading) return shell('<section class="sf-detail"><div class="sf-detail-loading">Loading property…</div></section>');
    if (!listing) return shell('<section class="sf-detail">' + empty(viewState.error || "This listing is unavailable.") + '</section>');
    var images = Array.isArray(listing.images) ? listing.images.map(function (item) { return safeImage(item.url || item); }).filter(Boolean) : [];
    var gallery = detailGallery(listing, images);
    return shell('<section class="sf-detail"><button class="sf-back" data-sf-back>← Back to properties</button>' + gallery +
      '<div class="sf-detail-layout"><article class="sf-detail-copy"><p class="sf-eyebrow">' + esc(typeLabel(listing.property_type)) + ' · ' + esc(listing.offer_type === "rent" ? "FOR RENT" : "FOR SALE") + '</p>' +
      '<h1>' + esc(listing.title) + '</h1><p class="sf-detail-location">' + esc(locationText(listing)) + '</p><div class="sf-key-stats"><span><b>' + esc(listing.bedrooms || 0) + '</b> Bedrooms</span><span><b>' + esc(listing.bathrooms || 0) + '</b> Bathrooms</span><span><b>' + esc(listing.floor_area_sqm || 0) + '</b> Floor sqm</span><span><b>' + esc(listing.lot_size_sqm || 0) + '</b> Lot sqm</span></div>' +
      '<section><h2>About this property</h2><p class="sf-description">' + esc(listing.description || "Contact the listing agent for complete property information.") + '</p></section>' +
      '<section><h2>Location</h2><div class="sf-detail-map" id="sf-detail-map"><span>' + esc(locationText(listing)) + '</span></div></section></article>' +
      '<aside class="sf-contact-card"><p>Listed at</p><h2>' + esc(money(listing.display_price, listing.offer_type === "rent" ? "/mo" : "")) + '</h2>' +
      '<button class="sf-outline-btn" data-sf-save="' + esc(listing.id) + '">♡ Save this property</button><form data-sf-inquiry="' + esc(listing.id) + '"><h3>Request more information</h3><label>Full name<input name="full_name" required maxlength="160"></label><label>Email<input type="email" name="email" maxlength="254"></label><label>Phone<input name="phone" required maxlength="50"></label><label>Message<textarea name="message" rows="4" maxlength="5000" placeholder="I would like to know more about this property."></textarea></label><label class="sf-consent"><input type="checkbox" name="consent" required><span>I consent to the processing of my contact details for this inquiry.</span></label><button type="submit">Send inquiry</button><p class="sf-form-status" aria-live="polite"></p></form></aside></div></section>');
  }

  function patchHome() {
    var listings = viewState.result && viewState.result.data || [];
    var cards = viewState.loading ? skeletons(3) : listings.length ? listings.slice(0, 6).map(card).join("") : empty(viewState.error || "New listings will appear here once published.");
    var grid = host.querySelector(".sf-property-grid");
    if (grid) grid.innerHTML = cards;

    var frame = host.querySelector(".sf-hero-frame");
    if (frame) {
      var image = frame.querySelector("img");
      var heroImage = listings.length ? firstImage(listings[0]) : "";
      if (heroImage) {
        if (!image) {
          image = document.createElement("img");
          image.alt = "Two-storey shophouse with retail below and living space above";
          image.fetchPriority = "high";
          image.decoding = "async";
          frame.insertBefore(image, frame.firstChild);
        }
        if (image.src !== heroImage) image.src = heroImage;
      } else if (image) image.remove();
    }

    var contact = host.querySelector("#sf-contact .sf-cta-band > div");
    if (contact) {
      var eyebrow = contact.querySelector(".sf-eyebrow");
      var title = contact.querySelector("h2");
      var description = contact.querySelector("p:not(.sf-eyebrow)");
      var details = contact.querySelectorAll(".sf-contact-details > *");
      if (eyebrow) eyebrow.textContent = siteContact.eyebrow;
      if (title) title.textContent = siteContact.title;
      if (description) description.textContent = siteContact.description;
      if (details[0]) { details[0].textContent = siteContact.phone; details[0].href = "tel:" + String(siteContact.phone || "").replace(/[^\d+]/g, ""); }
      if (details[1]) { details[1].textContent = siteContact.email; details[1].href = "mailto:" + (siteContact.email || ""); }
      if (details[2]) details[2].textContent = siteContact.address;
      if (details[3]) details[3].textContent = siteContact.hours;
    }
  }

  function renderCurrent() {
    if (!active || !host) return;
    var current = route();
    if (current.path === "project-bt") host.innerHTML = projectBtPage();
    else if (current.path.indexOf("listing/") === 0) host.innerHTML = detailPage(viewState.result && viewState.result.data);
    else if (current.path === "search") host.innerHTML = searchPage(current.params);
    else if (host.querySelector(".sf-hero")) patchHome();
    else host.innerHTML = home();
    mountMap();
    bindHomeMotion();
    bindBtMotion();
    if (current.path === "home" || current.path === "") bindConstruction();
  }

  function loadCurrent(force) {
    if (!API) {
      viewState = { loading: false, error: "The property service is not available.", result: null, mode: viewState.mode };
      renderCurrent();
      return;
    }
    var current = route();
    var key = current.path + "?" + current.params.toString();
    if (!force && key === cacheKey) { renderCurrent(); return; }
    cacheKey = key;
    if (current.path === "project-bt") {
      viewState.loading = false; viewState.error = ""; viewState.result = null; renderCurrent(); return;
    }
    var id = ++requestId;
    viewState.loading = true; viewState.error = ""; viewState.result = null;
    renderCurrent();
    var pending;
    if (current.path.indexOf("listing/") === 0) pending = API.get(current.path.slice(8));
    else if (current.path === "search") {
      var filters = {};
      current.params.forEach(function (value, name) { filters[name] = value; });
      filters.per_page = filters.per_page || 12;
      pending = API.list(filters);
    } else pending = API.list({ featured: true, per_page: 6, sort: "date_desc" });
    pending.then(function (result) {
      if (id !== requestId) return;
      viewState.loading = false; viewState.result = result; renderCurrent();
    }).catch(function (error) {
      if (id !== requestId) return;
      viewState.loading = false; viewState.error = error.message || "Could not load properties."; viewState.result = null; renderCurrent();
    });
  }

  function mountMap() {
    var listing = viewState.result && viewState.result.data;
    var element = document.getElementById("sf-detail-map");
    if (!element || !listing || listing.latitude == null || listing.longitude == null) return;
    if (!window.L) { window.ESREALTY_LEAFLET.ensure().then(function () { mountMap(); }); return; }
    element.innerHTML = "";
    var map = L.map(element, { scrollWheelZoom: false }).setView([Number(listing.latitude), Number(listing.longitude)], 15);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", { maxZoom: 20, attribution: "&copy; OpenStreetMap &copy; CARTO" }).addTo(map);
    L.marker([Number(listing.latitude), Number(listing.longitude)]).addTo(map);
  }

  function toggleMenu(open) {
    var btn = document.querySelector("[data-sf-menu]");
    var panel = document.querySelector("[data-sf-menu-panel]");
    if (!btn || !panel) return;
    var isOpen = typeof open === "boolean" ? open : btn.getAttribute("aria-expanded") !== "true";
    btn.setAttribute("aria-expanded", isOpen ? "true" : "false");
    btn.setAttribute("aria-label", isOpen ? "Close menu" : "Open menu");
    panel.classList.toggle("open", isOpen);
  }

  var _homeMotionObs = null;
  var _homeParallax = null;

  function runCount(el) {
    if (!el || !el.getAttribute || !el.hasAttribute("data-count")) return;
    var target = parseFloat(el.getAttribute("data-count"));
    var suffix = el.getAttribute("data-suffix") || "";
    if (isNaN(target)) return;
    var t0 = null;
    var dur = 1200;
    function step(ts) {
      if (!t0) t0 = ts;
      var p = Math.min(1, (ts - t0) / dur);
      var eased = 1 - Math.pow(1 - p, 3);
      var val = target % 1 === 0 ? Math.round(target * eased) : (target * eased).toFixed(1);
      el.textContent = val + suffix;
      if (p < 1) requestAnimationFrame(step);
      else el.textContent = target + suffix;
    }
    requestAnimationFrame(step);
  }

  function bindHomeMotion() {
    if (_homeMotionObs) { _homeMotionObs.disconnect(); _homeMotionObs = null; }
    if (_homeParallax) { window.removeEventListener("scroll", _homeParallax); _homeParallax = null; }
    var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var reveals = document.querySelectorAll(".sf-reveal");
    if (reduced) {
      reveals.forEach(function (el) { el.classList.add("in"); });
      return;
    }
    if (!reveals.length && !document.querySelector(".sf-hero-frame")) return;
    _homeMotionObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("in");
        if (entry.target.matches("[data-count]")) runCount(entry.target);
        else entry.target.querySelectorAll && entry.target.querySelectorAll("[data-count]").forEach(runCount);
        _homeMotionObs.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
    reveals.forEach(function (el) { _homeMotionObs.observe(el); });
    var frame = document.querySelector(".sf-hero-frame");
    if (!frame || window.matchMedia("(max-width:760px)").matches) return;
    var ticking = false;
    _homeParallax = function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        ticking = false;
        var r = frame.getBoundingClientRect();
        if (r.bottom < 0 || r.top > window.innerHeight) return;
        var pct = (window.innerHeight - r.top) / (window.innerHeight + r.height);
        frame.style.transform = "translateY(" + Math.round((pct - 0.5) * -34) + "px)";
      });
    };
    window.addEventListener("scroll", _homeParallax, { passive: true });
    _homeParallax();
  }

  var _btMotionObs = null;

  function bindBtMotion() {
    if (_btMotionObs) { _btMotionObs.disconnect(); _btMotionObs = null; }
    var page = document.querySelector(".bt-hero");
    if (!page) return;
    var selector = [
      ".bt-intro-grid > *", ".bt-mission > *", ".bt-section-head > *",
      ".bt-concept-card", ".bt-tier-card", ".bt-table-wrap", ".bt-market > *",
      ".bt-site-grid > *", ".bt-checklist > div", ".bt-timeline-head > *",
      ".bt-timeline-steps > div", ".bt-timeline-steps > i", ".bt-highlights > *",
      ".bt-highlight-grid article", ".bt-contact > *", ".bt-thanks > *"
    ].join(",");
    var elements = document.querySelectorAll(selector);
    elements.forEach(function (element, index) {
      element.classList.add("bt-motion");
      element.style.setProperty("--bt-delay", ((index % 3) * 0.08).toFixed(2) + "s");
    });
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) {
      elements.forEach(function (element) { element.classList.add("bt-in"); });
      return;
    }
    _btMotionObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("bt-in");
        _btMotionObs.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -7% 0px" });
    elements.forEach(function (element) { _btMotionObs.observe(element); });
  }

  var _constructionObs = null;
  var _constructionScroll = null;

  function bindConstruction() {
    if (_constructionObs) { _constructionObs.disconnect(); _constructionObs = null; }
    if (_constructionScroll) { window.removeEventListener("scroll", _constructionScroll, true); _constructionScroll = null; }
    var tracks = document.querySelectorAll(".sf-motion-track");
    if (!tracks.length) return;
    var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      tracks.forEach(function (t) {
        t.querySelectorAll(".sf-phase").forEach(function (p) { p.classList.add("vis"); });
        var b = t.querySelector(".sf-construction-progress"); if (b) b.style.width = "100%";
        t.querySelectorAll(".sf-construction-labels span").forEach(function (l) { l.classList.add("active"); });
      });
      return;
    }
    var ticking = false;
    _constructionScroll = function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        ticking = false;
        tracks.forEach(function (track) {
          var rect = track.getBoundingClientRect();
          if (rect.bottom < 0 || rect.top > window.innerHeight) return;
          var scrolled = -rect.top;
          var dist = rect.height - window.innerHeight;
          if (dist <= 0) return;
          var pct = Math.max(0, Math.min(1, scrolled / dist));
          var phases = track.querySelectorAll(".sf-phase");
          var total = phases.length;
          phases.forEach(function (p, i) {
            var threshold = (i + 0.55) / (total + 0.9);
            p.classList.toggle("vis", pct >= threshold);
          });
          var bar = track.querySelector(".sf-construction-progress");
          if (bar) bar.style.width = Math.round(pct * 100) + "%";
          track.querySelectorAll(".sf-construction-labels span").forEach(function (l, i) {
            var threshold = (i + 0.55) / (total + 0.9);
            l.classList.toggle("active", pct >= threshold);
          });
        });
      });
    };
    window.addEventListener("scroll", _constructionScroll, { capture: true, passive: true });
    _constructionScroll();
  }

  function bind() {
    if (document.documentElement.getAttribute("data-storefront-bound") === "true") return;
    document.documentElement.setAttribute("data-storefront-bound", "true");
    window.addEventListener("hashchange", function () { if (active) { toggleMenu(false); loadCurrent(); } });
    document.addEventListener("click", function (event) {
      if (!active) return;
      var menuState = document.querySelector("[data-sf-menu]");
      if (menuState && menuState.getAttribute("aria-expanded") === "true" && !event.target.closest("[data-sf-menu]") && !event.target.closest("[data-sf-menu-panel]")) toggleMenu(false);
      var menuBtn = event.target.closest("[data-sf-menu]");
      if (menuBtn) { toggleMenu(); return; }
      if (event.target.closest("[data-sf-menu-panel]")) toggleMenu(false);
      var auth = event.target.closest("[data-sf-auth]");
      if (auth) { openAuth(auth.getAttribute("data-sf-auth")); return; }
      var services = event.target.closest("[data-sf-services]");
      if (services) { event.preventDefault(); go("home"); setTimeout(function () { var target = document.getElementById("sf-process"); if (target) target.scrollIntoView({ behavior: "smooth" }); }, 80); return; }
      var scroll = event.target.closest("[data-sf-scroll]");
      if (scroll) {
        event.preventDefault();
        var scrollTarget = document.getElementById(scroll.getAttribute("data-sf-scroll").replace(/^#/, ""));
        if (scrollTarget) scrollTarget.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      var carPrev = event.target.closest("[data-sf-car-prev]");
      if (carPrev) { var carPrevRoot = carPrev.closest("[data-sf-carousel]"); if (carPrevRoot) setCarousel(carPrevRoot, Number(carPrevRoot.getAttribute("data-index") || 0) - 1); return; }
      var carNext = event.target.closest("[data-sf-car-next]");
      if (carNext) { var carNextRoot = carNext.closest("[data-sf-carousel]"); if (carNextRoot) setCarousel(carNextRoot, Number(carNextRoot.getAttribute("data-index") || 0) + 1); return; }
      var carDot = event.target.closest("[data-sf-car-dot]");
      if (carDot) { var carDotRoot = carDot.closest("[data-sf-carousel]"); if (carDotRoot) setCarousel(carDotRoot, Number(carDot.getAttribute("data-sf-car-dot"))); return; }
      var thumb = event.target.closest("[data-sf-thumb]");
      if (thumb) { var thumbGallery = thumb.closest(".sf-gallery"); var thumbRoot = thumbGallery && thumbGallery.querySelector("[data-sf-carousel]"); if (thumbRoot) setCarousel(thumbRoot, Number(thumb.getAttribute("data-sf-thumb"))); return; }
      var listing = event.target.closest("[data-sf-listing]");
      if (listing) { go("listing/" + encodeURIComponent(listing.getAttribute("data-sf-listing"))); return; }
      var save = event.target.closest("[data-sf-save]");
      if (save) { sessionStorage.setItem("esrealty_post_auth_favorite", save.getAttribute("data-sf-save")); openAuth("signin"); return; }
      var btInquire = event.target.closest("[data-bt-inquire]");
      if (btInquire) {
        var inquiry = document.getElementById("bt-inquiry");
        if (inquiry) {
          var interest = inquiry.querySelector("[name='interest']");
          if (interest && btInquire.getAttribute("data-bt-inquire") !== "Project B.T") {
            var tier = btInquire.getAttribute("data-bt-inquire");
            Array.from(interest.options).forEach(function (option) { if (option.text.indexOf(tier) === 0) interest.value = option.text; });
          }
          inquiry.scrollIntoView({ behavior: "smooth", block: "start" });
          setTimeout(function () { var name = inquiry.querySelector("[name='name']"); if (name) name.focus(); }, 450);
        }
        return;
      }
      var back = event.target.closest("[data-sf-back]");
      if (back) { history.length > 1 ? history.back() : go("search"); return; }
      var mode = event.target.closest("[data-sf-mode]");
      if (mode) { viewState.mode = mode.getAttribute("data-sf-mode"); renderCurrent(); return; }
      var page = event.target.closest("[data-sf-page]");
      if (page && !page.disabled) { var r = route(); r.params.set("page", page.getAttribute("data-sf-page")); go("search?" + r.params.toString()); }
    });
    document.addEventListener("change", function (event) {
      if (!active || !event.target.matches("[data-sf-sort]")) return;
      var r = route(); r.params.set("sort", event.target.value); r.params.delete("page"); go("search?" + r.params.toString());
    });
    document.addEventListener("submit", function (event) {
      if (!active) return;
      var search = event.target.closest("[data-sf-search]");
      if (search) {
        event.preventDefault(); var params = new URLSearchParams(new FormData(search));
        Array.from(params.keys()).forEach(function (key) { if (!params.get(key)) params.delete(key); });
        go("search?" + params.toString()); return;
      }
      var inquiry = event.target.closest("[data-sf-inquiry]");
      if (inquiry) {
        event.preventDefault();
        var status = inquiry.querySelector(".sf-form-status"); var button = inquiry.querySelector("button[type=submit]"); var data = new FormData(inquiry);
        button.disabled = true; status.textContent = "Sending…";
        API.inquire(inquiry.getAttribute("data-sf-inquiry"), { full_name: data.get("full_name"), email: data.get("email"), phone: data.get("phone"), message: data.get("message"), contact_type: "buyer", consent: data.get("consent") === "on" }).then(function () {
          inquiry.reset(); status.textContent = "Inquiry sent. The listing agent will contact you soon."; status.className = "sf-form-status success";
        }).catch(function (error) { status.textContent = error.message || "Could not send inquiry."; status.className = "sf-form-status error"; }).finally(function () { button.disabled = false; });
      }
      var btForm = event.target.closest("[data-bt-inquiry-form]");
      if (btForm) {
        event.preventDefault();
        var btStatus = btForm.querySelector(".bt-form-status");
        var btButton = btForm.querySelector("button[type=submit]");
        var btData = new FormData(btForm);
        if (API && API.contact) {
          btButton.disabled = true;
          if (btStatus) { btStatus.textContent = "Sending…"; btStatus.className = "bt-form-status"; }
          API.contact({
            inquiry_type: "project-bt",
            full_name: btData.get("name"),
            email: btData.get("email"),
            phone: "",
            message: btData.get("message"),
            interest: btData.get("interest"),
            consent: true
          }).then(function () {
            btForm.reset();
            if (btStatus) { btStatus.textContent = "Thanks — your Project B.T inquiry is ready for the ES REALTY team."; btStatus.className = "bt-form-status success"; }
          }).catch(function (error) {
            if (btStatus) { btStatus.textContent = error.message || "Could not send. Please try again."; btStatus.className = "bt-form-status error"; }
          }).finally(function () { btButton.disabled = false; });
        } else {
          if (btStatus) { btStatus.textContent = "Thanks — your Project B.T inquiry is ready for the ES REALTY team."; btStatus.className = "bt-form-status success"; }
          btForm.reset();
        }
        return;
      }
      var guide = event.target.closest("[data-sf-guide]");
      if (guide) {
        event.preventDefault();
        var guideStatus = guide.querySelector(".sf-form-status");
        var guideButton = guide.querySelector("button[type=submit]");
        var guideData = new FormData(guide);
        if (API && API.contact) {
          guideButton.disabled = true;
          if (guideStatus) { guideStatus.textContent = "Sending…"; guideStatus.className = "sf-form-status"; }
          API.contact({ inquiry_type: "guide", email: guideData.get("email"), consent: true }).then(function () {
            guide.reset();
            if (guideStatus) { guideStatus.textContent = "Thanks — check your inbox for the Shophouse Investment Guide."; guideStatus.className = "sf-form-status success"; }
          }).catch(function (error) {
            if (guideStatus) { guideStatus.textContent = error.message || "Could not send. Please try again."; guideStatus.className = "sf-form-status error"; }
          }).finally(function () { guideButton.disabled = false; });
        } else {
          if (guideStatus) { guideStatus.textContent = "Thanks — check your inbox for the Shophouse Investment Guide."; guideStatus.className = "sf-form-status success"; }
          guide.reset();
        }
        return;
      }
      var consult = event.target.closest("[data-sf-consult]");
      if (consult) {
        event.preventDefault();
        var consultStatus = consult.querySelector(".sf-form-status");
        var consultButton = consult.querySelector("button[type=submit]");
        var consultData = new FormData(consult);
        if (API && API.contact) {
          consultButton.disabled = true;
          if (consultStatus) { consultStatus.textContent = "Sending…"; consultStatus.className = "sf-form-status"; }
          API.contact({
            inquiry_type: "consult",
            full_name: consultData.get("name"),
            email: consultData.get("email"),
            phone: consultData.get("phone"),
            message: consultData.get("message"),
            consent: true
          }).then(function () {
            consult.reset();
            if (consultStatus) { consultStatus.textContent = "Thanks — a shophouse specialist will reach out within one business day."; consultStatus.className = "sf-form-status success"; }
          }).catch(function (error) {
            if (consultStatus) { consultStatus.textContent = error.message || "Could not send. Please try again."; consultStatus.className = "sf-form-status error"; }
          }).finally(function () { consultButton.disabled = false; });
        } else {
          if (consultStatus) { consultStatus.textContent = "Thanks — a shophouse specialist will reach out within one business day."; consultStatus.className = "sf-form-status success"; }
          consult.reset();
        }
      }
    });
  }

  window.ESREALTY_STOREFRONT = {
    mount: function (options) {
      host = options.host; openAuth = options.openAuth || openAuth; active = true;
      document.body.classList.add("storefront-active"); bind(); loadSiteContact(); loadCurrent();
    },
    unmount: function () { active = false; document.body.classList.remove("storefront-active"); },
    refresh: function () { cacheKey = ""; loadCurrent(true); }
  };
})();
