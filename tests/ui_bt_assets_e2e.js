"use strict";
/* Project B.T image assets.
 *
 * These two assertions used to live in ui_bt_hero_e2e.js and
 * ui_bt_mission_e2e.js, which rendered the live #/project-bt page and checked
 * its hero and mission photography. Project B.T is temporarily closed, so those
 * pages are parked and the render-based tests could no longer run.
 *
 * The valuable invariant is not "the page renders" - it is that the Project B.T
 * photography is local, is actually on disk, and carries alt text, so a relaunch
 * cannot ship a broken image, a hotlinked remote asset, or an unlabelled one.
 * All of that is checkable while the page is parked.
 */
window.__msChecks = [];
window.__msDone = false;
function chk(n, ok, d) { window.__msChecks.push({ name: n, ok: !!ok, detail: d || "" }); }

(async () => {
  try {
    const src = await fetch("js/storefront.js").then(r => r.text()).catch(() => "");

    chk("bt-source-available", src.length > 0, "could not read js/storefront.js");

    /* ---- local photography, referenced by the parked render function ---- */
    const refs = Array.from(new Set((src.match(/assets\/listings\/bt\d\.jpg/g) || [])));
    chk("bt-references-local-assets", refs.length >= 2, "refs=" + JSON.stringify(refs));

    /* ---- the assets are really on disk and are not placeholder stubs ---- */
    /* The dev server does not send Content-Length, so measure the decoded body
       instead of trusting the header. */
    for (const ref of refs) {
      const res = await fetch(ref, { method: "GET" }).catch(() => null);
      chk("bt-asset-exists-" + ref.replace(/\W/g, ""), !!res && res.ok, "status=" + (res && res.status));
      if (res && res.ok) {
        const blob = await res.blob();
        chk("bt-asset-not-empty-" + ref.replace(/\W/g, ""), blob.size > 5000, "bytes=" + blob.size);
        chk("bt-asset-is-jpeg-" + ref.replace(/\W/g, ""), /image\/jpe?g/i.test(blob.type), "type=" + blob.type);
      }
    }

    /* ---- the parked render function points those variables at local files ---- */
    const heroVar = (src.match(/var\s+heroImage\s*=\s*"([^"]+)"/) || [])[1] || "";
    const conceptVar = (src.match(/var\s+conceptImage\s*=\s*"([^"]+)"/) || [])[1] || "";
    chk("bt-hero-var-is-local", /^assets\/listings\/bt1\.jpg$/.test(heroVar), "heroImage=" + heroVar);
    chk("bt-concept-var-is-local", /^assets\/listings\/bt2\.jpg$/.test(conceptVar), "conceptImage=" + conceptVar);

    /* ---- no hotlinked remote photography ----
       OpenStreetMap tile URLs are a legitimate remote image and are excluded;
       this check is about Project B.T photography specifically. */
    const remoteImgs = Array.from(new Set(
      (src.match(/https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp)/gi) || [])
        .filter(u => !/tile\.openstreetmap\.org/.test(u))
    ));
    chk("bt-no-remote-images", remoteImgs.length === 0, JSON.stringify(remoteImgs));
    chk("bt-no-unsplash", !/unsplash/i.test(src), "storefront.js still references unsplash");

    /* ---- alt text is present on every storefront <img> ----
       The tags interpolate a variable rather than a literal filename, so the
       check is on the tag itself, not on which file it happens to point at.

       alt="" is allowed in exactly one case: a decorative image inside a control
       that already carries an accessible name (a thumbnail inside a button with
       aria-label). Screen readers announce the control, not the image. Asserting
       non-empty alt everywhere would have flagged that correct pattern. */
    const imgTags = src.match(/<img\b[^>]*>/g) || [];
    chk("bt-img-tags-found", imgTags.length >= 2, "count=" + imgTags.length);
    imgTags.forEach((tag, i) => {
      const hasAlt = /\balt="[^"]{4,}"/.test(tag);
      if (hasAlt) { chk("bt-img-alt-present-" + i, true, ""); return; }
      // Empty alt: confirm the enclosing control supplies the name.
      const at = src.indexOf(tag);
      const before = src.slice(Math.max(0, at - 260), at);
      const labelled = /<button[^>]*aria-label="[^"]{3,}"[^>]*>\s*$/.test(before) || /<a[^>]*aria-label="[^"]{3,}"[^>]*>\s*$/.test(before);
      chk("bt-img-alt-or-decorative-" + i, /alt=""/.test(tag) && labelled, "empty alt with no accessible name on the enclosing control: " + tag.slice(0, 90));
    });
    /* Hero photography must not be lazy-loaded or it will flash in. The hero
       <img> is the one that interpolates heroImage. */
    const heroTag = imgTags.find(t => /heroImage/.test(t)) || "";
    chk("bt-hero-eager", heroTag ? !/loading="lazy"/.test(heroTag) : false, "hero should not be lazy-loaded: " + heroTag.slice(0, 100));

    /* ---- the coming-soon page must not leak that photography ---- */
    location.hash = "#/project-bt";
    await new Promise(r => setTimeout(r, 1800));
    chk("bt-assets-not-visible-while-closed", document.querySelectorAll("img[src*='bt1'], img[src*='bt2']").length === 0,
      "leaked=" + document.querySelectorAll("img[src*='bt1'], img[src*='bt2']").length);
    chk("bt-closed-page-has-no-hero-media", !document.querySelector(".bt-hero-media"), "parked hero markup is rendering");
  } catch (e) {
    window.__msChecks.push({ name: "runner", ok: false, detail: (e && e.message || e) });
  }
  window.__msOk = window.__msChecks.every(c => c.ok);
  window.__msDone = true;
})();
