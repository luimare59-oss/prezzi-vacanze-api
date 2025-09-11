function n(v, d) { const x = Number(v); return Number.isFinite(x) ? x : d; }
function daysAhead(checkinStr) {
  const today = new Date();
  const ci = new Date(checkinStr + "T12:00:00");
  return Math.ceil((ci - today) / (1000*60*60*24));
}

export const handler = async (event) => {
  const q = event.queryStringParameters || {};
  const checkin = q.checkin || new Date(Date.now() + 7*24*60*60*1000).toISOString().slice(0,10);
  const nights  = n(q.nights, 3);
  const guests  = n(q.guests, 2);

  // Base
  const BASE      = n(process.env.BASE_PRICE_PER_NIGHT, 100);
  const CLEANING  = n(process.env.CLEANING_FEE, 40);
  const TAX_RATE  = n(process.env.TAX_RATE, 0.05);
  const CURRENCY  = process.env.CURRENCY || "EUR";

  // Promo globali
  const EARLY     = n(process.env.EARLY_BIRD_RATE, 0.10);
  const LASTMIN   = n(process.env.LAST_MINUTE_RATE, 0.05);
  const days_ahead = daysAhead(checkin);

  // Commissioni / fee
  const AIRBNB_HOST = n(process.env.AIRBNB_HOST_FEE_RATE, 0.03);
  const AIRBNB_GUEST = n(process.env.AIRBNB_GUEST_FEE_RATE, 0.12);
  const BKNG_HOST = n(process.env.BOOKING_COMMISSION_RATE, 0.15);
  const BKNG_GUEST = n(process.env.BOOKING_GUEST_FEE_RATE, 0.00);
  const VRBO_HOST = n(process.env.VRBO_HOST_FEE_RATE, 0.08);
  const VRBO_GUEST = n(process.env.VRBO_GUEST_FEE_RATE, 0.10);

  // Promo OTA specifiche (esempi)
  const AIRBNB_PROMO = n(process.env.AIRBNB_PROMO_RATE, 0.00);
  const BOOKING_GENIUS = n(process.env.BOOKING_GENIUS_RATE, 0.00);
  const VRBO_PROMO = n(process.env.VRBO_PROMO_RATE, 0.00);

  // --- PROMO GLOBALI (prima delle OTA) ---
  let promoGlobal = 0;
  const offersGlobal = [];
  if (days_ahead > 30 && EARLY > 0) { promoGlobal += EARLY; offersGlobal.push(`Early-bird ${Math.round(EARLY*100)}%`); }
  if (days_ahead <= 7 && LASTMIN > 0) { promoGlobal += LASTMIN; offersGlobal.push(`Last-minute ${Math.round(LASTMIN*100)}%`); }
  if (nights >= 7) { promoGlobal += 0.10; offersGlobal.push("Settimanale 10%"); }
  if (guests >= 4) { promoGlobal += 0.05; offersGlobal.push("Gruppi 5%"); }

  // prezzo notte dopo promo GLOBALI
  const netNightGlobal = BASE * (1 - promoGlobal);

  // Helper per riga OTA
  function buildRow(otaName, hostFeeRate, guestFeeRate, otaPromoRate, otaPromoLabel) {
    const offers = [...offersGlobal];
    let promoOta = 0;
    if (otaPromoRate > 0) { promoOta += otaPromoRate; offers.push(`${otaPromoLabel} ${Math.round(otaPromoRate*100)}%`); }

    const totalDiscountRate = Math.min(promoGlobal + promoOta, 0.8); // tetto sicurezza 80%
    const netNight = +(BASE * (1 - totalDiscountRate)).toFixed(2);

    // Subtotale, tasse, fee
    const subtotal = netNight * nights + CLEANING;
    const taxes = +(subtotal * TAX_RATE).toFixed(2);
    const preOtaTotal = +(subtotal + taxes).toFixed(2);

    const guestFee = +(preOtaTotal * guestFeeRate).toFixed(2);
    const guestTotal = +(preOtaTotal + guestFee).toFixed(2);

    const hostFee = +(preOtaTotal * hostFeeRate).toFixed(2);
    const hostPayout = +(preOtaTotal - hostFee).toFixed(2);

    return {
      ota: otaName,
      base_price_per_night: BASE,
      discounts_applied_rate: +totalDiscountRate.toFixed(3),
      offers_applied: offers,                    // <- ELENCO OFFERTE
      net_nightly: netNight,
      cleaning_fee: CLEANING,
      tax_rate: TAX_RATE,
      guest_fee_rate: guestFeeRate,
      guest_fee: guestFee,
      guest_total: guestTotal,
      host_fee_rate: hostFeeRate,
      host_fee: hostFee,
      host_payout: hostPayout
    };
  }

  const rows = [
    buildRow("Airbnb",      AIRBNB_HOST, AIRBNB_GUEST, AIRBNB_PROMO,    "Promo Airbnb"),
    buildRow("Booking.com", BKNG_HOST,   BKNG_GUEST,   BOOKING_GENIUS,  "Genius"),
    buildRow("Vrbo",        VRBO_HOST,   VRBO_GUEST,   VRBO_PROMO,      "Promo Vrbo"),
  ];

  const body = {
    inputs: { checkin, nights, guests, days_ahead },
    currency: CURRENCY,
    rows,
    note: "Promo globali + promo specifiche OTA in 'offers_applied'. Tarare i tassi sulle tue impostazioni reali."
  };

  return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
};
