"use strict";
/* Generator/data sync guard.
 *
 * data/zonal-config.json is the file the estimator actually loads. It is generated
 * by market-scan/build-batangas-data.js. If the two disagree, regenerating the
 * dataset silently changes prices: the generator once carried stale construction
 * rates (15000/40000) and no provenance fields while the committed data file had
 * 16000/25000/32000 with sourceType/sourceDate. Someone ran the generator and every
 * estimate quietly moved.
 *
 * This test runs the generator's CONFIG inside a sandbox, captures what it would
 * write to data/zonal-config.json, and asserts it equals the committed file. It
 * fails if the generator drifts OR if the data file is hand-edited past it, and the
 * message tells you which file to fix. Editing the engine constants is fine - the
 * point is the two must move together.
 */
const assert = require("assert"), fs = require("fs"), path = require("path"), vm = require("vm");
const ROOT = path.join(__dirname, "..");
const GEN = path.join(ROOT, "market-scan", "build-batangas-data.js");
const DATA = path.join(ROOT, "data", "zonal-config.json");

const gen = fs.readFileSync(GEN, "utf8");
const committed = JSON.parse(fs.readFileSync(DATA, "utf8"));

let captured = null;
/* Stub the generator's internal write() so build mode runs but writes nothing, and
   capture the config it would have written. */
const patched = gen.replace(
  'function write(rel, obj) {\n  fs.writeFileSync(path.join(ROOT, rel), JSON.stringify(obj, null, 2) + "\\n", "utf8");\n}',
  'function write(rel, obj) { if (rel === "data/zonal-config.json") __capture(obj); }'
);

const sandbox = {
  require,
  __dirname: path.join(ROOT, "market-scan"),
  process: { argv: ["node", "x"], env: {}, exit: () => { throw new Error("__DONE__"); } },
  console: { log: () => {}, error: () => {} },
  setTimeout, clearTimeout,
  __capture: (o) => { captured = o; }
};

try {
  vm.runInNewContext(patched, sandbox, { filename: "build-batangas-data.js" });
} catch (e) {
  if (e.message !== "__DONE__") throw e;
}

assert.ok(captured, "the generator did not reach the config write; its build path must have changed");

/* JSON.stringify canonicalizes key order (insertion order in the object), so this
   is an exact structural comparison, not a whitespace one. */
const a = JSON.stringify(captured);
const b = JSON.stringify(committed);
if (a !== b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  assert.fail("generator CONFIG != data/zonal-config.json at char " + i +
    "\n  generator: " + a.slice(i - 40, i + 60) +
    "\n  data file: " + b.slice(i - 40, i + 60) +
    "\n  Fix: edit the generator, then run `node market-scan/build-batangas-data.js` to regenerate the data file, OR if the data file was deliberately changed, sync the generator's CONFIG to match.");
}

console.log("ALL GREEN (1 check) — generator CONFIG matches data/zonal-config.json");