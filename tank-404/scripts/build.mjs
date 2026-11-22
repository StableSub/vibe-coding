import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, relative, sep } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const publicRoot = join(root, "public");
const publicFiles = {};
async function collect(directory) {
  for (const child of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, child.name);
    if (child.isDirectory()) await collect(path);
    else if (child.isFile()) {
      const key = "/" + relative(publicRoot, path).split(sep).map(encodeURIComponent).join("/");
      publicFiles[key] = (await readFile(path)).toString("base64");
    }
  }
}
await collect(publicRoot);
if (!publicFiles["/index.html"]) throw new Error("public/index.html is required.");

// These small ES modules have named exports and one-line relative imports.
// Flatten their dependency order into Sites' single Worker entrypoint.
const modules = [];
for (const filename of ["story", "radio", "game", "api", "static", "worker"]) {
  const source = await readFile(join(root, "server", filename + ".js"), "utf8");
  modules.push(source.replace(/^import [^\n]+\r?\n/gm, "")
    .replace(/^export (?=(?:async )?(?:function|class|const) )/gm, "")
    .replace("const publicFiles = {};", () => "const publicFiles = " + JSON.stringify(publicFiles) + ";"));
}
const output = join(root, "dist");
await mkdir(join(output, "server"), { recursive: true });
await writeFile(join(output, "server/index.js"), modules.join("\n"));
await mkdir(join(output, ".openai"), { recursive: true });
try {
  await cp(join(root, ".openai/hosting.json"), join(output, ".openai/hosting.json"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
await cp(join(root, "drizzle"), join(output, ".openai/drizzle"), { recursive: true });
console.log(`Built Worker with ${Object.keys(publicFiles).length} public files.`);
