const ALLOWED_HOSTS = ["www.sec.gov", "data.sec.gov"];
export async function onRequestGet({ request }) {
  const incoming = new URL(request.url);
  const path = incoming.searchParams.get("path") || "";
  if (!path || path.startsWith("/") || path.includes("..") || path.includes("\\") || path.includes(":")) {
    return Response.json({ error: "Invalid SEC data path." }, { status: 400 });
  }
  const host = path.startsWith("files/") ? "www.sec.gov" : "data.sec.gov";
  if (!ALLOWED_HOSTS.includes(host)) return Response.json({ error: "Source not allowed." }, { status: 400 });
  const upstream = await fetch("https://" + host + "/" + path, {
    headers: {
      "Accept": "application/json",
      "User-Agent": "AIStockAdvisor/0.1 contact: ihamzaij681@gmail.com"
    }
  });
  const headers = new Headers({
    "Content-Type": upstream.headers.get("Content-Type") || "application/json",
    "Cache-Control": "public, max-age=300",
    "Access-Control-Allow-Origin": incoming.origin,
    "X-Content-Type-Options": "nosniff"
  });
  return new Response(upstream.body, { status: upstream.status, headers });
}
