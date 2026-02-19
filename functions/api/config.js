function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=300"
    }
  });
}

export async function onRequestGet(context) {
  const paymentLink = context.env.STRIPE_PAYMENT_LINK || "";
  const adsenseClient = context.env.ADSENSE_CLIENT || "";
  const adsenseSlotTop = context.env.ADSENSE_SLOT_TOP || "";
  const adsenseSlotBottom = context.env.ADSENSE_SLOT_BOTTOM || "";

  return jsonResponse({
    paymentLink,
    adsenseClient,
    adsenseSlots: {
      top: adsenseSlotTop,
      bottom: adsenseSlotBottom
    }
  });
}
