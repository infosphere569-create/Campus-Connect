// Cloudflare Pages Function -- runs at the edge, BEFORE the static feed.html
// is served. Real visitors get the normal app untouched (this just passes
// through). Social-media crawlers (WhatsApp, Instagram/Facebook, Twitter/X,
// Telegram, LinkedIn, Discord, Slack) requesting a link like
// feed.html?post=ID get real Open Graph tags for THAT SPECIFIC post injected
// into the HTML, so the shared link shows the post's actual text and image
// instead of the generic site-wide preview -- and the link opens straight
// into the SPA which then opens that exact post (feed.js already reads
// ?post= from the URL).
const FIREBASE_PROJECT_ID = "campus-connect-2985d";
const CRAWLER_UA = /facebookexternalhit|Facebot|WhatsApp|Twitterbot|LinkedInBot|Slackbot|TelegramBot|Discordbot|Googlebot|Pinterest|redditbot|SkypeUriPreview/i;

function escapeAttr(s) {
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const postId = url.searchParams.get("post");
  const ua = context.request.headers.get("user-agent") || "";

  // Not a crawler, or no specific post referenced: serve the normal app.
  if (!postId || !CRAWLER_UA.test(ua)) {
    return context.next();
  }

  try {
    const res = await fetch(
      `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/posts/${encodeURIComponent(postId)}`
    );
    if (!res.ok) return context.next();
    const doc = await res.json();
    const fields = doc.fields || {};
    const text = fields.text?.stringValue || "";
    const authorName = fields.authorName?.stringValue || "A student";
    const imageURL = fields.imageURL?.stringValue || `${url.origin}/icon.png`;
    const title = `${authorName} on Campus Connect`;
    const description = (text || "Join the conversation on Campus Connect.").slice(0, 200);

    const staticRes = await context.next();
    const html = await staticRes.text();
    const tags = `
<meta property="og:title" content="${escapeAttr(title)}">
<meta property="og:description" content="${escapeAttr(description)}">
<meta property="og:image" content="${escapeAttr(imageURL)}">
<meta property="og:url" content="${escapeAttr(url.href)}">
<meta property="og:type" content="article">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeAttr(title)}">
<meta name="twitter:description" content="${escapeAttr(description)}">
<meta name="twitter:image" content="${escapeAttr(imageURL)}">
</head>`;
    const injected = html.replace("</head>", tags);
    const headers = new Headers(staticRes.headers);
    headers.set("content-type", "text/html;charset=UTF-8");
    return new Response(injected, { status: staticRes.status, headers });
  } catch (e) {
    return context.next();
  }
}
