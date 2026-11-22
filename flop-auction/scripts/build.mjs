import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const publicDir = join(root, "public");
const assets = {};
async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) { await collect(path); continue; }
    if (!entry.isFile()) continue;
    const url = "/" + relative(publicDir, path).split(sep).map(encodeURIComponent).join("/");
    assets[url] = (await readFile(path)).toString("base64");
  }
}
await collect(publicDir);
if (!assets["/index.html"]) throw new Error("Missing public/index.html");
const modules = [];
for (const name of ["game", "api", "worker"]) {
  const source = await readFile(join(root, "server", name + ".js"), "utf8");
  modules.push(source.replace(/^import [^\n]+\r?\n/gm, "")
    .replace(/^export (?=(?:async )?(?:function|class|const) )/gm, "")
    .replace("const publicFiles = {};", () => "const publicFiles = " + JSON.stringify(assets) + ";"));
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
console.log("Built Worker with", Object.keys(assets).length, "public files.");
