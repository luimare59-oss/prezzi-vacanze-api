function num(v, d){ const x=Number(v); return Number.isFinite(x)?x:d; }
function daysAhead(ciStr){ const t=new Date(), ci=new Date(ciStr+"T12:00:00"); return Math.ceil((ci-t)/(1000*60*60*24)); }
function monthOf(ciStr){ return new Date(ciStr+"T12:00:00").getMonth()+1; }
function csvToSet(s){ return new Set(String(s||"").split(",").map(x=>x.trim()).filter(Boolean).map(x=>Number(x))); }

function airbnbNotteSingolaRate(nights, env){
  if (nights>=6) return num(env.NS_TIER_6N, 0.40);
  if (nights>=5) return num(env.NS_TIER_5N, 0.40);
  if (nights>=4) return num(env.NS_TIER_4N, 0.40);
  if (nights>=3) return num(env.NS_TIER_3N, 0.35);
  if (nights>=2) return num(env.NS_TIER_2N, 0.25);
  return 0;
}

export const handler = async (event) => {
  const q = event.queryStringParameters || {};
  const checkin = q.checkin || new Date(Date.now()+7*24*60*60*1000).toISOString().slice(0,10);
  const nights  = num(q.nights, 3);
  const guests  = num(q.guests, 2);

  // Base
  const BASE = num(process.env.BASE_PRICE_PER_NIGHT, 100);
  const CLEANING = num(process.env.CLEANING_FEE, 40);
  const TAX_RATE = num(process.env.TAX_RATE, 0.05);
  const CURRENCY = process.env.CURRENCY || "EUR";

  // Fee/commissioni
  const AIRBNB_HOST = num(process.env.AIRBNB_HOST_FEE_RATE, 0.03);
  const AIRBNB_GUEST = num(process.env.AIRBNB_GUEST_FEE_RATE, 0.12);
  const BKNG_HOST = num(process.env.BOOKING_COMMISSION_RATE, 0.15);
  const BKNG_GUEST = num(process.env.BOOKING_GUEST_FEE_RATE, 0.00);
  const VRBO_HOST = num(process.env.VRBO_HOST_FEE_RATE, 0.08);
  const VRBO_GUEST = num(process.env.VRBO_GUEST_FEE_RATE, 0.10);

  // Regole esclusive
  const NS_ACTIVE = num(process.env.NOTTE_SINGOLA_ACTIVE, 1) === 1;
  const NS_MONTHS = csvToSet(process.env.NOTTE_SINGOLA_MONTHS || 9); // default: settembre
  const NS_MAX = num(process.env.NOTTE_SINGOLA_MAX_NIGHTS, 6);
  const WEEKLY_MIN = num(process.env.WEEKLY_MIN_NIGHTS, 7);
  const WEEKLY_RATE = num(process.env.WEEKLY_RATE, 0.10);

  // Promo normali (usate SOLO se non scatta un’esclusiva)
  const EARLY = num(process.env.EARLY_BIRD_RATE, 0.10);
  const LASTM = num(process.env.LAST_MINUTE_RATE, 0.05);
  const dAhead = daysAhead(checkin);
  const mm = monthOf(checkin);

  // --- Determina il REGIME DI SCONTO (esclusivo) ---
  // 1) Notte singola (solo Airbnb) se attivo, mese match e notti <= max
  const notteSingolaApplicable = NS_ACTIVE && NS_MONTHS.has(mm) && nights <= NS_MAX && nights >= 2;
  // 2) Settimanale se notti >= soglia
  const weeklyApplicable = !notteSingolaApplicable && nights >= WEEKLY_MIN;

  // Calcolo prezzi per ciascuna OTA con il regime scelto
  function computeLine(ota, {hostFeeRate, guestFeeRate, regime}) {
    let discRate = 0;
    const offers = [];

    if (regime === "NS" && ota === "Airbnb") {
      // scaglioni notte singola (SOLO Airbnb), non sommare altro
      const r = airbnbNotteSingolaRate(nights, process.env);
      if (r > 0){ discRate += r; offers.push(`Notte singola ${Math.round(r*100)}%`); }
    } else if (regime === "WEEKLY") {
      // offerta settimanale esclusiva
      if (WEEKLY_RATE > 0){ discRate += WEEKLY_RATE; offers.push(`Offerta 7+ notti ${Math.round(WEEKLY_RATE*100)}%`); }
    } else {
      // regime "normale": promo globali (non esclusive)
      if (dAhead > 30 && EARLY > 0){ discRate += EARLY; offers.push(`Early-bird ${Math.round(EARLY*100)}%`); }
      if (dAhead <= 7 && LASTM > 0){ discRate += LASTM; offers.push(`Last-minute ${Math.round(LASTM*100)}%`); }
      if (nights >= 7){ discRate += 0.10; offers.push("Settimanale 10%"); }
      if (guests >= 4){ discRate += 0.05; offers.push("Gruppi 5%"); }
    }

    discRate = Math.min(discRate, 0.80); // tetto sicurezza

    const netNight = +(BASE * (1 - discRate)).toFixed(2);
    const subtotal = netNight * nights + CLEANING;
    const taxes = +(subtotal * TAX_RATE).toFixed(2);
    const preOta = +(subtotal + taxes).toFixed(2);

    const guestFee = +(preOta * guestFeeRate).toFixed(2);
    const guestTotal = +(preOta + guestFee).toFixed(2);

    const hostFee = +(preOta * hostFeeRate).toFixed(2);
    const hostPayout = +(preOta - hostFee).toFixed(2);

    return {
      ota, base_price_per_night: BASE,
      discounts_applied_rate: +discRate.toFixed(3),
      offers_applied: offers,
      net_nightly: netNight,
      cleaning_fee: CLEANING, tax_rate: TAX_RATE,
      guest_fee_rate: guestFeeRate, guest_fee: guestFee, guest_total: guestTotal,
      host_fee_rate: hostFeeRate, host_fee: hostFee, host_payout: hostPayout
    };
  }

  const regime = notteSingolaApplicable ? "NS" : (weeklyApplicable ? "WEEKLY" : "NORMAL");
  const rows = [
    computeLine("Airbnb",      {hostFeeRate: AIRBNB_HOST, guestFeeRate: AIRBNB_GUEST, regime}),
    computeLine("Booking.com", {hostFeeRate: BKNG_HOST,   guestFeeRate: BKNG_GUEST,   regime}),
    computeLine("Vrbo",        {hostFeeRate: VRBO_HOST,   guestFeeRate: VRBO_GUEST,   regime})
  ];

  const body = {
    inputs: { checkin, nights, guests, days_ahead: dAhead, month: mm, regime },
    currency: CURRENCY,
    rows,
    note: "Regole esclusive: Notte singola (solo Airbnb) e 7+ notti non si sommano ad altri sconti."
  };

  return { statusCode: 200, headers: {"Content-Type":"application/json"}, body: JSON.stringify(body) };
};
