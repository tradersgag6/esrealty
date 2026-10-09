(async function () {
  var checks = [];
  var wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  var check = (name, ok, detail) => checks.push({ name: name, ok: !!ok, detail: detail || "" });
  window.__msChecks = checks;
  window.__msDone = false;
  setTimeout(function () { window.__msDone = true; }, 40000);
  try {
    location.hash = "#/privacy";
    await wait(650);
    var privacy = document.querySelector(".sf-privacy-page");
    var privacyText = privacy ? privacy.textContent : "";
    check("privacy route renders", !!privacy && /Privacy notice/i.test(privacyText), privacyText.slice(0, 70));
    check("privacy notice explains property-guide inputs", /BIR classification/.test(privacyText) && /property type/.test(privacyText), "guide inputs");
    check("privacy notice explains CRM/report handling", /Supabase/.test(privacyText) && /Resend/.test(privacyText), "CRM and delivery providers");
    check("privacy requests have a contact path", !!privacy && !!privacy.querySelector('a[href="#/home?section=contact"]'), "contact form link");
    check("footer links to privacy notice", !!document.querySelector('.sf-footer a[href="#/privacy"]'), "footer link");

    location.hash = "#/home";
    await wait(500);
    check("homepage inquiry consent links privacy notice", !!document.querySelector('#sf-contact [data-sf-consult] a[href="#/privacy"]'), "consult consent link");
    check("homepage states BIR independence", /independent of the BIR/i.test(document.body.textContent), "BIR notice");

    location.hash = "#/property-value";
    await wait(500);
    check("appraisal consultation consent links privacy notice", !!document.querySelector('.sf-pv-form a[href="#/privacy"]'), "property-value consent link");
    check("consultation CTA avoids promising a free formal appraisal", !/Request my free appraisal/i.test(document.body.textContent) && /Talk to our team|Request an appraisal consultation/.test(document.body.textContent), "consultation wording");
  } catch (error) {
    checks.push({ name: "privacy runner", ok: false, detail: String(error && error.message || error) });
  }
  window.__msOk = checks.every(c => c.ok) && checks.length > 0;
  window.__msDone = true;
})();
