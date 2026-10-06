// Run with: node --test workers/tmdb-image-proxy/index.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import worker from "./index.js";

function withFetch(impl, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  return Promise.resolve(fn()).finally(() => {
    globalThis.fetch = original;
  });
}

const ok = (body = "img", type = "image/jpeg") =>
  new Response(body, { status: 200, headers: { "Content-Type": type } });

const req = (path, init) => new Request(`https://img.cinemagozin.ir${path}`, init);

test("serves a TMDb poster path from image.tmdb.org with long cache and CORS", async () => {
  let fetched;
  await withFetch(
    async (url) => {
      fetched = String(url);
      return ok("bytes");
    },
    async () => {
      const res = await worker.fetch(req("/w500/9cqNxx0GxF0bflZmeSMuL5tnGzr.jpg"));
      assert.equal(res.status, 200);
      assert.equal(await res.text(), "bytes");
      assert.equal(res.headers.get("Content-Type"), "image/jpeg");
      assert.match(res.headers.get("Cache-Control"), /max-age=31536000, immutable/);
      assert.equal(res.headers.get("Access-Control-Allow-Origin"), "*");
    },
  );
  assert.equal(fetched, "https://image.tmdb.org/t/p/w500/9cqNxx0GxF0bflZmeSMuL5tnGzr.jpg");
});

test("accepts profile (h632) and original sizes", async () => {
  await withFetch(async () => ok(), async () => {
    for (const p of ["/h632/abc123.jpg", "/original/Abc_def-1.png", "/w92/x.webp"]) {
      assert.equal((await worker.fetch(req(p))).status, 200, p);
    }
  });
});

test("is not an open proxy: rejects anything that is not a TMDb image path", async () => {
  await withFetch(
    async () => {
      throw new Error("must not fetch upstream for a rejected path");
    },
    async () => {
      for (const p of ["/", "/w500/", "/w500/a/b.jpg", "/../secret", "/w500/a.jpg/extra", "/foo/a.jpg", "/w500/a.js", "/%2e%2e/x.jpg", "/w500/a b.jpg"]) {
        assert.equal((await worker.fetch(req(p))).status, 404, p);
      }
    },
  );
});

test("only GET and HEAD are allowed", async () => {
  await withFetch(async () => ok(), async () => {
    const res = await worker.fetch(req("/w500/a.jpg", { method: "POST" }));
    assert.equal(res.status, 405);
    assert.equal(res.headers.get("Allow"), "GET, HEAD");
    assert.equal((await worker.fetch(req("/w500/a.jpg", { method: "HEAD" }))).status, 200);
  });
});

test("maps upstream failures without leaking them as images", async () => {
  await withFetch(async () => new Response("nope", { status: 404 }), async () => {
    assert.equal((await worker.fetch(req("/w500/missing.jpg"))).status, 404);
  });
  await withFetch(async () => new Response("boom", { status: 503 }), async () => {
    const res = await worker.fetch(req("/w500/a.jpg"));
    assert.equal(res.status, 502);
    assert.match(res.headers.get("Cache-Control"), /max-age=60/);
  });
});
