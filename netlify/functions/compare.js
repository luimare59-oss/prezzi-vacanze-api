function n(v, d) { const x = Number(v); return Number.isFinite(x) ? x : d; }
function daysAhead(checkinStr) {
  const today = new Date();
  const ci = new Date(checkinStr + "T12:00:00");
  return Math.ceil((ci - today) / (1000*60*60*24));
}

function computeRows({ checkin, nights, guests, env }) {
  const BASE      = n(env.BASE_PRICE_PER_NIGHT, 100);
  const CLEANING  = n(env.CLEANING_FEE, 40);
  const TAX_RATE  = n(env.TAX_RATE, 0.05);
  const CURRENCY  = env.CURRENCY || "EUR";

  const EARLY     = n(env.EARLY_BIRD_RATE, 0.10);
  const LASTMIN   = n(env.LAST_MINUTE_RATE, 0.05);
  const dAhead    = daysAhead(checkin);

  const cfg = [
    { ota: "Airbnb",      host: n(env.AIRBNB_HOST_FEE_RATE, 0.03),  guest: n(env.AIRBNB_GUEST_FEE_RATE, 0.12), promo: n(env.AIRBNB_PROMO_RATE, 0.00), label: "Promo Airbnb" },
    { ota: "Booking.com", host: n(env.BOOKING_COMMISSION_RATE, 0.15), guest: n(env.BOOKING_GUEST_FEE_RATE, 0.00), promo: n(env.BOOKING_GENIUS_RATE, 0.00), label: "Genius" },
    { ota: "Vrbo",        host: n(env.VRBO_HOST_FEE_RATE, 0.08),  guest: n(env.VRBO_GUEST_FEE_RATE, 0.10), promo: n(env.VRBO_PROMO_RATE, 0.00), label: "Promo Vrbo" },
  ];

  let promoGlobal = 0;
  const offers = [];
  if (dAhead > 30 && EARLY > 0) { promoGlobal += EARLY; offers.push(`Early-bird ${Math.round(EARLY*100)}%`); }
  if (dAhead <= 7 && LASTMIN > 0) { promoGlobal += LASTMIN; offers.push(`Last-minute ${Math.round(LASTMIN*100)}%`); }
  if (nights >= 7) { promoGlobal += 0.10; offers.push("Settimanale 10%"); }
  if (guests >= 4) { promoGlobal += 0.05; offers.push("Gruppi 5%"); }

  const rows = cfg.map(({ ota, host, guest, promo, label }) => {
    const allOffers = [...offers];
    let totalDisc = promoGlobal;
    if (promo > 0) { totalDisc += promo; allOffers.push(`${label} ${Math.round(promo*100)}%`); }
    totalDisc = Math.min(totalDisc, 0.8);

    const netNight  = +(BASE * (1 - totalDisc)).toFixed(2);
    const subtotal  = netNight * nights + CLEANING;
    const taxes     = +(subtotal * TAX_RATE).toFixed(2);
    const preOta    = +(subtotal + taxes).toFixed(2);

    const guestFee  = +(preOta * guest).toFixed(2);
    const guestTot  = +(preOta + guestFee).toFixed(2);
    const hostFee   = +(preOta * host).toFixed(2);
    const hostPay   = +(preOta - hostFee).toFixed(2);

    return {
      OTA: ota,
      Checkin: checkin,
      Notti: nights,
      Ospiti: guests,
      "Prezzo base notte": BASE,
      "Sconti tot %": +totalDisc.toFixed(3),
      "Offerte applicate": allOffers.join(" + "),
      "Notte netta": netNight,
      "Cleaning": CLEANING,
      "Tasse %": TAX_RATE,
      "Fee ospite %": guest,
      "Fee ospite €": guestFee,
      "Totale ospite": guestTot,
      "Fee host %": host,
      "Fee host €": hostFee,
      "Payout host": hostPay,
      Valuta: CURRENCY
    };
  });

  return rows;
}

export const handler = async (event) => {
  const q = event.queryStringParameters || {};
  const checkin = q.checkin || new Date(Date.now() + 7*24*60*60*1000).toISOString().slice(0,10);
  const nights  = n(q.nights, 3);
  const guests  = n(q.guests, 2);

  const rows = computeRows({
    checkin, nights, guests,
    env: {
      BASE_PRICE_PER_NIGHT: process.env.BASE_PRICE_PER_NIGHT,
      CLEANING_FEE: process.env.CLEANING_FEE,
      TAX_RATE: process.env.TAX_RATE,
      CURRENCY: process.env.CURRENCY,
      EARLY_BIRD_RATE: process.env.EARLY_BIRD_RATE,
      LAST_MINUTE_RATE: process.env.LAST_MINUTE_RATE,
      AIRBNB_HOST_FEE_RATE: process.env.AIRBNB_HOST_FEE_RATE,
      AIRBNB_GUEST_FEE_RATE: process.env.AIRBNB_GUEST_FEE_RATE,
      BOOKING_COMMISSION_RATE: process.env.BOOKING_COMMISSION_RATE,
      BOOKING_GUEST_FEE_RATE: process.env.BOOKING_GUEST_FEE_RATE,
      VRBO_HOST_FEE_RATE: process.env.VRBO_HOST_FEE_RATE,
      VRBO_GUEST_FEE_RATE: process.env.VRBO_GUEST_FEE_RATE,
      AIRBNB_PROMO_RATE: process.env.AIRBNB_PROMO_RATE,
      BOOKING_GENIUS_RATE: process.env.BOOKING_GENIUS_RATE,
      VRBO_PROMO_RATE: process.env.VRBO_PROMO_RATE,
    }
  });

  return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(rows) };
};
