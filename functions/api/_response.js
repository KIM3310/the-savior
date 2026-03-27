/**
 * Shared JSON response helper for all API routes.
 * @param {object} body
 * @param {number} status
 * @param {object} [extraHeaders]
 * @returns {Response}
 */
export function jsonResponse(
  body,
  status = 200,
  { corsHeaders = {}, extraHeaders = {}, cacheControl = "no-store" } = {}
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": cacheControl,
      ...corsHeaders,
      ...extraHeaders
    }
  });
}
