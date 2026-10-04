# Batch 1 — SEA Estates visual direction

**Status:** proposal complete; awaiting owner approval. Recommended model for this batch: **GPT-6 Astra / high**. Next batch after direction approval: **GPT-6.1 Sol / medium**.

## Open and compare

With the existing development server running on port 8931:

**http://127.0.0.1:8931/docs/sea-estates-design/index.html**

You can also open `index.html` in this directory directly in a browser. It uses relative local assets and no external fonts or APIs. The review bar is for comparing concepts; it will not appear on the production site.

Use **Compare directions** at the top to try all three palettes on the same screens:

| Direction | Character | Trade-off |
| --- | --- | --- |
| **A · Coastal Ink — recommended** | Deep teal, off-white, serif headlines, clean sans-serif controls | Distinct SEA identity without beachfront-only imagery; editorial but practical |
| B · Warm Heritage | Clay/terracotta, parchment, serif headlines | Most continuity with the current site; less of a clear brand change |
| C · Clear Horizon | Blue/slate, pale grey, all-sans typography | Strong utilitarian marketplace feel; less editorial personality |

These are visual-direction alternatives, not three independently built application architectures. No paid images, fonts, libraries or backend services were added.

### Available screens / interactions

- `#home`: brand/hero, buyer and owner entry points, guide band, two sample listings, Project B.T. Coming Soon, team-contact entry.
- `#properties`: location and budget first; More Filters expands property type/offer; search and clear work on the two **sample** listings, including empty results.
- `#property-ultima` and `#property-carrera`: detail treatment, honest missing-data copy, clear enquiry path.
- `#value-guide`: first-step presentation, dependent sample location selects, no automatic barangay selection, focused validation feedback.
- `#project-bt`: Coming Soon treatment, no launch dates, prices, reservations or unannounced project visuals.
- `#contact`: explicitly labelled placeholder for the existing contact service.

The prototype never calculates a valuation, submits enquiries, subscribes users, persists personal data, sends email or creates leads. Samples are frozen from the Batch 0 inventory capture; names, locations and prices are for design review, not live availability. Property artwork is existing architectural illustration, not authenticated photography. The live report and lead pipelines remain in their current application.

## Recommended identity: Coastal Ink

**Canonical spelling:** SEA Estates. No expansion of the personal initials, no legal suffix.

The proposed outlined arch/horizon mark suggests a doorway and a point of view. It is paired with the full name so recognition does not depend on interpreting an icon. A wordmark-only treatment is a viable alternative. Neither the mark nor a tagline is approved yet.

The preview descriptor **Property & Local Guidance** and headline **Find your place. Know your next step.** are draft interface copy, not a newly adopted company slogan.

### Palette candidates and measured contrast

| Role | Coastal Ink value | Use |
| --- | --- | --- |
| Ink | `#193331` | Main text/headings |
| Muted text | `#53635E` | Secondary explanations, never faint grey placeholders |
| Paper | `#F6F5F0` | Warm page surface |
| Surface | `#FFFFFF` | Forms and listing cards |
| Accent | `#205D50` | Primary actions and active links |
| Dark | `#173C34` | Guide band and footer |
| Soft | `#E8ECE6` | Quiet supporting panels |
| Control border | `#76877E` | Input/control boundaries |
| Focus | `#9C3D15` | Visible keyboard focus |

Measured A ratios: ink/paper **12.34:1**, muted/paper **5.80:1**, white/accent **7.66:1**, control/surface **3.79:1**. Tested text palette pairs for all three directions exceed 4.5:1; tested control boundaries exceed 3:1. This is a token-pair check, not certification of every rendered accessibility state.

### Typography, spacing and interaction

- Prototype UI: system sans-serif, 17px base, 1.6 line height. Editorial headings: Georgia with a serif fallback; direction C uses sans-serif throughout.
- Production should reuse existing Inter for UI if selected, with a system fallback. No font subscription or new webfont is required to implement this direction.
- Main section labels and form-supporting text at least 14px in tested scenarios; normal prose/inputs 17px+, hero introduction around 19px.
- Primary controls 52px; navigation at least 48px. Radio/checkbox hit area comes from the whole labelled row.
- 1220px maximum content width; 40px desktop gutters and 20px small-screen gutters. Large headings do not replace readable body copy.
- Small corner radii, restrained borders, little shadow; purposeful photography/illustration rather than autoplay media or parallax.
- Mobile menu is text-labelled, keyboard-operable, and closes with Escape. No fixed bottom action bar covering fields.
- Search advanced filters are disclosed explicitly, not permanently removed. Keep future filter state/shareable URLs when integrating.
- Errors say what needs attention and move focus to the field. Do not auto-select a barangay after a municipality change.

