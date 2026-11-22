const types = {
  html: "text/html; charset=utf-8", css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8", json: "application/json; charset=utf-8",
  svg: "image/svg+xml", webp: "image/webp", png: "image/png", jpg: "image/jpeg",
  jpeg: "image/jpeg", ico: "image/x-icon", woff2: "font/woff2", woff: "font/woff",
  mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg"
};

export function staticResponse(path, bytes, method) {
  if (method !== "GET" && method !== "HEAD") return new Response(null, { status: 405, headers: { Allow: "GET, HEAD" } });
  if (bytes == null) return new Response("파일을 찾을 수 없습니다.", { status: 404 });
  return new Response(method === "HEAD" ? null : bytes, {
    headers: {
      "Content-Type": types[path.split(".").pop().toLowerCase()] ?? "application/octet-stream",
      "Content-Length": String(bytes.byteLength), "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
