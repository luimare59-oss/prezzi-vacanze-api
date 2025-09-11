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

function computeRows({checkin, nights, guests, env}){
  const BASE = num(env.BASE_PRICE_PER_NIGHT, 100);
  const CLEANING = num(env.CLEANING_FEE, 40);
  const TAX_RATE = num(env.TAX_RATE, 0.05);
  const CURRENCY = env.CURRENCY || "EUR";

  const EARLY = num(env.EARLY_BIRD_RATE, 0.10);
  const LASTM = num(env.LAST_MINUTE_RATE, 0.05);

  const AIRBNB_HOST = num(env.AIRBNB_HOST_FEE_RATE, 0.03);
  const AIRBNB_GUEST = num(env.AIRBNB_GUEST_FEE_RATE, 0.12);
  const BKNG_HOST = num(env.BOOKING_COMMISSION_RATE, 0.15);
  const BKNG_GUEST = num(env.BOOKING_GUEST_FEE_RATE, 0.00);
  const VRBO_HOST = num(env.VRBO_HOST_FEE_RATE, 0.08);
  const VRBO_GUEST = num(env.VRBO_GUEST_FEE_RATE, 0.10);

  const NS_ACTIVE = num(env.NOTTE_SINGOLA_ACTIVE, 1) === 1;
  const NS_MONTHS = csvToSet(env.NOTTE_SINGOLA_MONTHS || 9);
  const NS_MAX = num(env.NOTTE_SINGOLA_MAX_NIGHTS, 6);
  const WEEKLY_MIN = num(env.WEEKLY_MIN_NIGHTS, 7);
  const WEEKLY_RATE = num(env.WEEKLY_RATE, 0.10);

  const dAhead = daysAhead(checkin);
  const mm = monthOf(checkin);

  const notteSingolaApplicable = NS_ACTIVE && NS_MONTHS.has(mm) && nights <= NS_MAX && nights >= 2;
  const weeklyApplicable = !notteSingolaApplicable && nights >= WEEKLY_MIN;
  const regime = notteSingolaApplicable ? "NS" : (weeklyApplicable ? "WEEKLY" : "NORMAL");

  function row(ota, hostFeeRate, guestFeeRate){
    let discRate = 0;
    const offers = [];
    if (regime === "NS" && ota==="Airbnb"){
      const r = airbnbNotteSingolaRate(nights, env);
      if (r>0){ discRate += r; offers.push(`Notte singola ${Math.round(r*100)}%`); }
    } else if (regime === "WEEKLY"){
      if (WEEKLY_RATE>0){ discRate += WEEKLY_RATE; offers.push(`Offerta 7+ notti ${Math.round(WEEKLY_RATE*100)}%`); }
    } else {
      if (dAhead > 30 && EARLY > 0){ discRate += EARLY; offers.push(`Early-bird ${Math.round(EARLY*100)}%`); }
      if (dAhead <= 7 && LASTM > 0){ discRate += LASTM; offers.push(`Last-minute ${Math.round(LASTM*100)}%`); }
      if (nights >= 7){ discRate += 0.10; offers.push("Settimanale 10%"); }
      if (guests >= 4){ discRate += 0.05; offers.push("Gruppi 5%"); }
    }
    discRate = Math.min(discRate, 0.80);

    const netNight  = +(BASE*(1-discRate)).toFixed(2);
    const subtotal  = netNight * nights + CLEANING;
    const taxes     = +(subtotal * TAX_RATE).toFixed(2);
    const preOta    = +(subtotal + taxes).toFixed(2);

    const guestFee  = +(preOta * guestFeeRate).toFixed(2);
    const guestTot  = +(preOta + guestFee).toFixed(2);
    const hostFee   = +(preOta * hostFeeRate).toFixed(2);
    const hostPay   = +(preOta - hostFee).toFixed(2);

    return {
      OTA: ota, Checkin: checkin, Notti: nights, Ospiti: guests,
      "Prezzo base notte": BASE,
      "Sconti tot %": +discRate.toFixed(3),
      "Offerte applicate": offers.join(" + "),
      "Notte netta": netNight,
      "Cleaning": CLEANING,
      "Tasse %": TAX_RATE,
      "Fee ospite %": guestFeeRate,
      "Fee ospite €": guestFee,
      "Totale ospite": guestTot,
      "Fee host %": hostFeeRate,
      "Fee host €": hostFee,
      "Payout host": hostPay,
      Valuta: CURRENCY,
      Regime: regime
    };
  }

  return [
    row("Airbnb", AIRBNB_HOST, AIRBNB_GUEST),
    row("Booking.com", BKNG_HOST, BKNG_GUEST),
    row("Vrbo", VRBO_HOST, VRBO_GUEST)
  ];
}

function toCSV(rows){
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const esc = s => { if (s==null) return ""; s=String(s); return /[",\n,;]/.test(s)?`"${s.replace(/"/g,'""')}"`:s; };
  return [ headers.join(","), ...rows.map(r=>headers.map(h=>esc(r[h])).join(",")) ].join("\n");
}

export const handler = async (event) => {
  const q=event.queryStringParameters||{};
  const checkin = q.checkin || new Date(Date.now()+7*24*60*60*1000).toISOString().slice(0,10);
  const nights  = num(q.nights,3);
  const guests  = num(q.guests,2);
  const format  = (q.format||"json").toLowerCase();

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
      NOTTE_SINGOLA_ACTIVE: process.env.NOTTE_SINGOLA_ACTIVE,
      NOTTE_SINGOLA_MONTHS: process.env.NOTTE_SINGOLA_MONTHS,
      NOTTE_SINGOLA_MAX_NIGHTS: process.env.NOTTE_SINGOLA_MAX_NIGHTS,
      NS_TIER_2N: process.env.NS_TIER_2N,
      NS_TIER_3N: process.env.NS_TIER_3N,
      NS_TIER_4N: process.env.NS_TIER_4N,
      NS_TIER_5N: process.env.NS_TIER_5N,
      NS_TIER_6N: process.env.NS_TIER_6N,
      WEEKLY_MIN_NIGHTS: process.env.WEEKLY_MIN_NIGHTS,
      WEEKLY_RATE: process.env.WEEKLY_RATE,
    }
  });

  if (format==="csv"){
    return { statusCode:200, headers:{
      "Content-Type":"text/csv; charset=utf-8",
      "Content-Disposition":`inline; filename="compare_${checkin}_${nights}n_${guests}g.csv"`
    }, body: toCSV(rows) };
  }
  return { statusCode:200, headers:{"Content-Type":"application/json"}, body: JSON.stringify(rows) };
};
