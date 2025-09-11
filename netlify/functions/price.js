function parseNumber(v, d) { const n = Number(v); return Number.isFinite(n) ? n : d; }
function daysBetween(a, b) { return Math.ceil((b - a) / (1000*60*60*24)); }

export const handler = async (event) => {
  const p = event.queryStringParameters || {};
  const today = new Date();
  const checkin = p.checkin || new Date(Date.now() + 7*24*60*60*1000).toISOString().slice(0,10);
  const nights  = parseNumber(p.nights, 3);
  const guests  = parseNumber(p.guests, 2);

  // Base settings
  const BASE_PRICE = parseNumber(process.env.BASE_PRICE_PER_NIGHT, 100);
  const CLEANING   = parseNumber(process.env.CLEANING_FEE, 40);
  const TAX_RATE   = parseNumber(process.env.TAX_RATE, 0.05);
  const CURRENCY   = process.env.CURRENCY || "EUR";

  // Commissioni (host)
  const AIRBNB_FEE = parseNumber(process.env.AIRBNB_HOST_FEE_RATE, 0.03);  // 3%
  const BKNG_FEE   = parseNumber(process.env.BOOKING_COMMISSION_RATE, 0.15); // 15%
  const VRBO_FEE   = parseNumber(process.env.VRBO_HOST_FEE_RATE, 0.08);    // 8%

  // Promozioni semplici
  const EARLY_BIRD = parseNumber(process.env.EARLY_BIRD_RATE, 0.10); // se >30 gg
  const LAST_MIN   = parseNumber(process.env.LAST_MINUTE_RATE, 0.05); // se <=7 gg

  // Calcolo sconti “globali” (prima delle OTA)
  const ciDate = new Date(checkin + "T12:00:00");
  const daysAhead = daysBetween(ciDate, today);
  let promo = 0;
  if (daysAhead > 30) promo += EARLY_BIRD;
  if (daysAhead <= 7) promo += LAST_MIN;
  if (nights >= 7) promo += 0.10;       // weekly extra esempio
  if (guests >= 4) promo += 0.05;       // group esempio

  const netNight = BASE_PRICE * (1 - promo);
  const subtotal = netNight * nights + CLEANING;
  const taxes    = subtotal * TAX_RATE;
  const guestTotal = +(subtotal + taxes).toFixed(2);

  // Helper per OTA
  const line = (ota, hostFeeRate) => {
    const hostFee = +(guestTotal * hostFeeRate).toFixed(2);
    const hostPayout = +(guestTotal - hostFee).toFixed(2);
    return {
      ota,
      base_price_per_night: BASE_PRICE,
      discounts_applied_rate: +promo.toFixed(3),
      net_nightly: +netNight.toFixed(2),
      cleaning_fee: CLEANING,
      tax_rate: TAX_RATE,
      guest_total: guestTotal,
      host_fee_rate: hostFeeRate,
      host_fee: hostFee,
      host_payout: hostPayout
    };
  };

  const result = {
    inputs: { checkin, nights, guests, days_ahead: daysAhead },
    currency: CURRENCY,
    rows: [
      line("Airbnb", AIRBNB_FEE),
      line("Booking.com", BKNG_FEE),
      line("Vrbo", VRBO_FEE),
    ],
    note: "Esempio: promo e commissioni configurabili via Env Vars. Adeguare valori secondo i tuoi contratti."
  };

  return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(result) };
};

