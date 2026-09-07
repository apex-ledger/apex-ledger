// Empties the build output folders before a build. Vite's electron plugin appends a new hashed
// main-process bundle on every build and never removes the old ones, so an uncleaned tree ships
// every bundle it ever built: the alpha.4 package carried 89 copies of the main process, 70 MB of
// dead code, in its asar. A fresh folder means the installer holds exactly the code it runs.
import fs from 'node:fs';
for (const dir of ['dist', 'dist-electron']) {
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`cleaned ${dir}/`);
}
