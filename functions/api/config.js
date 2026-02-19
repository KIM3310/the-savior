const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      ...CORS_HEADERS
    }
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      Allow: "GET, OPTIONS",
      ...CORS_HEADERS
    }
  });
}

export async function onRequestGet(context) {
  const hasServerApiKey = Boolean(context.env.OPENAI_API_KEY);
  const adsenseClient = context.env.ADSENSE_CLIENT || "";
  const adsenseSlotTop = context.env.ADSENSE_SLOT_TOP || "";
  const adsenseSlotBottom = context.env.ADSENSE_SLOT_BOTTOM || "";

  return jsonResponse({
    hasServerApiKey,
    adsenseClient,
    adsenseSlots: {
      top: adsenseSlotTop,
      bottom: adsenseSlotBottom
    }
  });
}
