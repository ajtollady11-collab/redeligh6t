// Vercel Edge Function: returns the visitor's country code (e.g. "GB", "US")
// so the page can show the right fixed price. No conversion happens here.
export const config = { runtime: "edge" };

export default function handler(request) {
  const country = request.headers.get("x-vercel-ip-country") || "";
  return new Response(JSON.stringify({ country }), {
    headers: { "content-type": "application/json", "cache-control": "no-store" }
  });
}
