function num(v,d){ const x=Number(v); return Number.isFinite(x)?x:d; }
function daysAhead(ci){ const t=new Date(), d=new Date(ci+"T12:00:00"); return Math.ceil((d-t)/(1000*60*60*24)); }
function monthOf(ci){ return new Date(ci+"T12:00:00").getMonth()+1; }
function csvSet(s){ return new Set(String(s||"").split(",").map(x=>x.trim()).filter(Boolean).map(Number)); }

// Airbnb: set "notte singola" (2–6) esclusivo – già in uso
function airbnbNsRate(nights, env){
  if (nights>=6) return num(env.NS_TIER_6N,0.40);
  if (nights>=5) return num(env.NS_TIER_5N,0.40);
  if (nights>=4) return num(env.NS_TIER_4N,0.40);
  if (nights>=3) return num(env.NS_TIER_3N,0.35);
  if (nights>=2) return num(env.NS_TIER_2N,0.25);
  return 0;
}

// Booking: “notte singola” = MARKUP esclusivo (es. +70%) – applico tipicamente a 1 notte
function bookingSingleNightApplicable({nights, checkin, env}) {
  const active = num(env.BOOKING_SINGLE_NIGHT_ACTIVE, 0) === 1;
  if (!active) return false;
  const months = csvSet(env.BOOKING_SINGLE_NIGHT_MONTHS || "");
  const monthOk = months.size ? months.has(monthOf(checkin)) : true;
  return monthOk && nights === 1; // se vuoi altra logica, cambia qui
}