## Information architecture and preservation plan

### Home

1. SEA Estates wordmark + Properties / BATANGAS VALUE GUIDE / Project B.T. Coming Soon / contact.
2. Hero with separate **Browse properties** and **Get a value guide** actions.
3. High-contrast, named **BATANGAS VALUE GUIDE** entry immediately after the hero.
4. Available properties with location and asking price, without invented zero-valued facts.
5. Dedicated Coming Soon teaser for Project B.T.
6. Contact/help entry and functional footer.

### Guide vs consultation

The current calculator lives on Home; `#/property-value` is a human-consultation landing page. Prototype `#value-guide` is an **isolated preview screen**, not a silently introduced production route. In Batch 2/4, map the approved layout to existing calculator mount/routing hooks. Keep old links, the consultation flow, and `data-est-services` behavior working. Any additional production route needs an explicit routing decision and alias tests.

The prototype shows only the first input screen. Later property/ownership/review/result screens, all original classification data, sources and report actions remain implementation requirements. No new formula or tax/legal claim is authorised by a visual approval.

### Properties

Use the real API filters, sort, pagination, map and gallery behavior when integrating. The prototype demonstrates only the simpler entry/empty-state/card/detail hierarchy. Unknown bedrooms or areas must stay unknown; distinguish absent data from valid zeros before changing rendering rules. Current seed listings are in Caloocan—do not relabel them as Batangas properties.

### Coming Soon and secondary journeys

Project B.T. remains linked in navigation, on Home and in the footer. Preserve its existing consent/notification service when rebuilding the page. Retain Privacy Notice, account/sign-in paths, saved properties, service links and mobile map controls in production even though this visual prototype does not implement them. Footer simplification in the mockup is not authorisation to remove those flows.

## Screenshot review

The captures include the review toolbar; subtract its height when judging final production first-fold space. The mobile guide remains a scrolling form, not a promise that every input fits in one viewport.

| Review | Link |
| --- | --- |
| Recommended Home desktop | [A desktop](screenshots/home-coastal-1440.png) |
| Recommended Home mobile | [A mobile](screenshots/home-coastal-390.png) |
| Warm Heritage comparison | [B desktop](screenshots/home-warm-1440.png) / [B mobile](screenshots/home-warm-390.png) |
| Clear Horizon comparison | [C desktop](screenshots/home-clear-1440.png) / [C mobile](screenshots/home-clear-390.png) |
| Properties mobile | [Properties](screenshots/properties-coastal-390.png) |
| Guide mobile | [Guide](screenshots/value-guide-coastal-390.png) |
| Coming Soon desktop | [Project B.T.](screenshots/project-bt-coastal-1440.png) |
| Detail tablet | [Property detail](screenshots/property-ultima-coastal-768.png) |

Other files in `screenshots/` include desktop/tablet/mobile full-page and viewport-only captures. **33 files** in total. Actual rendered Home desktop/mobile, Properties mobile, Guide mobile, Coming Soon desktop, Detail tablet and palette comparisons were inspected; inspection caught and corrected excessive intrinsic image height before handoff.

## Validation and limits

Run from repository root, with the development server running:

```powershell
node --check docs/sea-estates-design/preview.js
node --check tools/sea_estates_design_review.js
node tools/sea_estates_design_review.js
```

Final result: **150/150 prototype checks passed**, recorded in [review-results.json](review-results.json):

- All three palette contrast pairs, six screens at 320/390/768/1440px, one visible H1 and loaded images.
- No detected horizontal element/page overflow in those scenarios.
- Sample search budget filtering, empty/clear states, dependent guide placeholders/reset/validation.
- Skip link, mobile menu visibility and Escape/focus return.
- Local GET-only resource requests, no runtime JS errors, no external API calls.
- All nine production-file hashes in the Batch 0 baseline unchanged.

The original application test suite was not rerun for this isolated prototype. Its baseline remains 89/90 with a passing targeted map rerun. No tests or production code were weakened/modified. This is not a target-audience usability study, full keyboard/AT audit, contact-submission test or a production launch check. Test the integrated application in later batches.

## Owner approval needed

1. Choose **A / B / C**, or specify adjustments; **A is recommended**.
2. Approve or revise the proposed wordmark/arch mark and serif-headline/sans-UI pairing.
3. Approve the buyer/owner entry hierarchy and compact search direction.

Suggested response: **“Approve A — Coastal Ink. Continue to Batch 2.”**

Before Batch 2: **MODEL CHECK — GPT-6.1 Sol, medium reasoning.** Owner switches manually. Provide current API spend if available; it is still unknown, not zero. Do not spend the PHP 3,000 reserve without approval.
