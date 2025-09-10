function parseNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export const handler = async (event) => {
  const params = event.queryStringParameters || {};

  const checkin = params.checkin || new Date(Date.now() + 7*24*60*60*1000).toISOString().slice(0,10);
  const nights  = parseNumber(params.nights, 3);
  const guests  = parseNumber(params.guests, 2);

  const BASE_PRICE_PER_NIGHT = parseNumber(process.env.BASE_PRICE_PER_NIGHT, 100.0);
  const CLEANING_FEE = parseNumber(process.env.CLEANING_FEE, 40.0);
  const TAX_RATE = parseNumber(process.env.TAX_RATE, 0.05);

  let discount = 0.0;
  if (nights >= 7) discount += 0.10;
  if (guests >= 4) discount += 0.05;

  const netNightly = BASE_PRICE_PER_NIGHT * (1 - discount);
  const subtotal = netNightly * nights + CLEANING_FEE;
  const taxes = subtotal * TAX_RATE;
  const total = Math.round((subtotal + taxes) * 100) / 100;

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      inputs: { checkin, nights, guests },
      breakdown: {
        base_price_per_night: BASE_PRICE_PER_NIGHT,
        discount_applied: Number(discount.toFixed(3)),
        cleaning_fee: CLEANING_FEE,
        tax_rate: TAX_RATE
      },
      total_price: total,
      currency: process.env.CURRENCY || "EUR",
      note: "Netlify Functions - starter logic."
    })
  };
};
