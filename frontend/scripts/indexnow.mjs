// Tells IndexNow search engines (Bing, Yandex, Seznam, Naver) which URLs
// changed, so they recrawl them without waiting. Google does not use
// IndexNow; use Search Console's "Request indexing" for Google.
//
// Run after a deploy that adds or changes public pages:
//   node scripts/indexnow.mjs                 # every URL in the live sitemap
//   node scripts/indexnow.mjs /faq /about     # just these paths
//
// The key must match the file served at /<key>.txt from public/.
const KEY = "998650db4c907a972d51a94d18de8626";
const HOST = "emoggle.com";
const SITE = `https://${HOST}`;

const paths = process.argv.slice(2);
const urls = paths.length
  ? paths.map((p) => new URL(p, SITE).href)
  : [...(await (await fetch(`${SITE}/sitemap.xml`)).text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map(
      (m) => m[1],
    );

const res = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify({
    host: HOST,
    key: KEY,
    keyLocation: `${SITE}/${KEY}.txt`,
    urlList: urls,
  }),
});
console.log(`IndexNow: ${res.status} ${res.statusText} for ${urls.length} URLs`);
if (!res.ok) process.exitCode = 1;
