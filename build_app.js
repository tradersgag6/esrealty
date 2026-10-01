/* Build js/app.min.js from js/app.js.
 *
 * Usage:
 *   node build_app.js            # minify + stamp
 *   node build_app.js --check    # verify the committed bundle matches js/app.js
 *
 * Why the stamp: index.html loads js/app.min.js, not js/app.js. Without a
 * verifiable link between the two, a stale bundle ships silently and the
 * browser suite happily validates code that never runs. build_app.js appends
 *   window.__ESREALTY_APP_HASH__ = "<sha256 of app.js>";
 * and tests/build_sync_node.js recomputes the hash from js/app.js and fails
 * when the two disagree. That turns "did you remember to rebuild?" into a
 * test failure instead of a production mystery.
 *
 * NOTE: compress/mangle must stay ON. With both disabled Terser only strips
 * whitespace, which cost ~170 KB gzip on the critical path. The safe-compress
 * preset preserves the behaviour the browser suite depends on.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = __dirname;
const SRC = path.join(ROOT, "js", "app.js");
const OUT = path.join(ROOT, "js", "app.min.js");
const STAMP_GLOBAL = "__ESREALTY_APP_HASH__";
const CODE_STAMP_GLOBAL = "__ESREALTY_CODE_HASH__";

/* Hash the NORMALIZED source (LF line endings), never the raw on-disk bytes.
 * This repo is developed on Windows with core.autocrlf=true, so the working
 * copy of js/app.js is CRLF while git stores and CI checks out the LF blob. A
 * byte hash of the working copy therefore never matches the LF checkout, and
 * build_sync_node fails on every fresh CI run. Normalizing to LF makes the
 * stamp line-ending-independent and identical on Windows, Linux, and CI. */
function normalizeEol(text) {
  return String(text).replace(/\r\n/g, "\n");
}

function sourceHash() {
  return crypto.createHash("sha256").update(normalizeEol(fs.readFileSync(SRC, "utf8"))).digest("hex").slice(0, 16);
}

function codeHash(code) {
  return crypto.createHash("sha256").update(normalizeEol(code)).digest("hex").slice(0, 16);
}

function terser() {
  // Resolve terser from the project first, then fall back to a normal
  // resolution so this works on CI and on any other machine. The old build
  // hardcoded an absolute path, which is why the bundle went stale.
  const candidates = [
    path.join(ROOT, "node_modules", "terser"),
    "terser"
  ];
  for (const id of candidates) {
    try { return require(id); } catch (e) { /* try next */ }
  }
  throw new Error("terser not found — run: npm i -D terser");
}

function stampIn(code, global) {
  const m = new RegExp("window\\." + global + '\\s*=\\s*"([0-9a-f]+)"').exec(code || "");
  return m ? m[1] : "";
}

async function build() {
  const { minify } = terser();
  const src = fs.readFileSync(SRC, "utf8");
  const hash = sourceHash();
  const out = await minify(src, {
    compress: {
      // Conservative: drop the safe, behaviour-preserving transforms only.
      passes: 2,
      // These are the settings that can break the string-built markup.
      booleans_as_integers: false,
      drop_console: false
    },
    mangle: true,
    format: { comments: false }
  });
  if (out.error) throw out.error;
  /* Two stamps, because they catch different failures:
   *   APP_HASH  — source changed without a rebuild  (stale bundle)
   *   CODE_HASH — the shipped bytes were hand-edited (tampered bundle)
   * The banner is excluded from CODE_HASH so it stays non-circular. */
  const body = out.code;
  const banner = 'window.' + STAMP_GLOBAL + '="' + hash + '";'
    + 'window.' + CODE_STAMP_GLOBAL + '="' + codeHash(body) + '";\n';
  const code = banner + body;
  fs.writeFileSync(OUT, code);
  const raw = Buffer.byteLength(src);
  const built = Buffer.byteLength(code);
  console.log("BUILD OK");
  console.log("  hash      " + hash);
  console.log("  app.js    " + raw + " bytes");
  console.log("  app.min.js " + built + " bytes  (" + (built / raw * 100).toFixed(1) + "% of source)");
  return 0;
}

async function check() {
  if (!fs.existsSync(OUT)) {
    console.error("OUT OF SYNC: js/app.min.js is missing — run: node build_app.js");
    return 1;
  }
  const bundle = fs.readFileSync(OUT, "utf8");
  const want = sourceHash();
  const have = stampIn(bundle, STAMP_GLOBAL);
  if (!have) {
    console.error("OUT OF SYNC: js/app.min.js carries no build stamp — run: node build_app.js");
    return 1;
  }
  if (have !== want) {
    console.error("OUT OF SYNC: js/app.min.js was built from a different js/app.js");
    console.error("  bundle stamp: " + have);
    console.error("  source hash : " + want);
    console.error("  index.html loads the BUNDLE, so the browser suite is testing stale code.");
    console.error("  Fix: node build_app.js");
    return 1;
  }
  const wantCode = stampIn(bundle, CODE_STAMP_GLOBAL);
  const body = bundle.slice(bundle.indexOf("\n") + 1);
  const haveCode = codeHash(body);
  if (wantCode !== haveCode) {
    console.error("TAMPERED: js/app.min.js was modified after it was built");
    console.error("  built: " + wantCode + "  on disk: " + haveCode);
    console.error("  Fix: node build_app.js");
    return 1;
  }
  console.log("IN SYNC: js/app.min.js matches js/app.js (" + have + ") and is unmodified");
  return 0;
}

(async function () {
  const checkOnly = process.argv.indexOf("--check") !== -1;
  try {
    process.exit(checkOnly ? await check() : await build());
  } catch (e) {
    console.error("BUILD FAILED:", e && e.message ? e.message : e);
    process.exit(1);
  }
})();
