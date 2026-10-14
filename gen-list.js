// Run: node gen-list.js  -> rebuilds assets/background/list.json
const fs = require("fs"), path = require("path");
const dir = path.join(__dirname, "assets", "background");
const files = fs.readdirSync(dir).filter(f => /\.(jpe?g|png|webp|gif|avif)$/i.test(f)).sort();
fs.writeFileSync(path.join(dir, "list.json"), JSON.stringify(files, null, 2));
console.log(files.length + " images listed");
