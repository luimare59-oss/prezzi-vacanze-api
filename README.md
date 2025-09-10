# Holiday Pricing API — Netlify Functions

Questa è una piccola API serverless su Netlify Functions.

## Endpoints disponibili
- `/api/health`
- `/api/price?checkin=2025-09-20&nights=3&guests=2`

## Variabili d'ambiente (opzionali)
- `BASE_PRICE_PER_NIGHT` (default 100)
- `CLEANING_FEE` (default 40)
- `TAX_RATE` (default 0.05)
- `CURRENCY` (default EUR)
