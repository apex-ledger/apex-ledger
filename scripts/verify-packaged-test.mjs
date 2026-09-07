import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('.');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const output = path.resolve(root, pkg.build.directories.output);
const artifactName = pkg.build.artifactName.replace('${version}', pkg.version).replace('${ext}', 'exe');
const installer = path.join(output, artifactName);
const blockMap = `${installer}.blockmap`;
const unpacked = path.join(output, 'win-unpacked');
const driver = path.join(unpacked, 'resources', 'app.asar.unpacked', 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node');
const demo = path.join(unpacked, 'resources', 'demo-companies', 'North Ledger Comprehensive Demo.company');
const icon = path.resolve(root, pkg.build.win.icon);
const expectedDriverHash = '7BBE7704E4B68CA6C2C54DDC80DF52413B3D14500AEFBF6EF6B05316E3CA42EF';
const failures = [];
const existsWithSize = (file, minimum) => fs.existsSync(file) && fs.statSync(file).size >= minimum;
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').toUpperCase();

if (!pkg.build.directories.output.includes(pkg.version)) failures.push('Release output folder does not contain the package version.');
if (!existsWithSize(installer, 50_000_000)) failures.push(`Installer is missing or unexpectedly small: ${installer}`);
if (!existsWithSize(blockMap, 100)) failures.push('Installer block map is missing or empty.');
if (!existsWithSize(path.join(unpacked, `${pkg.build.productName}.exe`), 1_000_000)) failures.push('Unpacked application executable is missing.');
if (!existsWithSize(demo, 100_000)) failures.push('Bundled comprehensive demo company is missing or empty.');
if (!existsWithSize(icon, 5_000)) failures.push('Configured North Ledger application icon is missing or empty.');
if (!existsWithSize(driver, 100_000)) failures.push('Packaged better-sqlite3 accounting driver is missing.');
else {
  const actual = sha256(driver);
  if (actual !== expectedDriverHash) failures.push(`Packaged accounting driver hash mismatch: ${actual}`);
}

if (failures.length) {
  console.error('Packaged TEST installer verification FAILED:');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(2);
}

console.log('Packaged TEST installer verification PASSED.');
console.log(` installer: ${installer}`);
console.log(` bytes: ${fs.statSync(installer).size}`);
console.log(` sha256: ${sha256(installer)}`);
console.log(' native accounting driver, demo company, block map, and custom icon verified.');
