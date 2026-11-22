import { auctionApi } from "./api.js";

const publicFiles = {};
const mediaTypes = {
  html: "text/html; charset=utf-8", css: "text/css; charset=utf-8", js: "text/javascript; charset=utf-8",
  svg: "image/svg+xml", webp: "image/webp", png: "image/png", woff2: "font/woff2", ico: "image/x-icon"
};
export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path.startsWith("/api/")) return auctionApi(request, env.DB);
    if (!["GET", "HEAD"].includes(request.method)) return new Response(null, { status: 405 });
    const key = path === "/" ? "/index.html" : path;
    if (!Object.hasOwn(publicFiles, key)) return new Response("파일을 찾을 수 없습니다.", { status: 404 });
    const body = request.method === "HEAD" ? null : Uint8Array.from(atob(publicFiles[key]), ch => ch.charCodeAt(0));
    return new Response(body, { headers: {
      "Content-Type": mediaTypes[key.split(".").at(-1)] ?? "application/octet-stream",
      "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff"
    } });
  }
};
