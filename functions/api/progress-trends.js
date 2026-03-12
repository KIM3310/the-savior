import { buildProgressTrends } from "./_runtime.js";
import { getRequestId, resolveCors } from "./_security.js";

export async function onRequestOptions(context) {
  const cors = resolveCors(context.request, context.env, {
    methods: "GET, OPTIONS",
    allowHeaders: "Content-Type",
  });
  return new Response(null, {
    status: 204,
    headers: {
      ...cors.headers,
      Allow: "GET, OPTIONS",
    },
  });
}

export async function onRequestGet(context) {
  const requestId = getRequestId(context.request);
  const cors = resolveCors(context.request, context.env, {
    methods: "GET, OPTIONS",
    allowHeaders: "Content-Type",
  });
  if (!cors.allowed) {
    return new Response(JSON.stringify({ error: "Origin not allowed." }), {
      status: 403,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "X-Request-Id": requestId,
        ...cors.headers,
      },
    });
  }

  return new Response(
    JSON.stringify(buildProgressTrends(context.env, context.request.url)),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "X-Request-Id": requestId,
        ...cors.headers,
      },
    }
  );
}
