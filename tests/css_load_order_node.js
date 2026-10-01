"use strict";
/* Guards the stylesheet load order, which is LOAD BEARING.
 *
 * css/storefront-legacy.css holds the storefront base rules and
 * css/styles.css holds the responsive override layer. styles.css must be
 * loaded SECOND, after the extracted base rules.
 *
 * This is not cosmetic. When the extracted storefront rules were loaded second,
 * this pair inverted:
 *
 *   storefront-legacy.css  .sf-cta-band { grid-template-columns: 1.1fr .9fr }
 *   styles.css @media      .sf-cta-band { grid-template-columns: 1fr }
 *
 * The media query still applied at 390px, but it appeared EARLIER in the
 * cascade, so the two-column base rule won and every child of the contact form
 * overflowed the viewport by 94px. The desktop suite passed throughout - only
 * the mobile audit caught it.
 *
 * This is inherent to splitting a cascade-dependent stylesheet: relative order
 * between the two files changes. Loading the extracted file first keeps every
 * responsive override after the base rule it overrides, which is what the
 * original single-file order did.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

const order = [];
const re = /<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g;
let m;
while ((m = re.exec(html)) !== null) order.push(m[1]);

const checks = [];
function chk(name, ok, detail) { checks.push({ name, ok: !!ok, detail: detail || "" }); }

const iLegacy = order.indexOf("css/storefront-legacy.css");
const iStyles = order.indexOf("css/styles.css");
const iEstimator = order.indexOf("css/estimator.css");
const iStorefront = order.indexOf("css/storefront.css");

chk("stylesheet-order-found", iLegacy > -1 && iStyles > -1,
  "legacy index=" + iLegacy + " styles index=" + iStyles);
chk("storefront-legacy-before-styles", iLegacy > -1 && iStyles > -1 && iLegacy < iStyles,
  "order=" + order.join(" > "));
chk("styles-before-estimator", iStyles > -1 && iEstimator > -1 && iStyles < iEstimator, "order=" + order.join(" > "));
chk("estimator-before-storefront", iEstimator > -1 && iStorefront > -1 && iEstimator < iStorefront,
  "order=" + order.join(" > "));
chk("storefront-css-is-last", iStorefront === order.length - 1, "order=" + order.join(" > "));

/* The extracted file must still carry the base rule the override layer expects,
   and the override must still live in styles.css. If either moves, the pairing
   above has to be re-checked. */
const legacy = fs.readFileSync(path.join(ROOT, "css", "storefront-legacy.css"), "utf8");
const styles = fs.readFileSync(path.join(ROOT, "css", "styles.css"), "utf8");
chk("base-rule-in-legacy", /\.sf-cta-band\s*\{[^}]*grid-template-columns:\s*1\.1fr/.test(legacy),
  "grid-template-columns:1.1fr .9fr present=" + /\.sf-cta-band\s*\{[^}]*grid-template-columns:\s*1\.1fr/.test(legacy));
chk("override-rule-in-styles", /\.sf-cta-band\s*\{[^}]*grid-template-columns:\s*1fr/.test(styles),
  "grid-template-columns:1fr present=" + /\.sf-cta-band\s*\{[^}]*grid-template-columns:\s*1fr/.test(styles));

/* styles.css must document what moved out of it, or the next person will
   re-add storefront CSS to the wrong file. */
const stylesHead = styles.split("\n").slice(0, 40).join("\n");
chk("styles-css-documents-the-split", /\.sf-eyebrow/.test(stylesHead) && /storefront/i.test(stylesHead),
  "header mentions .sf-eyebrow=" + /\.sf-eyebrow/.test(stylesHead) + " storefront=" + /storefront/i.test(stylesHead));
chk("legacy-header-marks-it-legacy", /LEGACY STOREFRONT STYLESHEET/.test(legacy.slice(0, 2000)),
  "banner present=" + /LEGACY STOREFRONT STYLESHEET/.test(legacy.slice(0, 2000)));

/* The public mobile navigation must live in css/storefront.css, not here.
 *
 * It used to sit in this file inside an @media (max-width:1050px) block, because
 * the classifier treated "open" (a generic state class the admin also uses) as
 * evidence that the admin depended on the block. It does not: app.js never
 * renders .sf-menu. So the whole mobile nav - hamburger button, bar animation,
 * X state and panel - was stranded in the admin stylesheet, and the public site
 * silently depended on the admin CSS. At 901-1050px the hamburger was visible
 * while the panel could never open, so tablet users could not navigate at all.
 *
 * These assertions fail if the mobile nav creeps back here. */
const MOBILE_NAV_SELECTORS = [
  ".sf-menu-btn", ".sf-menu.open", ".sf-menu a", ".sf-menu button",
  ".sf-menu-group", ".sf-header-actions", ".sf-header .sf-menu-btn"
];
MOBILE_NAV_SELECTORS.forEach(sel => {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  chk("mobile-nav-not-in-admin-css-" + sel.replace(/\W+/g, "-"),
    !new RegExp("^\\s*" + esc + "\\s*(,|\\{)", "m").test(styles),
    sel + " is defined in css/styles.css - the public mobile nav must live in storefront.css");
});
const legacySheet = fs.readFileSync(path.join(ROOT, "css", "storefront-legacy.css"), "utf8");
const sfDesign = fs.readFileSync(path.join(ROOT, "css", "storefront.css"), "utf8");
chk("mobile-nav-present-in-a-storefront-sheet",
  /^\s*\.sf-menu-btn\s*\{/m.test(sfDesign) || /^\s*\.sf-menu-btn\s*\{/m.test(legacySheet),
  "no .sf-menu-btn rule in storefront.css or storefront-legacy.css - the mobile nav went missing");

/* The admin no longer borrows storefront classes.
 *
 * The "My Property Space" dashboard used to render .sf-eyebrow and .sf-empty and
 * patch them with .listing-dashboard-hero / .account-listing-section overrides.
 * That meant the back-office's appearance depended on public marketing CSS, and
 * those storefront rules could not be moved out of styles.css. The dashboard now
 * uses .ls-eyebrow / .ls-empty, which the app owns.
 *
 * This asserts the decoupling STICKS. If someone reverts app.js to the
 * storefront classes, or deletes the .ls-* rules, it fails here. */
const appJs = fs.readFileSync(path.join(ROOT, "js", "app.js"), "utf8");
["sf-eyebrow", "sf-empty"].forEach(c => {
  chk("admin-does-not-borrow-" + c, appJs.indexOf('"' + c) === -1 && appJs.indexOf(" " + c) === -1,
    "js/app.js still references the storefront class ." + c);
});
["ls-eyebrow", "ls-empty"].forEach(c => {
  chk("admin-owns-" + c, new RegExp("\\." + c + "\\s*\\{").test(styles),
    "." + c + " is not defined in css/styles.css");
  chk("admin-uses-" + c, new RegExp('class="[^"]*\\b' + c + '\\b').test(appJs),
    "js/app.js does not render ." + c);
});

const failed = checks.filter(c => !c.ok);
for (const c of checks) {
  const line = (c.ok ? "[PASS] " : "[FAIL] ") + c.name + (c.detail ? " — " + c.detail : "") + "\n";
  if (c.ok) process.stdout.write(line); else process.stderr.write(line);
}
process.stdout.write(failed.length ? "\n" + failed.length + " FAILED\n" : "ALL GREEN (" + checks.length + " checks)\n");
process.exit(failed.length ? 1 : 0);
