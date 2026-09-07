const fs = require('fs');
const path = require('path');

function fail(msg) {
  console.error("RELEASE VERIFY FAILED:", msg);
  process.exit(1);
}

const root = __dirname;
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

for (const s of ["rebuild","test","build","dist"]) {
  if (!pkg.scripts || !pkg.scripts[s]) fail(`Missing npm script: ${s}`);
}

const required = [
  "WINDOWS-BUILD-AND-TEST.cmd",
  "TEST-CHECKLIST-FINAL.txt",
  "FINAL-RELEASE-MANIFEST.txt",
  "demo-data/README.md",
  "demo-data/HOW-TO-REVIEW-DEMO.txt"
];

for (const rel of required) {
  if (!fs.existsSync(path.join(root, rel))) fail(`Missing release asset: ${rel}`);
}

const files = [];
function walk(d) {
  for (const ent of fs.readdirSync(d,{withFileTypes:true})) {
    if (["node_modules",".git","dist","release"].includes(ent.name)) continue;
    const p=path.join(d,ent.name);
    if (ent.isDirectory()) walk(p);
    else files.push(p);
  }
}
walk(root);

const migrationFiles = files
  .filter(p => /migrations?[\\/].*\.(sql|ts|js)$/i.test(p))
  .map(p => path.relative(root,p))
  .sort();

const nums = migrationFiles.map(x => {
  const m=path.basename(x).match(/^(\d+)/);
  return m ? Number(m[1]) : null;
}).filter(x => x !== null);

if (nums.length) {
  const seen = new Set();
  for (const n of nums) {
    if (seen.has(n)) fail(`Duplicate migration prefix detected: ${n}`);
    seen.add(n);
  }
}

console.log("Release static verification passed.");
console.log("Version:", pkg.version);
console.log("Migration files found:", migrationFiles.length);
console.log("Required release assets:", required.length);
