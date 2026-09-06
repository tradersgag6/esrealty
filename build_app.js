const fs = require("fs");
const { minify } = require("C:/Users/Home-Desktop/Desktop/project 1/es realty/node_modules/terser");
const src = fs.readFileSync("js/app.js", "utf8");
minify(src, { compress: false, mangle: false, format: { comments: false } })
  .then(r => {
    if (r.error) { console.error("MINIFY ERROR:", r.error); process.exit(1); }
    fs.writeFileSync("js/app.min.js", r.code);
    console.log("MIN BUILD OK — js/app.min.js", r.code.length, "bytes");
  })
  .catch(e => { console.error("BUILD FAILED:", e); process.exit(1); });