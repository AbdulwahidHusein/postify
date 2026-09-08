export interface Env {
  BUCKET: R2Bucket;
  PUBLIC_URL: string;
  UPLOAD_SECRET: string;
}

function unauthorized() {
  return new Response("Unauthorized", { status: 401 });
}

function badRequest(msg: string) {
  return new Response(msg, { status: 400 });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const auth = request.headers.get("authorization") ?? "";
    const expected = `Bearer ${env.UPLOAD_SECRET}`;
    if (!env.UPLOAD_SECRET || auth !== expected) {
      return unauthorized();
    }

    const url = new URL(request.url);
    const key = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
    if (!key || key.includes("..")) {
      return badRequest("Invalid key");
    }

    if (request.method === "PUT") {
      const contentType =
        request.headers.get("content-type") || "application/octet-stream";
      const body = await request.arrayBuffer();
      if (body.byteLength === 0 || body.byteLength > 8 * 1024 * 1024) {
        return badRequest("Empty or too large");
      }
      await env.BUCKET.put(key, body, {
        httpMetadata: {
          contentType,
          cacheControl: "public, max-age=31536000, immutable",
        },
      });
      const publicBase = env.PUBLIC_URL.replace(/\/$/, "");
      return Response.json({
        key,
        url: `${publicBase}/${key}`,
      });
    }

    if (request.method === "DELETE") {
      await env.BUCKET.delete(key);
      return new Response(null, { status: 204 });
    }

    return new Response("Method not allowed", { status: 405 });
  },
};
