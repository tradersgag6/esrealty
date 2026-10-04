"use strict";
// Derive a review page from the ORIGINAL app, without editing production files.
const fs = require("fs"), path = require("path");
const root = path.resolve(__dirname, "..");
const out = path.join(root, "docs/sea-estates-improved");
if (!fs.existsSync(out)) throw new Error("Expected proposal directory");
let source = fs.readFileSync(path.join(root, "index.html"), "utf8");
source = source.replace("<head>", '<head>\n<base href="/">\n<meta name="robots" content="noindex,nofollow">\n<script src="docs/sea-estates-improved/guard.js"></script>');
source = source.replace("</head>", '<link rel="stylesheet" href="docs/sea-estates-improved/improved.css">\n<script src="docs/sea-estates-improved/improved.js" defer></script>\n</head>');
fs.writeFileSync(path.join(out, "index.html"), source);
console.log("Built docs/sea-estates-improved/index.html from original index.html; production untouched.");
