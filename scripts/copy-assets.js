// tsc only emits .js -- copy the .ejs templates and .sql schema into dist/ so a
// built server finds them at the same relative paths it uses in dev.
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

const copies = [
  ["src/views", "dist/views"],
  ["src/db/schema.sql", "dist/db/schema.sql"],
];

for (const [from, to] of copies) {
  const src = path.join(root, from);
  const dest = path.join(root, to);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
  console.log(`copied ${from} -> ${to}`);
}
