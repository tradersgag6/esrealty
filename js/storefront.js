(function () {
  "use strict";

  var API = window.ESREALTY_LISTINGS_API;
  var host = null;
  var openAuth = function () {};
  var active = false;
  var requestId = 0;
  var cacheKey = "";
  var viewState = { loading: false, error: "", result: null, mode: "grid" };
  /* Service-neutral on purpose. These used to be shophouse-branded
   * ("TALK TO A SHOPHOUSE SPECIALIST" / "Ready to put the ground floor to
   * work?" / "a shophouse specialist"), and because siteSettings() fails CORS the
   * defaults are what actually renders - so the closed shophouse campaign was
   * still the homepage's call to action. The shophouse and Project B.T pages are
   * parked and must not leak their copy into the live site. */
  var siteContact = { eyebrow: "LOCAL BATANGAS GUIDANCE", title: "Ready for the next check?", description: "Tell us whether you are buying, selling, valuing, or reviewing a property. We will help you identify the next practical step.", phone: "", email: "", address: "", hours: "", contactLoaded: false };

  /* Shared implementation from js/util.js, with a byte-identical local
   * fallback so this module can be require()d directly by the Node tests. */
  var esc = (typeof window !== "undefined" && window.ESREALTY_UTIL && window.ESREALTY_UTIL.esc)
    ? window.ESREALTY_UTIL.esc
    : function (value) {
        return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
          return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
        });
      };

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

  /* ------------------------------------------------------------------
   * Navigation model - single source of truth.
   *
   * The desktop bar and the mobile panel used to be two hand-maintained
   * copies of the same five links. They drifted, and there was no way to add
   * a destination without editing both. Both surfaces are now generated from
   * these lists, so a new destination is one edit.
   *
   * Services and Project B.T have no pages of their own yet, so their items
   * resolve to the homepage services section and the Project B.T coming-soon
   * page respectively. Nothing here is a dead link.
   * ------------------------------------------------------------------ */
  var NAV = [
    { href: "#/home", label: "Home" },
    /* No hard-coded ?state=Batangas here. That link pointed the primary nav at a
     * query that excluded every live listing, so "Properties" always rendered
     * "No properties found". The state filter is still available in the form and
     * as a removable chip; it just must not be applied silently. */
    { href: "#/search", label: "Properties" },
    { href: "#/property-value", label: "Get My Property Value", cta: true }
  ];

  var SERVICES = [
    { href: "#/search", label: "Buying a property", note: "Shortlists, viewings and offer support." },
    { href: "#/property-value?service=sell", label: "Selling a property", note: "Free value guide and a pricing review." },
    { href: "#/search?offer_type=rent", label: "Renting", note: "Tenant matching and lease support." },
    { href: "#/property-value?service=pre-selling", label: "Pre-selling", note: "Prepare, price and launch with confidence." },
    { href: "#/home?section=services", label: "Property management", note: "Turnover, collections and repairs handled." },
    { href: "#/home?section=services", label: "Title and legal", note: "Handover checks and documentary help." },
    { href: "#/home?section=services", label: "Financing", note: "Introduction to bank and developer options." }
  ];

  /* Shophouse and Project B.T are temporarily closed and are presented as one
   * "Project B.T" destination. Both entries resolve to the coming-soon page so
   * no project detail is exposed. */
  var PROJECT_BT = [
    { href: "#/project-bt", label: "Project B.T" },
    { href: "#/project-bt", label: "Shophouses" }
  ];

  function navLink(item) {
    return '<a href="' + esc(item.href) + '"' + (item.cta ? ' class="sf-nav-cta"' : "") + '>' + esc(item.label) + '</a>';
  }

  function navChevron() {
    return '<svg class="sf-chev" width="10" height="7" viewBox="0 0 10 7" aria-hidden="true" focusable="false"><path d="M1 1.5l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }

  function dropDown(label, items, extraClass) {
    return '<details class="sf-drop ' + (extraClass || "") + '" data-sf-drop><summary class="sf-drop-summary">' +
      esc(label) + navChevron() + '</summary><div class="sf-drop-panel">' +
      items.map(function (item) {
        return '<a href="' + esc(item.href) + '"' + (item.cta ? ' class="sf-drop-cta"' : "") + '><span>' + esc(item.label) +
          (item.note ? '<small>' + esc(item.note) + '</small>' : '') + '</span></a>';
      }).join("") + '</div></details>';
  }

  /* Mobile menu groups are accordions, not flat lists.
   *
   * A flat list put 12 rows on screen with no hierarchy, and the auth buttons at
   * the bottom were unreachable on a 667px-tall phone. <details> is the same
   * primitive the desktop dropdowns already use, so the existing
   * closeDrops / outside-click / Escape handlers apply unchanged and the two
   * surfaces cannot drift apart.
   *
   * Uses .sf-menu-acc-* rather than .sf-drop-* so the desktop panel's absolute
   * positioning does not leak in. */
  function menuGroup(title, items) {
    return '<details class="sf-menu-acc" data-sf-drop>' +
      '<summary class="sf-menu-acc-sum">' + esc(title) + navChevron() + '</summary>' +
      '<div class="sf-menu-acc-body">' + items.map(navLink).join("") + '</div>' +
      '</details>';
  }

  function header() {
    return '<header class="sf-header"><a class="sf-brand" href="#/home" aria-label="ES Realty home">' +
      '<span class="sf-brand-mark">ES</span><span><b>ES Realty</b><small>Batangas property guidance.</small></span></a>' +
      '<nav class="sf-nav" aria-label="Primary">' + NAV.map(navLink).join("") +
      dropDown("Services", SERVICES) + dropDown("Project B.T", PROJECT_BT) + '</nav>' +
      '<div class="sf-header-actions"><button class="sf-link-btn" data-sf-auth="signin">Sign in</button>' +
      '<button class="sf-primary-btn" data-sf-auth="signup">Create account</button>' +
      '<button class="sf-menu-btn" data-sf-menu aria-label="Open menu" aria-expanded="false"><span></span><span></span><span></span></button></div>' +
      '<div class="sf-menu" data-sf-menu-panel>' + NAV.map(navLink).join("") +
      menuGroup("Services", SERVICES) + menuGroup("Project B.T", PROJECT_BT) +
      '<button data-sf-auth="signin">Sign in</button><button data-sf-auth="signup">Create account</button></div></header>';
  }

  function footer() {
    return '<footer class="sf-footer"><div class="sf-brand"><span class="sf-brand-mark">ES</span><span><b>ES Realty</b><small>Batangas property guidance.</small></span></div>' +
      '<p>Start with a BIR reference, compare local properties, and get practical guidance. <span class="sf-copyright">&copy; ES Realty ' + new Date().getFullYear() + '</span><br><small>ES Realty is independent of the BIR. BIR zonal values are shown as tax-reference data.</small></p>' +
      '<div><a href="#/search">Browse properties</a><a href="#/privacy">Privacy notice</a><button data-sf-auth="signin">Agent sign in</button></div></footer>';
  }

  /* Research says a persistent bottom action bar is the single most effective
   * conversion surface on mobile. Desktop hides it via CSS because the header
   * already carries the actions. The phone link stays hidden until site
   * settings resolve, so we never render a dead tel: link. */
  function stickyBar() {
    return '<div class="sf-sticky" data-sf-sticky>' +
      '<a class="sf-sticky-primary" href="#/property-value">Get my property value</a>' +
      '<a class="sf-sticky-ghost" href="#/search">Browse</a>' +
      '<a class="sf-sticky-ghost" data-sf-sticky-call href="tel:" hidden>Call us</a>' +
      '</div>';
  }

  function shell(content) {
    return '<div class="sf-site">' + header() + '<main class="sf-main">' + content + '</main>' + footer() + stickyBar() + '</div>';
  }

  function privacyPage() {
    return shell('<section class="sf-section sf-privacy-page"><div class="sf-section-head"><div><p class="sf-eyebrow">YOUR INFORMATION</p><h1>Privacy notice</h1></div><p>How ES Realty handles information submitted through this website.</p></div>' +
      '<div class="sf-privacy-content">' +
      '<p><b>Who is responsible?</b> ES Realty operates this website and handles the inquiries submitted through it. For a privacy-related request, <a href="#/home?section=contact">contact our team</a> and write “Privacy request” in your message.</p>' +
      '<h2>Information used by the property guide</h2><p>The guide uses property details you enter, such as municipality, barangay, street, BIR classification, lot area, property type, and optional house, ownership, and selling details. The estimate is calculated in your browser. To look for available listing context, the selected municipality and property type may be queried through the Vercel-hosted market-search service; your name and contact details are not needed for that search.</p>' +
      '<h2>When you send an inquiry or request a report</h2><p>We receive the contact details and message you submit, together with the property details and estimate snapshot needed to respond. Requests are recorded in ES Realty CRM and inquiry records hosted by Supabase. Where report delivery is configured, your report and email address are sent through Resend so the report can be delivered.</p>' +
      '<h2>How we use and share information</h2><p>We use submitted information to respond to your request, prepare or deliver a requested report, coordinate a property inquiry with the relevant broker or agent, maintain service records, and protect the service from abuse. Technical request information may also be processed to prevent abuse. We do not sell personal information; Supabase, Vercel, Resend, and any relevant listing agent may process information only to provide the requested service.</p>' +
      '<h2>Retention and your choices</h2><p>We keep inquiry and report records for as long as needed to respond, maintain business records, and meet applicable legal obligations. Under the Data Privacy Act, you may exercise applicable rights such as access, correction, objection, or deletion by contacting us through the form above. You may also raise a concern with the National Privacy Commission. Some records may need to be retained where the law requires it.</p>' +
      '<h2>Security and updates</h2><p>We use access controls and reasonable safeguards for the systems that receive inquiry information. This notice may be updated as the website or its service providers change; the date below identifies the latest revision.</p>' +
      '<p class="sf-privacy-updated">Last updated: 1 October 2026</p></div></section>');
  }

  /* ------------------------------------------------------------------
   * Project B.T - coming soon.
   *
   * Shophouse and Project B.T are temporarily closed, so this page exposes no
   * project detail, pricing, floor plans or location claims. It states what is
   * coming, captures interest, and offers a useful next step. #/shophouse
   * redirects here so old inbound links do not break.
   * ------------------------------------------------------------------ */
  function comingSoonPage() {
    return shell('<section class="sf-cs">' +
      '<div class="sf-cs-hero sf-reveal sf-reveal-up">' +
      '<p class="sf-cs-mark">Project B.T</p>' +
      '<p class="sf-cs-flag"><span class="sf-cs-dot" aria-hidden="true"></span>Coming soon</p>' +
      /* No <br> in headings. It read as "Something is being builtin Batangas."
         to assistive tech and to anything that concatenates text (SEO, share
         text, plain-text export), and combined with the max-width it orphaned
         "built" onto a line of its own. The line break is a layout decision, so
         it belongs in CSS, where the width already controls it. */
      '<h1>Something is being built in Batangas.</h1>' +
      '<p class="sf-cs-lede">ES Realty is preparing a new mixed-use project. We are not sharing details before launch &mdash; but you can tell us you are interested and we will contact you first.</p>' +
      '<div class="sf-cs-actions"><a class="sf-primary-btn" href="#/property-value">Get my property value</a>' +
      '<a class="sf-outline-btn" href="#/search">Browse properties</a></div>' +
      '</div>' +
      '<div class="sf-cs-notify sf-reveal sf-reveal-up"><h2>Be the first to know</h2>' +
      '<p>Leave your email and we will let you know when Project B.T opens. No other mail from us.</p>' +
      '<form data-sf-notify>' +
      /* Visible label, not .sr-only. The label used to wrap the input and carry
       * .sr-only, which clipped the FIELD as well as the label text: the input
       * rendered 31px wide inside a 1x1 box, so the notify form could not be
       * filled in at all. A visible label is also simply better for the 40-75
       * audience this site targets. */
      '<label class="sf-field"><span>Email address</span>' +
      '<input type="email" name="email" required maxlength="254" autocomplete="email" placeholder="you@example.com"></label>' +
      '<label class="sf-consent"><input type="checkbox" name="consent" required><span>I agree to be contacted about Project B.T. I can unsubscribe at any time. See our <a href="#/privacy">Privacy Notice</a>.</span></label>' +
      '<button class="sf-primary-btn" type="submit">Notify me</button>' +
      '<p class="sf-form-status" aria-live="polite"></p></form></div></section>');
  }

  /* ------------------------------------------------------------------
   * Get My Property Value - seller lead capture.
   *
   * Research guidance applied here: a dedicated landing page with one goal, a
   * first-person benefit-led headline, only 3-4 form fields (short forms
   * convert materially better), trust-reducing microcopy next to the button,
   * and an explicit "what happens next" so people know a human calls them.
   * ------------------------------------------------------------------ */
  function propertyValuePage(params) {
    var service = String((params && params.get("service")) || "").toLowerCase();
    var isPreSelling = service === "pre-selling";
    return shell('<section class="sf-pv">' +
      '<div class="sf-pv-hero sf-reveal sf-reveal-up">' +
      '<p class="sf-eyebrow">' + (isPreSelling ? "Pre-selling support" : "Free property value guide") + '</p>' +
      '<h1>' + (isPreSelling ? "Sell with a plan, not a guess." : "Get my property value.") + '</h1>' +
      '<p class="sf-pv-lede">' + (isPreSelling
        ? "We help owners prepare, price and launch a property so it sells well from the first week on the market."
        : "Answer a few questions and get a Batangas property value guide using the selected BIR reference and disclosed property factors. Available asking listings are shown as context; their prices do not directly determine the estimate.") + '</p>' +
      /* One job per screen. This page is the HUMAN step - talk to a person about
       * an appraisal - so the primary action is the form, which is right there.
       *
       * It used to lead with "Start the value guide" -> #/home#sf-estimator,
       * which was both a loop (the value guide lives on the home page this
       * route competes with) and broken: the router splits on "?" only, so
       * "#/home#sf-estimator" parses to the path "home#sf-estimator", matches no
       * branch, and renders home without ever scrolling to the estimator.
       * data-est-services is the estimator's own handler and does the navigate +
       * scroll properly. */
      '<div class="sf-pv-actions"><a class="sf-primary-btn" href="#sf-pv-form" data-sf-scroll="sf-pv-form">Request an appraisal consultation</a>' +
      '<a class="sf-outline-btn" href="#/search">Browse properties</a></div>' +
      '<p class="sf-pv-reassure">No obligation to sell, and none to list with us.</p>' +
      '<p class="sf-pv-or"><a href="#/home" data-est-services>Not ready yet? Start with the free value guide</a></p>' +
      '</div>' +

      '<div class="sf-pv-steps"><h2 class="sf-pv-h2">What happens</h2><ol class="sf-pv-steps-list">' +
      '<li><span>01</span><div><b>Get your indicative value</b><p>The value guide takes about a minute. You get a BIR zonal reference and an indicative market range immediately.</p></div></li>' +
      '<li><span>02</span><div><b>Have a short call with our team</b><p>A member of ES Realty reviews your guide with you and asks about your plans, timing and the property itself.</p></div></li>' +
       '<li><span>03</span><div><b>Discuss a professional valuation</b><p>If a formal valuation fits your needs, we can discuss the scope, documents, site review, and fee before you decide. There is no pressure to list.</p></div></li>' +
      '</ol></div>' +

      '<div class="sf-pv-form-wrap" id="sf-pv-form"><div class="sf-pv-form-copy"><h2 class="sf-pv-h2">Talk to us about your property</h2>' +
      '<p>Tell us a little about what you are planning. We reply within one business day.</p>' +
       '<ul class="sf-pv-list"><li>No obligation to list your property</li><li>A real person reviews your request</li><li>BIR reference and disclosed estimate factors</li><li>Available asking listings are context, not confirmed sale prices</li></ul></div>' +
      '<form class="sf-pv-form" data-sf-consult><label>Full name<input name="name" required maxlength="160" autocomplete="name" placeholder="Juan dela Cruz"></label>' +
      '<label>Mobile number<input name="phone" required maxlength="50" autocomplete="tel" placeholder="09xx xxx xxxx"></label>' +
      '<label>Email<input type="email" name="email" maxlength="254" autocomplete="email" placeholder="you@example.com"></label>' +
      '<label>What are you planning?<select name="message"><option value="">Choose one</option>' +
      '<option>Just want to know my property value</option><option>I want to sell soon</option>' +
      '<option>I am preparing to sell in the future</option><option>I am looking to buy</option><option>Renting out my property</option></select></label>' +
       '<label class="sf-consent"><input type="checkbox" name="consent" required><span>I consent to ES Realty contacting me about my property. Read our <a href="#/privacy">Privacy Notice</a>. I can opt out of follow-up at any time.</span></label>' +
       '<button class="sf-primary-btn" type="submit">Request an appraisal consultation</button>' +
      '<p class="sf-pv-micro">Takes 30 seconds. No spam. No obligation.</p>' +
      '<p class="sf-form-status" aria-live="polite"></p></form></div></section>');
  }

  /* Contact details arrive asynchronously. They used to trigger a full
   * renderCurrent(), which rebuilt the home page from scratch - wiping the
   * estimator's in-progress state and throwing away the reader's scroll
   * position. Only the two contact-dependent regions are patched now. */
  /* Contact details arrive asynchronously, so patch the two regions that depend
   * on them.
   *
   * It used to rewrite the contact band's eyebrow, heading and description from
   * siteContact as well. That made the page's own editorial copy unreachable,
   * and since the settings fetch fails CORS in most environments, whatever the
   * hard-coded defaults happened to say won - which is how the closed shophouse
   * campaign became the live homepage's headline.
   *
   * Now the page owns its copy and settings only supply contact details. If the
   * band copy is ever to be CMS-driven that should be an explicit field, not a
   * side effect of a fetch that may not succeed. */
  function applyContact() {
    try {
      var call = document.querySelector("[data-sf-sticky-call]");
      if (call && siteContact.phone) {
        call.href = "tel:" + String(siteContact.phone).replace(/[^\d+]/g, "");
        call.hidden = false;
      }
      var details = document.querySelector("#sf-contact .sf-contact-details");
      if (details) details.innerHTML = contactDetails();
    } catch (e) { /* noop */ }
  }

  function loadSiteContact() {
    if (!API || !API.siteSettings) {
      siteContact = Object.assign({}, siteContact, { contactLoaded: true });
      applyContact();
      return;
    }
    API.siteSettings().then(function (result) {
      if (result && result.data) siteContact = Object.assign({}, siteContact, result.data);
      siteContact.contactLoaded = true;
      applyContact();
    }).catch(function () {
      siteContact = Object.assign({}, siteContact, { contactLoaded: true });
    });
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

  /* Grid/list is a search-results preference only. It used to be read from the
   * shared view state by every card, so toggling list view on /search left home
   * and /shophouse rendering the same properties as full-width list rows. */
  function isListView() {
    return viewState.mode === "list" && route().path === "search";
  }

  function card(listing) {
    var price = money(listing.display_price, listing.offer_type === "rent" ? "/mo" : "");
    return '<article class="sf-property-card sf-reveal sf-reveal-up ' + (isListView() ? "is-list" : "") + '">' +
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

  /* ------------------------------------------------------------------
   * Search filter model - single source of truth.
   *
   * The Properties page used to ship a dead end: the nav linked to
   * "#/search?state=Batangas", but searchFields() only rendered city,
   * property_type and max_price. The state filter was applied to the query but
   * appeared nowhere on screen, so the visitor saw "No properties found" with
   * an empty Location box and no way to tell why or clear it. offer_type
   * (linked from the Renting service) had the same problem.
   *
   * Every parameter that narrows the result set is now declared here, rendered
   * in the form, shown as a removable chip when active, and dropped by
   * clearFilters(). Adding a filter means adding one line here.
   * ------------------------------------------------------------------ */
  var FILTERS = [
    { name: "city", label: "Location", kind: "text", placeholder: "City or municipality" },
    { name: "state", label: "State / province", kind: "text", placeholder: "e.g. Batangas" },
    { name: "property_type", label: "Property type", kind: "select", options: [
      ["", "Any property"], ["house-and-lot", "House & Lot"], ["condominium", "Condominium"],
      ["lot-only", "Land"], ["townhouse", "Townhouse"], ["shophouse", "Shophouse"],
      ["commercial", "Commercial"], ["industrial", "Industrial"], ["agricultural", "Agricultural"]
    ] },
    { name: "offer_type", label: "Listing type", kind: "select", options: [
      ["", "For sale or rent"], ["sale", "For sale"], ["rent", "For rent"]
    ] },
    { name: "max_price", label: "Budget up to", kind: "select", options: [
      ["", "Any price"], ["3000000", "₱3M"], ["5000000", "₱5M"],
      ["10000000", "₱10M"], ["20000000", "₱20M"]
    ] }
  ];

  /* Sort and paging are not filters - they change presentation, not the result
     set, so they stay out of the chip list. */
  var NON_FILTER_PARAMS = ["sort", "page", "per_page", "section", "service"];

  function activeFilters(params) {
    return FILTERS
      .map(function (f) { return { def: f, value: params.get(f.name) }; })
      .filter(function (f) { return f.value !== null && f.value !== ""; });
  }

  function filterSummary(f) {
    if (f.def.kind === "select") {
      var hit = f.def.options.filter(function (o) { return o[0] === f.value; })[0];
      return hit ? hit[1] : f.value;
    }
    return f.value;
  }

  /* A search link with the named filters removed, so "clear" never has to guess
     at the current URL. */
  function clearLink(drop, extra) {
    var p = new URLSearchParams();
    forEachParam(function (name, value) {
      if (NON_FILTER_PARAMS.indexOf(name) > -1) return;
      if ((drop || []).indexOf(name) > -1) return;
      p.set(name, value);
    });
    var q = p.toString();
    var hash = (extra || "") + (q ? "?" + q : "");
    return hash ? "#/search" + hash : "#/search";
  }

  function forEachParam(fn) {
    var raw = location.hash.replace(/^#\/?/, "");
    var parts = raw.split("?");
    var params = new URLSearchParams(parts.slice(1).join("?"));
    /* URLSearchParams.forEach invokes fn(value, key) - value FIRST. Reading it
     * as (key, value) produced links like "#/search?Batangas=state". */
    params.forEach(function (value, name) { fn(name, value); });
  }

  function searchFields(params, compact) {
    var body = FILTERS.map(function (f) {
      var value = params.get(f.name) || "";
      if (f.kind === "text") {
        return '<label><span>' + esc(f.label) + '</span><input name="' + esc(f.name) + '" value="' + esc(value) +
          '" placeholder="' + esc(f.placeholder || "") + '"></label>';
      }
      var opts = f.options.map(function (o) {
        return '<option value="' + esc(o[0]) + '"' + (value === o[0] ? " selected" : "") + '>' + esc(o[1]) + '</option>';
      }).join("");
      return '<label><span>' + esc(f.label) + '</span><select name="' + esc(f.name) + '">' + opts + '</select></label>';
    }).join("");
    return '<form class="sf-search-form' + (compact ? " compact" : "") + '" data-sf-search>' + body +
      '<button type="submit">Search properties</button></form>';
  }

  /* Removable chips for whatever is currently narrowing the results. Rendered
     from the same FILTERS list, so a filter can never be applied without a way
     to see and undo it. */
  function activeFilterChips(params) {
    var active = activeFilters(params);
    if (!active.length) return "";
    return '<div class="sf-active-filters"><span class="sf-active-filters-label">Filtered by</span>' +
      active.map(function (f) {
        return '<a class="sf-chip" href="' + esc(clearLink([f.def.name])) + '" data-sf-clear-filter="' + esc(f.def.name) + '"' +
          ' aria-label="Remove filter ' + esc(f.def.label) + ': ' + esc(filterSummary(f)) + '">' + esc(f.def.label) + ': ' + esc(filterSummary(f)) +
          '<b aria-hidden="true">&times;</b></a>';
      }).join("") +
      '<a class="sf-chip-clear" href="' + esc(clearLink(active.map(function (f) { return f.def.name; }))) + '">Clear all</a>' +
      '</div>';
  }


  function contactDetails() {
    var out = [];
    if (siteContact.phone) {
      out.push('<a href="tel:' + encodeURIComponent(String(siteContact.phone).replace(/[^\d+]/g, "")) + '">' + esc(siteContact.phone) + '</a>');
    }
    if (siteContact.email) {
      out.push('<a href="mailto:' + encodeURIComponent(siteContact.email) + '">' + esc(siteContact.email) + '</a>');
    }
    if (siteContact.address) out.push('<span>' + esc(siteContact.address) + '</span>');
    if (siteContact.hours) out.push('<span>' + esc(siteContact.hours) + '</span>');
    if (!out.length) out.push('<span>Contact details available soon.</span>');
    return out.join("");
  }

  /* Rendered from the same SERVICES array as the nav dropdown, so the two can
   * never disagree about what services exist or where they lead. */
  function servicesSection() {
    return '<section class="sf-section sf-services" id="sf-services"><div class="sf-section-head sf-reveal"><div>' +
      '<p class="sf-eyebrow">WHAT WE DO</p><h2>Full-service property help, from one team.</h2></div>' +
      '<p>Buying, selling, renting and managing property in the Philippines. Start with the service you need &mdash; we will point you to the right next step.</p></div>' +
      '<div class="sf-services-grid">' + SERVICES.map(function (item, i) {
        return '<a class="sf-service-card sf-reveal sf-reveal-up" href="' + esc(item.href) + '">' +
          '<span class="sf-service-num">' + (i < 9 ? "0" : "") + (i + 1) + '</span>' +
          '<h3>' + esc(item.label) + '</h3><p>' + esc(item.note) + '</p>' +
          '<span class="sf-service-go" aria-hidden="true">&rarr;</span></a>';
      }).join("") + '</div></section>';
  }

  /* Obvious placeholder rows - a bare number like "321321", or "sample3" - are
     seed/test data, not inventory. One definition, used by every public view, so
     the homepage and the browse list cannot disagree about what exists.
     The data should be cleaned up in the admin; until then the public site
     refuses to show a card whose title is just a number. */
  function isPlaceholderListing(listing) {
    var t = String((listing && listing.title) || "").trim();
    if (!t) return true;
    if (/^\d+$/.test(t)) return true;
    if (/^sample\d*$/i.test(t)) return true;
    return false;
  }

  function publicListings(result) {
    return ((result && result.data) || []).filter(function (l) { return !isPlaceholderListing(l); });
  }

  /* The homepage already requested featured listings ("featured=true&per_page=6")
   * on every load, but home() never rendered them - the response was fetched
   * and thrown away, leaving a property site with no properties on its front
   * page. This renders that payload instead of adding another request. */
  function featuredSection() {
    var live = publicListings(viewState.result);
    if (!live.length && !viewState.loading) return "";

    var body = viewState.loading
      ? skeletons(3)
      : '<div class="sf-property-grid sf-featured-grid">' + live.slice(0, 6).map(card).join("") + '</div>';

    return '<section class="sf-section sf-featured" id="sf-featured"><div class="sf-section-head sf-reveal"><div>' +
      '<p class="sf-eyebrow">CURRENT LISTINGS</p><h2>Properties on the market now.</h2></div>' +
      '<p>Every listing is checked with the team before it appears here.</p></div>' + body +
      '<div class="sf-featured-more"><a class="sf-outline-btn" href="#/search">See all properties</a></div></section>';
  }

  function home() {
    return shell(
      '<section class="sf-est-hero" id="sf-intro">' +
      '<div class="sf-est-hero-copy sf-reveal">' +
      '<p class="sf-eyebrow">BATANGAS VALUE GUIDE</p>' +
      '<h1>What is your <em>property worth?</em></h1>' +
      '<p class="sf-est-hero-lede">An instant, free Batangas property value guide. See the selected BIR zonal reference separately from an ES Realty estimate calculated using disclosed location and property factors, with its range and source details.</p>' +
      '<div class="sf-est-proof"><span><b>BIR Zonal</b> reference schedules</span><span><b>ES Realty</b> factor-based estimate</span><span><b>Free &amp; instant</b> guide</span></div>' +
      '<p class="sf-est-hero-bir-note">ES Realty is independent of the BIR. BIR values are shown as tax-reference data.</p>' +
      '<div class="sf-hero-actions sf-est-hero-actions"><a class="sf-hero-btn" href="#sf-estimator" data-est-services>Get My Free Estimate →</a><a class="sf-hero-link" href="#/search">Browse Properties</a></div>' +
      '</div>' +
      (typeof window.ESREALTY_EST === "object" && window.ESREALTY_EST.cardSection ? window.ESREALTY_EST.cardSection() : '<section class="sf-section sf-est" id="sf-estimator" data-est-root><div class="sf-est-card" data-est-card><p class="sf-est-empty">Loading the value guide…</p></div></section>') +
      '</section>' +

      '<section class="sf-section sf-guide-summary"><div class="sf-section-head sf-reveal"><div><p class="sf-eyebrow">WHAT YOU RECEIVE</p><h2>A clearer answer before your next property step.</h2></div><p>Start with the official reference, then review the factor-based estimate, asking-price guide, data match, and next professional step.</p></div>' +
      '<div class="sf-guide-summary-grid"><article class="sf-guide-summary-card sf-reveal sf-reveal-up"><b>01</b><h3>Official BIR reference</h3><p>The published zonal rate for your selected Batangas location and classification.</p></article>' +
      '<article class="sf-guide-summary-card sf-reveal sf-reveal-up"><b>02</b><h3>Asking-price guidance</h3><p>A factor-based starting point with its range and calculation details shown. Available asking listings provide context; their prices do not directly set the estimate.</p></article>' +
      '<article class="sf-guide-summary-card sf-reveal sf-reveal-up"><b>03</b><h3>Professional next step</h3><p>Request ES Realty guidance or a licensed-appraiser consultation when you need a defensible opinion.</p></article></div></section>' +
      servicesSection() +
      featuredSection() +
      '<section class="sf-process sf-process-compact" id="sf-process"><div class="sf-section-head sf-reveal"><div><p class="sf-eyebrow">HOW IT WORKS</p><h2>Three simple steps to a <em>better decision.</em></h2></div><p>No account is needed to start the guide.</p></div><div class="sf-process-steps"><article class="sf-process-step sf-reveal sf-reveal-up"><b>01</b><h3>Choose the property</h3><p>Select the municipality, barangay, street, classification, and lot area.</p></article><article class="sf-process-step sf-reveal sf-reveal-up"><b>02</b><h3>Review the result</h3><p>See the BIR reference, factor-based estimate, recommended asking price, and data match.</p></article><article class="sf-process-step sf-reveal sf-reveal-up"><b>03</b><h3>Choose your next step</h3><p>Save the guide, browse properties, or request a professional valuation consultation.</p></article></div></section>' +

      '<section class="sf-cta" id="sf-contact"><div class="sf-cta-band"><div class="sf-reveal"><p class="sf-eyebrow">LOCAL BATANGAS GUIDANCE</p><h2>Ready for the <em>next check?</em></h2><p>Tell us whether you are buying, selling, valuing, or reviewing a property. We will help you identify the next practical step.</p><div class="sf-contact-details">' + contactDetails() + '</div></div>' +
      '<form class="sf-cta-form sf-reveal sf-reveal-right" data-sf-consult><label>Full name<input name="name" required maxlength="160" placeholder="Your name"></label><label>Email<input type="email" name="email" required maxlength="254" placeholder="you@email.com"></label><label>Phone<input name="phone" required maxlength="50" placeholder="Mobile number"></label><label>Message<textarea name="message" rows="2" maxlength="2000" placeholder="Tell us the property location and what you need..."></textarea></label><label class="sf-consent"><input type="checkbox" name="consent" required><span>I consent to ES Realty contacting me about this request. See our <a href="#/privacy">Privacy Notice</a>.</span></label><button type="submit">Talk to a specialist →</button><p class="sf-form-status" aria-live="polite"></p></form></div></section>'
    );
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

  /* ==================================================================
   * PARKED FOR RELAUNCH - shophousePage() and projectBtPage() below are
   * no longer routed to. Project B.T and the shophouse campaign are
   * temporarily closed and both resolve to comingSoonPage().
   *
   * The markup is kept, not deleted, so relaunching is a one-line change in
   * renderCurrent() plus restoring the nav entries in NAV/PROJECT_BT. Their
   * CSS (sf-marquee, sf-why-grid, sf-roi, sf-construction, bt-*) is still in
   * css/styles.css for the same reason - do not treat it as dead CSS yet.
   * ================================================================== */
  function shophousePage() {
    var listings = publicListings(viewState.result);
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

      '<section class="sf-roi"><div class="sf-reveal"><p class="sf-eyebrow">THE INVESTOR CASE</p><h2>A shophouse pays you <em>twice.</em></h2><p>Ground-floor trade covers operations while the residence above rents or appreciates. Most of our buyers target returns from both halves of the same building.</p>' +
      '<div class="sf-roi-stats"><div class="sf-roi-stat sf-reveal sf-reveal-up"><b>6–8%</b><span>Indicative gross rental yield on shophouse units</span></div><div class="sf-roi-stat sf-reveal sf-reveal-up"><b data-count="2">2</b><span>Income streams — retail ground floor and residence above</span></div><div class="sf-roi-stat sf-reveal sf-reveal-up"><b data-count="3" data-suffix="+">3+</b><span>Potential tenants a single unit can host over its life</span></div></div></div>' +
      '<div class="sf-guide sf-reveal sf-reveal-right"><h3>Download the Shophouse Investment Guide</h3><p>Financing paths, a location checklist, and unit economics — free for buyers who want the full picture before they view.</p>' +
      '<form data-sf-guide><label>Email<input type="email" name="email" required maxlength="254" placeholder="you@email.com"></label><label class="sf-consent"><input type="checkbox" name="consent" required><span>I consent to ES Realty contacting me by email about the guide and relevant listings. See our <a href="#/privacy">Privacy Notice</a>.</span></label><button type="submit">Send me the guide →</button><p class="sf-form-status" aria-live="polite"></p></form></div></section>' +

      '<section class="sf-process" id="sf-process"><div class="sf-section-head sf-reveal"><div><p class="sf-eyebrow">REAL ESTATE SERVICES</p><h2>Local guidance for every <em>property decision.</em></h2></div><p>Practical real estate support for buyers, sellers, landlords, investors, and developers across the Philippines.</p></div><div class="sf-process-steps">' +
      '<article class="sf-process-step sf-reveal sf-reveal-up"><b>01</b><h3>Property Sales &amp; Acquisition</h3><p>Buy or sell residential, commercial, land, condominium, townhouse, and shophouse properties with transaction guidance.</p></article>' +
      '<article class="sf-process-step sf-reveal sf-reveal-up"><b>02</b><h3>Leasing &amp; Tenant Placement</h3><p>Find suitable spaces, screen tenant requirements, and structure leasing conversations for homes and businesses.</p></article>' +
      '<article class="sf-process-step sf-reveal sf-reveal-up"><b>03</b><h3>Investment &amp; Feasibility</h3><p>Review purchase costs, financing, rental potential, development options, cash flow, and expected returns.</p></article>' +
      '<article class="sf-process-step sf-reveal sf-reveal-up"><b>04</b><h3>Property Appraisal &amp; Valuation</h3><p>Review the BIR reference, disclosed estimate factors, property improvements, and available local listing context; discuss a formal valuation assignment when needed.</p></article>' +
      '<article class="sf-process-step sf-reveal sf-reveal-up"><b>05</b><h3>Property Management</h3><p>Support owners with tenant coordination, rent tracking, maintenance, property records, and day-to-day oversight.</p></article>' +
      '<article class="sf-process-step sf-reveal sf-reveal-up"><b>06</b><h3>Due Diligence Coordination</h3><p>Organize checks for title, zoning, taxes, permits, documents, site condition, and other closing requirements.</p></article>' +
      '<article class="sf-process-step sf-reveal sf-reveal-up"><b>07</b><h3>Project Development Advisory</h3><p>Assess sites, highest and best use, product positioning, unit economics, and development planning.</p></article>' +
      '<article class="sf-process-step sf-reveal sf-reveal-up"><b>08</b><h3>Commercial &amp; Shophouse Advisory</h3><p>Match business concepts with visible locations, flexible layouts, tenant demand, and practical operating plans.</p></article>' +
      '</div></section>' +

      '<section class="sf-cta" id="sf-contact"><div class="sf-cta-band"><div class="sf-reveal"><p class="sf-eyebrow">' + esc(siteContact.eyebrow) + '</p><h2>' + esc(siteContact.title) + '</h2><p>' + esc(siteContact.description) + '</p><div class="sf-contact-details">' + contactDetails() + '</div></div>' +
      '<form class="sf-cta-form sf-reveal sf-reveal-right" data-sf-consult><label>Full name<input name="name" required maxlength="160" placeholder="Your name"></label><label>Email<input type="email" name="email" required maxlength="254" placeholder="you@email.com"></label><label>Phone<input name="phone" required maxlength="50" placeholder="Mobile number"></label><label>Message<textarea name="message" rows="2" maxlength="2000" placeholder="Province, budget, and business idea..."></textarea></label><label class="sf-consent"><input type="checkbox" name="consent" required><span>I consent to ES Realty contacting me about this request. See our <a href="#/privacy">Privacy Notice</a>.</span></label><button type="submit">Request a call →</button><p class="sf-form-status" aria-live="polite"></p></form></div></section>');
  }

  function btStars(score) {
    return '<span class="bt-stars" aria-label="' + score + ' out of 5 stars">' + "★".repeat(score) + '<i>' + "★".repeat(5 - score) + '</i></span>';
  }

  function projectBtPage() {
    var heroImage = "assets/listings/bt1.jpg";
    var conceptImage = "assets/listings/bt2.jpg";
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

      '<section class="bt-contact" id="bt-inquiry"><div class="bt-contact-mark">BT</div><div class="bt-contact-copy"><div class="bt-section-label">10 / START A CONVERSATION</div><h2>Build the next<br><em>Bahay Tindahan.</em></h2><p>Tell us which product direction fits your site, business, or investment plan. ES REALTY will help you explore the right next step.</p></div><form class="bt-inquiry-form" data-bt-inquiry-form><label>Full name<input name="name" required maxlength="160" placeholder="Your name"></label><label>Email<input type="email" name="email" required maxlength="254" placeholder="you@email.com"></label><label>Interest<select name="interest"><option>Project B.T overview</option><option>Testarossa — Essential</option><option>Carrera — Signature</option><option>Ultima — Prestige</option><option>Site / development partnership</option></select></label><label>Message<textarea name="message" rows="3" maxlength="2000" placeholder="Tell us about your location, business, or investment goal."></textarea></label><label class="sf-consent"><input type="checkbox" name="consent" required><span>I consent to ES Realty contacting me about Project B.T and related developments. See our <a href="#/privacy">Privacy Notice</a>.</span></label><button class="bt-button bt-button-light" type="submit">Send inquiry <span>↗</span></button><p class="bt-form-status" aria-live="polite"></p></form></section>' +
      '<section class="bt-thanks"><p>ES REALTY</p><h2>Thank you for imagining<br><em>what is possible.</em></h2><a href="#/home">Return to ES Realty <span>↗</span></a></section>');
  }

  /* Distinguishes the two very different empty cases. Telling someone "no
   * properties found, try changing your filters" when they never set a filter
   * and the inventory is simply empty is both wrong and unactionable. */
  function emptyResults(params) {
    var active = activeFilters(params);
    if (active.length) {
      var chips = active.map(function (f) { return filterSummary(f); }).join(", ");
      return '<div class="sf-empty"><div>ES</div><h3>No properties match these filters</h3>' +
        '<p>Nothing matches ' + esc(chips) + ' right now. Clear the filters to see everything we publish.</p>' +
        '<a class="sf-outline-btn" href="' + esc(clearLink(active.map(function (f) { return f.def.name; }))) + '">Clear all filters</a></div>';
    }
    return '<div class="sf-empty"><div>ES</div><h3>No properties published yet</h3>' +
      '<p>There are no live listings on the site at the moment. Get your property value in the meantime, or tell us what you are looking for and we will come back to you.</p>' +
      '<div class="sf-empty-actions"><a class="sf-primary-btn" href="#/property-value">Get my property value</a>' +
      '<a class="sf-outline-btn" href="#/search">Refresh</a></div></div>';
  }

  function searchPage(params) {
    var result = viewState.result || { data: [], total: 0, page: 1, total_pages: 0 };
    /* Same placeholder filter as the homepage, so the two never disagree. */
    var rows = publicListings(result);
    var total = rows.length === (result.data || []).length
      ? Number(result.total || 0)
      : rows.length;
    var cards = viewState.loading ? skeletons(6)
      : rows.length ? rows.map(card).join("")
      : emptyResults(params);
    var page = Number(result.page || 1), pages = Number(result.total_pages || 0);
    var pager = pages > 1 ? '<div class="sf-pager"><button data-sf-page="' + (page - 1) + '"' + (page <= 1 ? " disabled" : "") + '>Previous</button><span>Page ' + page + ' of ' + pages + '</span><button data-sf-page="' + (page + 1) + '"' + (page >= pages ? " disabled" : "") + '>Next</button></div>' : "";
     return shell('<section class="sf-search-page"><div class="sf-search-intro"><p class="sf-eyebrow">PROPERTY SEARCH</p><h1>Find a property that fits.</h1><p>Browse current property inventory across the Philippines.</p></div>' +
      '<div class="sf-filter-stick">' + searchFields(params, true) + '</div>' + activeFilterChips(params) +
      '<div class="sf-results-bar"><p><b>' + esc(total) + '</b> ' + (Number(total) === 1 ? "property" : "properties") + '</p>' +
      '<div><label class="sf-visually-hidden" for="sf-sort">Sort properties</label><select id="sf-sort" data-sf-sort><option value="date_desc"' + (params.get("sort") === "date_desc" || !params.get("sort") ? " selected" : "") + '>Newest</option><option value="price_asc"' + (params.get("sort") === "price_asc" ? " selected" : "") + '>Price: Low to high</option><option value="price_desc"' + (params.get("sort") === "price_desc" ? " selected" : "") + '>Price: High to low</option></select>' +
      '<button data-sf-mode="grid" aria-pressed="' + (viewState.mode === "grid") + '" class="' + (viewState.mode === "grid" ? "active" : "") + '">Grid</button><button data-sf-mode="list" aria-pressed="' + (viewState.mode === "list") + '" class="' + (viewState.mode === "list" ? "active" : "") + '">List</button><button data-sf-mode="map" aria-pressed="' + (viewState.mode === "map") + '" class="' + (viewState.mode === "map" ? "active" : "") + '">Map</button></div></div>' +
      (viewState.mode === "map"
        ? '<div class="sf-map-wrap"><div id="sf-map"></div><p class="sf-map-hint" id="sf-map-hint">Loading map…</p></div>'
        : '<div class="sf-property-grid ' + (viewState.mode === "list" ? "list" : "") + '">' + cards + '</div>') + pager + '</section>');
  }
  var sfMapRef = null;
  window.__sfGo = function (id) { go("listing/" + encodeURIComponent(id)); };
  function sfPriceShort(v) {
    var n = Number(v || 0);
    if (!n) return "";
    if (n >= 1000000) return "₱" + (n / 1000000).toFixed(n % 1000000 ? 2 : 0) + "M";
    if (n >= 1000) return "₱" + Math.round(n / 1000) + "K";
    return "₱" + n;
  }
  function sfInitMap() {
    window.__dbg = window.__dbg || {};
    window.__dbg.entered = true;
    var n = 0;
    (function findEl() {
      var el = document.getElementById("sf-map");
      if (!el) { if (++n > 50) { window.__dbg.elNever = true; return; } setTimeout(findEl, 100); return; }
      window.__dbg.elFound = true;
      window.ESREALTY_LEAFLET.ensure().then(function () {
        var m = 0;
        (function waitL() {
          if (!window.L) { if (++m > 30) { window.__dbg.lNever = true; return; } setTimeout(waitL, 150); return; }
          window.__dbg.built = true;
          sfBuildMap();
        })();
      });
    })();
  }
  function sfBuildMap() {
    {
      var el = document.getElementById("sf-map");
      if (!el || !window.L) return;
      var L = window.L;
      if (sfMapRef) { try { sfMapRef.remove(); } catch (e) {} sfMapRef = null; }
      sfMapRef = L.map(el, { scrollWheelZoom: true });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a> contributors" }).addTo(sfMapRef);
      var items = (viewState.result && viewState.result.data) || [];
      var pts = [];
      items.forEach(function (l) {
        var la = Number(l.latitude), ln = Number(l.longitude);
        if (!isFinite(la) || !isFinite(ln) || (!la && !ln)) return;
        pts.push([la, ln]);
        var pin = document.createElement("span");
        pin.className = "sf-price-pin";
        pin.textContent = sfPriceShort(l.offer_type === "rent" ? l.rent : l.price);
        var icon = L.divIcon({ className: "", html: pin, iconSize: null });
        var mk = L.marker([la, ln], { icon: icon }).addTo(sfMapRef);
        mk.bindPopup(sfPopupHtml(l));
      });
      var hint = document.getElementById("sf-map-hint");
      if (hint) { var missing = items.length - pts.length; hint.textContent = pts.length + " mapped on map" + (missing ? " · " + missing + " listing" + (missing === 1 ? "" : "s") + " without location yet" : ""); }
      if (pts.length) sfMapRef.fitBounds(pts, { padding: [30, 30] }); else sfMapRef.setView([12.8797, 121.774], 5);
    }
  }
  function sfPopupHtml(l) {
    var price = sfPriceShort(l.offer_type === "rent" ? l.rent : l.price);
    return '<div style="min-width:180px"><b>' + esc(l.title || "Property") + '</b><br>' + esc(price)
      + (l.city ? ' · ' + esc(l.city) : '')
      + '<br><a class="btn btn-primary btn-sm" style="margin-top:6px;display:inline-block" href="#/listing/' + encodeURIComponent(l.id) + '">View details</a></div>';
  }
  function detailPage(listing) {
    if (viewState.loading) return shell('<section class="sf-detail"><div class="sf-detail-loading">Loading property…</div></section>');
    if (!listing) return shell('<section class="sf-detail">' + empty(viewState.error || "This listing is unavailable.") + '</section>');
    var images = Array.isArray(listing.images) ? listing.images.map(function (item) { return safeImage(item.url || item); }).filter(Boolean) : [];
    var gallery = detailGallery(listing, images);
    try { var ldEl = document.getElementById("sf-jsonld"); if (ldEl) ldEl.remove();
      var ld = document.createElement("script"); ld.type = "application/ld+json"; ld.id = "sf-jsonld";
      ld.textContent = JSON.stringify({ "@context": "https://schema.org", "@type": "RealEstateListing", name: listing.title, description: (listing.description || "").slice(0, 300), image: images.filter(function (x) { return /^https:/.test(x); }).slice(0, 5), address: { "@type": "PostalAddress", addressLocality: listing.city, addressRegion: listing.province, addressCountry: "PH" }, offers: { "@type": "Offer", priceCurrency: "PHP", price: Number(listing.price || 0), availability: "https://schema.org/InStock" } });
      document.head.appendChild(ld);
    } catch (ldErr) {}
    return shell('<section class="sf-detail"><button class="sf-back" data-sf-back>← Back to properties</button>' + gallery +
      '<div class="sf-detail-layout"><article class="sf-detail-copy"><p class="sf-eyebrow">' + esc(typeLabel(listing.property_type)) + ' · ' + esc(listing.offer_type === "rent" ? "FOR RENT" : "FOR SALE") + '</p>' +
      '<h1>' + esc(listing.title) + '</h1><p class="sf-detail-location">' + esc(locationText(listing)) + '</p><div class="sf-key-stats"><span><b>' + esc(listing.bedrooms || 0) + '</b> Bedrooms</span><span><b>' + esc(listing.bathrooms || 0) + '</b> Bathrooms</span><span><b>' + esc(listing.floor_area_sqm || 0) + '</b> Floor sqm</span><span><b>' + esc(listing.lot_size_sqm || 0) + '</b> Lot sqm</span></div>' +
      '<section><h2>About this property</h2><p class="sf-description">' + esc(listing.description || "Contact the listing agent for complete property information.") + '</p></section>' +
      (listing.details && listing.details.license_to_sell ? '<section class="sf-dhsud"><span class="sf-badge">' + esc(listing.details.license_to_sell) + '</span> DHSUD License to Sell number for this property.</section>' : '') +
      '<section><h2>Location</h2><div class="sf-detail-map" id="sf-detail-map"><span>' + esc(locationText(listing)) + '</span></div></section></article>' +
      '<aside class="sf-contact-card"><p>Listed at</p><h2>' + esc(money(listing.display_price, listing.offer_type === "rent" ? "/mo" : "")) + '</h2>' +
      '<button class="sf-outline-btn" data-sf-save="' + esc(listing.id) + '">♡ Save this property</button><form data-sf-inquiry="' + esc(listing.id) + '"><h3>Request more information</h3><label>Full name<input name="full_name" required maxlength="160"></label><label>Email<input type="email" name="email" maxlength="254"></label><label>Phone<input name="phone" required maxlength="50"></label><label>Message<textarea name="message" rows="4" maxlength="5000" placeholder="I would like to know more about this property."></textarea></label><label class="sf-consent"><input type="checkbox" name="consent" required><span>I consent to the processing of my contact details for this inquiry. See our <a href="#/privacy">Privacy Notice</a>.</span></label><button type="submit">Send inquiry</button><p class="sf-form-status" aria-live="polite"></p></form></aside></div></section>');
  }

  /* document.title was never set anywhere, so every route shipped the same
   * title and search engines could not tell the pages apart. */
  var PAGE_TITLES = {
    "": "ES Realty | Free Batangas property value guide",
    "home": "ES Realty | Free Batangas property value guide",
    "search": "Properties for sale and rent in Batangas | ES Realty",
    "property-value": "Get My Property Value | ES Realty",
    "privacy": "Privacy Notice | ES Realty",
    "project-bt": "Project B.T by ES Realty",
    "listing": "Property details | ES Realty"
  };

  /* Services have no pages of their own yet. They resolve to the homepage
   * services section so the nav never exposes a dead link. */
  function scrollToSection(name) {
    if (!name) return false;
    var target = document.getElementById("sf-" + name) || document.getElementById(name);
    if (!target) return false;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    return true;
  }

  /* A single scrollIntoView is not enough for a deep link into the homepage.
   * The value guide card expands asynchronously and the featured grid fills in
   * after the first paint, both of which push the target further down the page.
   * Scrolling once landed ~1000px short. Re-run until the target is actually in
   * view, or we run out of attempts. */
  function scrollToSectionWhenSettled(name, attemptsLeft) {
    if (!name) return;
    var target = document.getElementById("sf-" + name) || document.getElementById(name);
    if (!target) return;
    target.scrollIntoView({ behavior: "auto", block: "start" });
    var box = target.getBoundingClientRect();
    var inView = box.top >= -8 && box.top < window.innerHeight;
    if (inView || attemptsLeft <= 0) return;
    setTimeout(function () { scrollToSectionWhenSettled(name, attemptsLeft - 1); }, 180);
  }

  function setTitle(path) {
    try {
      var key = path.indexOf("listing/") === 0 ? "listing" : path;
      var next = PAGE_TITLES[key] || PAGE_TITLES.home;
      if (document.title !== next) document.title = next;
    } catch (e) { /* noop */ }
  }

  function renderCurrent() {
    if (!active || !host) return;
    var current = route();
    /* Shophouse and Project B.T are temporarily closed and are presented as a
     * single destination. Keep #/shophouse resolvable so existing inbound links
     * and bookmarks land on the coming-soon page instead of a 404 or a stale
     * page, but never render the shophouse marketing content again. */
    if (current.path === "shophouse") { go("project-bt"); return; }
    if (current.path === "privacy") host.innerHTML = privacyPage();
    else if (current.path === "project-bt") host.innerHTML = comingSoonPage();
    else if (current.path === "property-value") host.innerHTML = propertyValuePage(current.params);
    else if (current.path.indexOf("listing/") === 0) host.innerHTML = detailPage(viewState.result && viewState.result.data);
    else if (current.path === "search") host.innerHTML = searchPage(current.params);
    else host.innerHTML = home();
    setTitle(current.path);
    /* Listing schema belongs to the detail page only. It used to be injected on
     * every detail view and only removed by the NEXT detail view, so leaving a
     * property page for home/search/shophouse left the previous listing's
     * RealEstateListing JSON-LD sitting in <head>. */
    if (current.path.indexOf("listing/") !== 0) {
      var ld = document.getElementById("sf-jsonld");
      if (ld) ld.remove();
    }
    mountMap();
    try { if (typeof window.ESREALTY_EST === "object" && window.ESREALTY_EST.mount) window.ESREALTY_EST.mount(); } catch (e) {}
    if (current.path === "search" && viewState.mode === "map") setTimeout(sfInitMap, 60);
    bindHomeMotion();
    bindBtMotion();
    if (current.path === "home" || current.path === "") {
      bindConstruction();
      /* #/home?section=services needs a second pass: the target does not exist
       * until home() has been written into the host above. */
      var section = current.params.get("section");
      if (section) {
        var target = section === "services" ? "services" : section;
        setTimeout(function () {
          if (!scrollToSection(target)) scrollToSection("process");
        }, 90);
        setTimeout(function () { scrollToSectionWhenSettled(target, 12); }, 140);
      }
    }
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
    /* Static marketing routes. They must not issue a listings request, or the
     * loading skeleton would flash on a page that has nothing to load. */
    if (current.path === "project-bt" || current.path === "property-value" || current.path === "privacy") {
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

  var _detailMap = null;

  function destroyDetailMap() {
    if (!_detailMap) return;
    try { _detailMap.remove(); } catch (e) {}
    _detailMap = null;
  }

  function mountMap() {
    destroyDetailMap();
    var listing = viewState.result && viewState.result.data;
    var element = document.getElementById("sf-detail-map");
    if (!element || !listing || listing.latitude == null || listing.longitude == null) return;
    if (!window.L) { window.ESREALTY_LEAFLET.ensure().then(function () { mountMap(); }); return; }
    element.innerHTML = "";
    var map = L.map(element, { scrollWheelZoom: false }).setView([Number(listing.latitude), Number(listing.longitude)], 15);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a> contributors" }).addTo(map);
    L.marker([Number(listing.latitude), Number(listing.longitude)], { icon: L.divIcon({ className: "es-pin-icon", html: '<svg width="38" height="48" viewBox="0 0 38 48" aria-hidden="true" focusable="false"><path d="M19 1.5C10.9 1.5 4.3 8.1 4.3 16.2 4.3 27 19 46.5 19 46.5s14.7-19.5 14.7-30.3C33.7 8.1 27.1 1.5 19 1.5z" fill="var(--accent, #F97316)"/><path d="M19 5C12.7 5 7.6 10.1 7.6 16.4c0 8.8 11.4 25.8 11.4 25.8s11.4-17 11.4-25.8C30.4 10.1 25.3 5 19 5z" fill="rgba(255,255,255,0.28)"/><circle cx="19" cy="16.5" r="7.2" fill="#fff"/><circle cx="19" cy="16.5" r="3.8" fill="var(--accent, #F97316)"/></svg>', iconSize: [38, 48], iconAnchor: [19, 47], popupAnchor: [0, -42] })}).addTo(map);
    _detailMap = map;
  }

  function closeDrops(except) {
    Array.prototype.forEach.call(document.querySelectorAll("[data-sf-drop]"), function (drop) {
      if (drop !== except && drop.open) drop.open = false;
    });
  }

  /* Opening the mobile panel previously did nothing beyond toggling a class: the
   * page behind stayed scrollable, any accordion the user had expanded stayed
   * expanded on reopen, and the sticky CTA bar sat on top of the bottom rows.
   * All three are handled here so the panel behaves like an overlay. */
  function toggleMenu(open) {
    var btn = document.querySelector("[data-sf-menu]");
    var panel = document.querySelector("[data-sf-menu-panel]");
    if (!btn || !panel) return;
    var isOpen = typeof open === "boolean" ? open : btn.getAttribute("aria-expanded") !== "true";
    btn.setAttribute("aria-expanded", isOpen ? "true" : "false");
    btn.setAttribute("aria-label", isOpen ? "Close menu" : "Open menu");
    panel.classList.toggle("open", isOpen);
    document.body.classList.toggle("sf-menu-open", isOpen);
    if (!isOpen) {
      /* Collapse accordions so the panel always reopens in a known state. */
      Array.prototype.forEach.call(panel.querySelectorAll("details[data-sf-drop]"), function (d) { d.open = false; });
    }
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
    window.addEventListener("hashchange", function () { if (active) { toggleMenu(false); closeDrops(null); loadCurrent(); } });
    /* Dropdown hygiene: only one panel open at a time, close on outside click,
     * and close on Escape. <details> gives us keyboard opening for free but no
     * dismissal behaviour, so that part is ours.
     *
     * Clicks on links inside a panel are ignored here on purpose - they must
     * keep navigating normally, and the main handler below closes the panel. */
    document.addEventListener("click", function (event) {
      if (event.target.closest("[data-sf-drop] a, [data-sf-drop] button")) return;
      var drop = event.target.closest("[data-sf-drop]");
      if (drop) {
        closeDrops(drop);
        /* <details> flips on the default action, which runs after dispatch, so
         * drop.open still holds the pre-click value here. If it was open, cancel
         * the default flip and close it. */
        if (drop.open) { event.preventDefault(); drop.open = false; }
        return;
      }
      closeDrops(null);
    });
    document.addEventListener("keydown", function (event) {
      if (event.key !== "Escape") return;
      closeDrops(null);
      toggleMenu(false);
    });
    document.addEventListener("click", function (event) {
      if (!active) return;
      var menuState = document.querySelector("[data-sf-menu]");
      if (menuState && menuState.getAttribute("aria-expanded") === "true" && !event.target.closest("[data-sf-menu]") && !event.target.closest("[data-sf-menu-panel]")) toggleMenu(false);
      var menuBtn = event.target.closest("[data-sf-menu]");
      if (menuBtn) { toggleMenu(); return; }
      /* Close the panel on navigation, not on every click inside it. This used
       * to fire on any click within the panel, which meant tapping a Services
       * accordion header both expanded it and immediately closed the menu
       * containing it - the two services were unreachable on a phone. Only a
       * real destination (a link) or an action (a button) should dismiss it; a
       * <summary> is a disclosure control and must leave the panel open. */
      if (event.target.closest("[data-sf-menu-panel] a, [data-sf-menu-panel] button")) toggleMenu(false);
      /* Only one dropdown open at a time, and collapse any open dropdown when a
       * destination is chosen so the panel does not linger over the new page. */
      if (event.target.closest("[data-sf-drop] a")) closeDrops(null);
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
        if (!(API && API.contact)) {
          if (btStatus) { btStatus.textContent = "The contact service is unavailable right now. Please try again in a moment."; btStatus.className = "bt-form-status error"; }
          return;
        }
        btButton.disabled = true;
        if (btStatus) { btStatus.textContent = "Sending…"; btStatus.className = "bt-form-status"; }
        API.contact({
          inquiry_type: "project-bt",
          full_name: btData.get("name"),
          email: btData.get("email"),
          phone: "",
          message: btData.get("message"),
          interest: btData.get("interest"),
          consent: btData.get("consent") === "on"
        }).then(function () {
          btForm.reset();
          if (btStatus) { btStatus.textContent = "Thanks — your Project B.T inquiry has been received. The ES REALTY team will follow up."; btStatus.className = "bt-form-status success"; }
        }).catch(function (error) {
          if (btStatus) { btStatus.textContent = error.message || "Could not send. Please try again."; btStatus.className = "bt-form-status error"; }
        }).finally(function () { btButton.disabled = false; });
        return;
      }
      var guide = event.target.closest("[data-sf-guide]");
      if (guide) {
        event.preventDefault();
        var guideStatus = guide.querySelector(".sf-form-status");
        var guideButton = guide.querySelector("button[type=submit]");
        var guideData = new FormData(guide);
        if (!(API && API.contact)) {
          if (guideStatus) { guideStatus.textContent = "The guide service is unavailable right now. Please try again in a moment."; guideStatus.className = "sf-form-status error"; }
          return;
        }
        guideButton.disabled = true;
        if (guideStatus) { guideStatus.textContent = "Sending…"; guideStatus.className = "sf-form-status"; }
        API.contact({ inquiry_type: "guide", email: guideData.get("email"), consent: guideData.get("consent") === "on" }).then(function (res) {
          guide.reset();
          var delivered = res && res.data && res.data.delivered;
          if (guideStatus) {
            if (delivered) { guideStatus.textContent = "Thanks — check your inbox for the Shophouse Investment Guide."; guideStatus.className = "sf-form-status success"; }
            else { guideStatus.textContent = "Thanks — your request has been received. A specialist will send the guide shortly."; guideStatus.className = "sf-form-status success"; }
          }
        }).catch(function (error) {
          if (guideStatus) { guideStatus.textContent = error.message || "Could not send. Please try again."; guideStatus.className = "sf-form-status error"; }
        }).finally(function () { guideButton.disabled = false; });
        return;
      }
      /* Project B.T launch notification. Separate inquiry_type from "guide" so
       * the team can tell launch subscribers apart from guide downloads. */
      var notify = event.target.closest("[data-sf-notify]");
      if (notify) {
        event.preventDefault();
        var notifyStatus = notify.querySelector(".sf-form-status");
        var notifyButton = notify.querySelector("button[type=submit]");
        var notifyData = new FormData(notify);
        if (!(API && API.contact)) {
          if (notifyStatus) { notifyStatus.textContent = "The contact service is unavailable right now. Please try again in a moment."; notifyStatus.className = "sf-form-status error"; }
          return;
        }
        notifyButton.disabled = true;
        if (notifyStatus) { notifyStatus.textContent = "Sending…"; notifyStatus.className = "sf-form-status"; }
        API.contact({
          inquiry_type: "project-bt-notify",
          email: notifyData.get("email"),
          consent: notifyData.get("consent") === "on"
        }).then(function () {
          notify.reset();
          if (notifyStatus) { notifyStatus.textContent = "Thank you. We will contact you when Project B.T opens."; notifyStatus.className = "sf-form-status success"; }
        }).catch(function (error) {
          if (notifyStatus) { notifyStatus.textContent = error.message || "Could not send. Please try again."; notifyStatus.className = "sf-form-status error"; }
        }).finally(function () { notifyButton.disabled = false; });
        return;
      }
      var consult = event.target.closest("[data-sf-consult]");
      if (consult) {
        event.preventDefault();
        var consultStatus = consult.querySelector(".sf-form-status");
        var consultButton = consult.querySelector("button[type=submit]");
        var consultData = new FormData(consult);
        if (!(API && API.contact)) {
          if (consultStatus) { consultStatus.textContent = "The contact service is unavailable right now. Please try again in a moment."; consultStatus.className = "sf-form-status error"; }
          return;
        }
        consultButton.disabled = true;
        if (consultStatus) { consultStatus.textContent = "Sending…"; consultStatus.className = "sf-form-status"; }
        API.contact({
          inquiry_type: "consult",
          full_name: consultData.get("name"),
          email: consultData.get("email"),
          phone: consultData.get("phone"),
          message: consultData.get("message"),
          consent: consultData.get("consent") === "on"
        }).then(function () {
          consult.reset();
          if (consultStatus) { consultStatus.textContent = "Thanks — a member of our team will reach out within one business day."; consultStatus.className = "sf-form-status success"; }
        }).catch(function (error) {
          if (consultStatus) { consultStatus.textContent = error.message || "Could not send. Please try again."; consultStatus.className = "sf-form-status error"; }
        }).finally(function () { consultButton.disabled = false; });
      }
    });
  }

  window.ESREALTY_STOREFRONT = {
    mount: function (options) {
      host = options.host; openAuth = options.openAuth || openAuth; active = true;
      document.body.classList.add("storefront-active", "sf-has-sticky");
      bind(); loadSiteContact(); loadCurrent();
    },
    unmount: function () {
      active = false; destroyDetailMap(); cacheKey = "";
      document.body.classList.remove("storefront-active", "sf-has-sticky");
    },
    refresh: function () { cacheKey = ""; loadCurrent(true); }
  };
})();
