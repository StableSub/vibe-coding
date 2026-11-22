import { createServer } from "node:http";
import { Readable } from "node:stream";
import { mkdir, readFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { handleApi } from "./api.js";
import { staticResponse } from "./static.js";
import { localDatabase } from "./sqlite.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const publicRoot = join(root, "public");
const dataDir = process.env.TANK404_DATA_DIR || join(root, ".data");
await mkdir(dataDir, { recursive: true });
const db = localDatabase(join(dataDir, "cases.sqlite"));

async function serve(request) {
  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/")) return handleApi(request, db);
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); }
  catch { return new Response(null, { status: 400 }); }
  const path = resolve(publicRoot, "." + (pathname === "/" ? "/index.html" : pathname));
  let bytes = null;
  if (path.startsWith(publicRoot + sep)) {
    try { bytes = await readFile(path); }
    catch (error) {
      if (!["ENOENT", "ENOTDIR", "EISDIR", "EINVAL"].includes(error.code)) throw error;
    }
  }
  return staticResponse(path, bytes, request.method);
}

const port = Number(process.env.PORT || 4040);
const host = process.env.HOST || "127.0.0.1";
const server = createServer(async (incoming, outgoing) => {
  try {
    const options = { method: incoming.method, headers: incoming.headers };
    if (!["GET", "HEAD"].includes(incoming.method)) {
      options.body = Readable.toWeb(incoming);
      options.duplex = "half";
    }
    const response = await serve(new Request(new URL(incoming.url, "http://localhost"), options));
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    console.error("Request failed", error.message);
    if (!outgoing.headersSent) outgoing.writeHead(500);
    outgoing.end();
  }
});
server.listen(port, host, () => console.log(`Tank 404 · http://${host}:${server.address().port}/`));
