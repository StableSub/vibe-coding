import { handleApi } from "./api.js";
import { staticResponse } from "./static.js";

// The build inserts the public directory here so the Worker is self-contained.
const publicFiles = {};

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith("/api/")) return handleApi(request, env.DB);
    const path = pathname === "/" ? "/index.html" : pathname;
    const base64 = publicFiles[path];
    const bytes = typeof base64 === "string" ? Uint8Array.from(atob(base64), char => char.charCodeAt(0)) : null;
    return staticResponse(path, bytes, request.method);
  }
};