// Booking: sconti cumulabili per MODE scelto
function bookingStackDiscount(env){
  const mode = String(env.BOOKING_STACK_MODE||"1").trim();
  const r = (k)=>num(env[k],0);
  const parts = [];
  let total = 0;
  if (mode==="1"){ // Base + Genius + Black Friday + Offerta a tempo
    if (r("GENIUS_RATE")>0){ total+=r("GENIUS_RATE"); parts.push(`Genius ${Math.round(r("GENIUS_RATE")*100)}%`); }
    if (r("BLACK_FRIDAY_RATE")>0){ total+=r("BLACK_FRIDAY_RATE"); parts.push(`Black Friday ${Math.round(r("BLACK_FRIDAY_RATE")*100)}%`); }
    if (r("LIMITED_TIME_RATE")>0){ total+=r("LIMITED_TIME_RATE"); parts.push(`Offerta a tempo ${Math.round(r("LIMITED_TIME_RATE")*100)}%`); }
  } else if (mode==="2"){ // Base + Genius + Campagne
    if (r("GENIUS_RATE")>0){ total+=r("GENIUS_RATE"); parts.push(`Genius ${Math.round(r("GENIUS_RATE")*100)}%`); }
    if (r("CAMPAIGN_HOLIDAY_RATE")>0){ total+=r("CAMPAIGN_HOLIDAY_RATE"); parts.push(`Vacanze ${Math.round(r("CAMPAIGN_HOLIDAY_RATE")*100)}%`); }
    if (r("CAMPAIGN_YEAR_END_RATE")>0){ total+=r("CAMPAIGN_YEAR_END_RATE"); parts.push(`Fine Anno ${Math.round(r("CAMPAIGN_YEAR_END_RATE")*100)}%`); }
    if (r("CAMPAIGN_START_2026_RATE")>0){ total+=r("CAMPAIGN_START_2026_RATE"); parts.push(`Inizio 2026 ${Math.round(r("CAMPAIGN_START_2026_RATE")*100)}%`); }
  } else if (mode==="3"){ // Base + Genius + Tariffe mirate
    if (r("GENIUS_RATE")>0){ total+=r("GENIUS_RATE"); parts.push(`Genius ${Math.round(r("GENIUS_RATE")*100)}%`); }
    if (r("TARGET_MOBILE_RATE")>0){ total+=r("TARGET_MOBILE_RATE"); parts.push(`Mobile ${Math.round(r("TARGET_MOBILE_RATE")*100)}%`); }
    if (r("TARGET_COUNTRY_RATE")>0){ total+=r("TARGET_COUNTRY_RATE"); parts.push(`Paese ${Math.round(r("TARGET_COUNTRY_RATE")*100)}%`); }
    if (r("TARGET_US_STATE_RATE")>0){ total+=r("TARGET_US_STATE_RATE"); parts.push(`Stato USA ${Math.round(r("TARGET_US_STATE_RATE")*100)}%`); }
  } else { // "4" – Catalogo: Base + Last Minute + Prenota Prima (senza Genius)
    if (r("CATALOG_LAST_MINUTE_RATE")>0){ total+=r("CATALOG_LAST_MINUTE_RATE"); parts.push(`Last Minute ${Math.round(r("CATALOG_LAST_MINUTE_RATE")*100)}%`); }
    if (r("CATALOG_EARLY_BOOKING_RATE")>0){ total+=r("CATALOG_EARLY_BOOKING_RATE"); parts.push(`Prenota Prima ${Math.round(r("CATALOG_EARLY_BOOKING_RATE")*100)}%`); }
  }
  return { rate: Math.min(total, 0.8), labels: parts };
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

  // Fee
  const AIRBNB_HOST = num(process.env.AIRBNB_HOST_FEE_RATE, 0.03);
  const AIRBNB_GUEST = num(process.env.AIRBNB_GUEST_FEE_RATE, 0.12);
  const BKNG_HOST = num(process.env.BOOKING_COMMISSION_RATE, 0.15);
  const BKNG_GUEST = num(process.env.BOOKING_GUEST_FEE_RATE, 0.00);
  const VRBO_HOST = num(process.env.VRBO_HOST_FEE_RATE, 0.08);
  const VRBO_GUEST = num(process.env.VRBO_GUEST_FEE_RATE, 0.10);

  // Regole esclusive già in uso
  const NS_ACTIVE = num(process.env.NOTTE_SINGOLA_ACTIVE, 1) === 1;
  const NS_MONTHS = csvSet(process.env.NOTTE_SINGOLA_MONTHS || 9);
  const NS_MAX = num(process.env.NOTTE_SINGOLA_MAX_NIGHTS, 6);
  const WEEKLY_MIN = num(process.env.WEEKLY_MIN_NIGHTS, 7);
  const WEEKLY_RATE = num(process.env.WEEKLY_RATE, 0.10);

  // Promo "normali" (usate SOLO se non si applica un'esclusiva sull'OTA)
  const EARLY = num(process.env.EARLY_BIRD_RATE, 0.10);
  const LASTM = num(process.env.LAST_MINUTE_RATE, 0.05);
  const dAhead = daysAhead(checkin);
  const mm = monthOf(checkin);

  const notteSingolaAirbnb = NS_ACTIVE && NS_MONTHS.has(mm) && nights <= NS_MAX && nights >= 2;

  // --- per ogni OTA stabilisco il "regime" ---
  function regimeFor(ota){
    if (nights >= WEEKLY_MIN) return "WEEKLY"; // vale per tutti, esclusivo
    if (ota==="Airbnb" && notteSingolaAirbnb) return "AIRBNB_NS";
    if (ota==="Booking.com" && bookingSingleNightApplicable({nights, checkin, env:process.env})) return "BOOKING_SN"; // markup
    return "NORMAL";
  }

  function compute(ota, hostFeeRate, guestFeeRate){
    const regime = regimeFor(ota);
    let disc = 0, offers = [];
    let netNight;

    if (regime === "WEEKLY"){
      disc += WEEKLY_RATE; offers.push(`Offerta 7+ notti ${Math.round(WEEKLY_RATE*100)}%`);
      netNight = +(BASE * (1 - Math.min(disc,0.8))).toFixed(2);
    } else if (regime === "AIRBNB_NS"){
      const r = airbnbNsRate(nights, process.env);
      if (r>0){ disc += r; offers.push(`Notte singola ${Math.round(r*100)}%`); }
      netNight = +(BASE * (1 - Math.min(disc,0.8))).toFixed(2);
    } else if (regime === "BOOKING_SN"){
      const m = num(process.env.BOOKING_SINGLE_NIGHT_MARKUP_RATE, 0.70);
      offers.push(`Notte singola (markup +${Math.round(m*100)}%)`);
      netNight = +(BASE * (1 + m)).toFixed(2); // MARKUP, non sconto
    } else {
      // NORMAL (no esclusiva): promo globali leggere +, e per Booking applico stack scelto
      if (dAhead > 30 && EARLY>0){ disc += EARLY; offers.push(`Early-bird ${Math.round(EARLY*100)}%`); }
      if (dAhead <= 7 && LASTM>0){ disc += LASTM; offers.push(`Last-minute ${Math.round(LASTM*100)}%`); }
      if (nights >= 7){ disc += 0.10; offers.push("Settimanale 10%"); }
      if (guests >= 4){ disc += 0.05; offers.push("Gruppi 5%"); }

      if (ota === "Booking.com"){
        const { rate, labels } = bookingStackDiscount(process.env);
        if (rate>0){ disc += rate; offers = offers.concat(labels); }
      }
      netNight = +(BASE * (1 - Math.min(disc,0.8))).toFixed(2);
    }

    const subtotal = netNight * nights + CLEANING;
    const taxes = +(subtotal * TAX_RATE).toFixed(2);
    const preOta = +(subtotal + taxes).toFixed(2);

    const guestFee = +(preOta * guestFeeRate).toFixed(2);
    const guestTotal = +(preOta + guestFee).toFixed(2);

    const hostFee = +(preOta * hostFeeRate).toFixed(2);
    const hostPayout = +(preOta - hostFee).toFixed(2);

    return {
      ota, regime, base_price_per_night: BASE,
      discounts_applied_rate: ota==="Booking.com" && regime==="BOOKING_SN" ? 0 : +disc.toFixed(3),
      offers_applied: offers,
      net_nightly: netNight,
      cleaning_fee: CLEANING, tax_rate: TAX_RATE,
      guest_fee_rate: guestFeeRate, guest_fee: guestFee, guest_total: guestTotal,
      host_fee_rate: hostFeeRate, host_fee: hostFee, host_payout: hostPayout
    };
  }

  const rows = [
    compute("Airbnb",      AIRBNB_HOST, AIRBNB_GUEST),
    compute("Booking.com", BKNG_HOST,   BKNG_GUEST),
    compute("Vrbo",        VRBO_HOST,   VRBO_GUEST),
  ];

  const body = {
    inputs: { checkin, nights, guests, days_ahead: dAhead, month: mm },
    currency: CURRENCY,
    rows,
    note: "Regole esclusive (Airbnb NS e Weekly). Booking: 'Notte singola' = markup, oppure stack sconti per MODE 1..4."
  };

  return { statusCode: 200, headers: {"Content-Type":"application/json"}, body: JSON.stringify(body) };
};
