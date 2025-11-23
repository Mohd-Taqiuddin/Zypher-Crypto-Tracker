import { useEffect, useState } from "react";
import "./App.css";

type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

type PriceInfo = {
  price: number;
  change24h: number;
};

const API_URL = "http://localhost:8000/api/crypto";

// ---------- helpers ----------

function formatDollar(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "-";
  return `$${n.toLocaleString(undefined, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })}`;
}

function formatPct(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "-";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

// call your Zypher backend
async function fetchAnalysis(symbol: string): Promise<string> {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ symbol }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Backend error");
  }

  return data.analysis || "Agent did not return any text.";
}

// ---------- CoinGecko helpers (frontend only) ----------

// Resolve a token symbol -> CoinGecko ID
async function resolveCoinId(symbol: string): Promise<string | null> {
  const q = symbol.trim();
  if (!q) return null;

  const url = `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(
    q,
  )}`;

  console.log("[CG] search:", url);

  const res = await fetch(url);
  if (!res.ok) {
    console.log("[CG] search status:", res.status, res.statusText);
    return null;
  }

  const data = await res.json();
  const coins: any[] = data?.coins || [];
  if (!coins.length) {
    console.log("[CG] search: no coins for", symbol);
    return null;
  }

  const upper = symbol.toUpperCase();

  const exact = coins.find(
    c => typeof c.symbol === "string" && c.symbol.toUpperCase() === upper,
  );

  const id = exact?.id ?? coins[0]?.id ?? null;

  console.log("[CG] resolved", symbol, "->", id);
  return id;
}

// Fetch OHLC candles + basic price info from CoinGecko
async function fetchCandlesAndStatsFromCoinGecko(
  symbol: string,
): Promise<{ candles: Candle[]; info: PriceInfo } | null> {
  const id = await resolveCoinId(symbol);
  if (!id) return null;

  try {
    // Primary source: OHLC endpoint (true candles, free tier)
    const ohlcUrl = `https://api.coingecko.com/api/v3/coins/${id}/ohlc?vs_currency=usd&days=1`;
    console.log("[CG] ohlc:", ohlcUrl);

    const ohlcRes = await fetch(ohlcUrl);
    console.log("[CG] ohlc status:", ohlcRes.status, ohlcRes.statusText);

    let candles: Candle[] = [];

    if (ohlcRes.ok) {
      const raw = (await ohlcRes.json()) as [
        number,
        number,
        number,
        number,
        number
      ][];
      if (Array.isArray(raw) && raw.length > 0) {
        candles = raw.map(([t, o, h, l, c]) => ({
          time: t,
          open: o,
          high: h,
          low: l,
          close: c,
        }));
      } else {
        console.log("[CG] ohlc: empty array for", id);
      }
    } else {
      const text = await ohlcRes.text().catch(() => "");
      console.log("[CG] ohlc error body:", text);
    }

    // Fallback: market_chart if OHLC is empty for some reason
    if (!candles.length) {
      const mcUrl = `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=2`;
      console.log("[CG] market_chart fallback:", mcUrl);

      const res = await fetch(mcUrl);
      console.log("[CG] market_chart status:", res.status, res.statusText);

      if (!res.ok) return null;

      const data = await res.json();
      const prices: [number, number][] = data?.prices || [];
      if (!Array.isArray(prices) || !prices.length) return null;

      const recent = prices.slice(-48);

      candles = recent.map(([t, p]) => ({
        time: t,
        open: p,
        high: p,
        low: p,
        close: p,
      }));
    }

    if (!candles.length) return null;

    const first = candles[0];
    const last = candles[candles.length - 1];
    const priceNow = last.close;
    const priceStart = first.open;
    const change24h =
      priceStart > 0 ? ((priceNow - priceStart) / priceStart) * 100 : 0;

    return {
      candles,
      info: { price: priceNow, change24h },
    };
  } catch (e) {
    console.error("[CG] market data failed for", symbol, e);
    return null;
  }
}

// ---------- chart component ----------

function CandlestickChart({ candles }: { candles: Candle[] }) {
  if (!candles.length) {
    return (
      <div style={{ color: "#6b7280", fontSize: "0.85rem" }}>
        No chart data available.
      </div>
    );
  }

  const width = 640;
  const height = 260;
  const padLeft = 55;
  const padRight = 20;
  const padTop = 10;
  const padBottom = 20;
  const innerWidth = width - padLeft - padRight;
  const innerHeight = height - padTop - padBottom;

  const lows = candles.map(c => c.low);
  const highs = candles.map(c => c.high);
  const minPrice = Math.min(...lows);
  const maxPrice = Math.max(...highs);
  const span = maxPrice - minPrice || 1;

  const mapY = (p: number) =>
    padTop + innerHeight - ((p - minPrice) / span) * innerHeight;

  const step = innerWidth / Math.max(candles.length, 1);
  const bodyWidth = Math.max(step * 0.5, 5); // a bit wider so they’re visible

  const levels = 4;
  const ticks = Array.from({ length: levels + 1 }, (_, i) => {
    const ratio = i / levels;
    const price = minPrice + (1 - ratio) * span;
    const y = mapY(price);
    return { y, price };
  });

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      style={{ width: "100%", height: "260px" }}
    >
      {ticks.map((t, idx) => (
        <g key={idx}>
          <line
            x1={padLeft}
            y1={t.y}
            x2={width - padRight}
            y2={t.y}
            stroke="#111827"
            strokeWidth={1}
            strokeDasharray="3 4"
          />
          <text
            x={padLeft - 8}
            y={t.y + 3}
            textAnchor="end"
            fontSize="10"
            fill="#6b7280"
          >
            {t.price.toLocaleString(undefined, {
              maximumFractionDigits: t.price > 100 ? 0 : 2,
            })}
          </text>
        </g>
      ))}

      <rect
        x={padLeft}
        y={padTop}
        width={innerWidth}
        height={innerHeight}
        fill="none"
        stroke="#1f2937"
        strokeWidth={1}
        rx={4}
      />

      {candles.map((c, i) => {
        const xCenter = padLeft + step * (i + 0.5);
        const yOpen = mapY(c.open);
        const yClose = mapY(c.close);
        const yHigh = mapY(c.high);
        const yLow = mapY(c.low);

        const bullish = c.close >= c.open;
        const color = bullish ? "#22c55e" : "#f97373";
        const fill = bullish ? "rgba(34,197,94,0.25)" : "rgba(248,113,113,0.25)";

        const bodyTop = Math.min(yOpen, yClose);
        const bodyHeight = Math.max(Math.abs(yClose - yOpen), 6); // minimum height so bodies don’t vanish

        return (
          <g key={c.time}>
            <line
              x1={xCenter}
              y1={yHigh}
              x2={xCenter}
              y2={yLow}
              stroke={color}
              strokeWidth={1.2}
            />
            <rect
              x={xCenter - bodyWidth / 2}
              y={bodyTop}
              width={bodyWidth}
              height={bodyHeight}
              fill={fill}
              stroke={color}
              strokeWidth={1}
              rx={1.5}
            />
          </g>
        );
      })}
    </svg>
  );
}

// ---------- main app ----------

function App() {
  const [inputSymbol, setInputSymbol] = useState("BTC");
  const [activeSymbol, setActiveSymbol] = useState<string>('');

  const [analysis, setAnalysis] = useState("");
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  const [error, setError] = useState("");

  const [candles, setCandles] = useState<Candle[]>([]);
  const [priceInfo, setPriceInfo] = useState<PriceInfo | null>(null);
  const [marketError, setMarketError] = useState("");

  // fetch chart + price only after Analyze (activeSymbol changes)
  useEffect(() => {
    if (!activeSymbol) return;

    let cancelled = false;

    async function loadMarket() {
      setMarketError("");
      setCandles([]);
      setPriceInfo(null);

      const result = await fetchCandlesAndStatsFromCoinGecko(activeSymbol);
      if (!result) {
        if (!cancelled) {
          setMarketError(
            `No market data available on CoinGecko for ${activeSymbol.toUpperCase()}. ` +
              `Check the browser console for CoinGecko logs.`,
          );
        }
        return;
      }

      if (cancelled) return;

      setCandles(result.candles);
      setPriceInfo(result.info);
    }

    loadMarket();

    return () => {
      cancelled = true;
    };
  }, [activeSymbol]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const symbol = inputSymbol.trim().toUpperCase();
    if (!symbol) return;

    setError("");
    setAnalysis("");
    setLoadingAnalysis(true);

    try {
      const result = await fetchAnalysis(symbol);
      setAnalysis(result);
      setActiveSymbol(symbol); // trigger CoinGecko fetch
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Failed to fetch analysis.");
    } finally {
      setLoadingAnalysis(false);
    }
  };

  const bands = (() => {
    if (!priceInfo) return null;
    const p = priceInfo.price;
    return {
      aggressiveBuy: p * 0.998,
      conservativeBuy: p * 0.995,
      takeProfit: p * 1.004,
      hardStop: p * 0.992,
    };
  })();

  const displaySymbol = (activeSymbol || inputSymbol).toUpperCase();
  const changeClass =
    (priceInfo?.change24h ?? 0) >= 0
      ? "live-change change-up"
      : "live-change change-down";

  return (
    <div className="app-container">
      <div className="app-content">
        {/* LEFT: Zypher agent */}
        <div className="panel">
          <h1 className="panel-title">Zypher Crypto Tracker</h1>
          <p className="panel-subtitle">
            Type a crypto symbol and get a short analysis from your Zypher agent.
            Charts and scalping bands use live USD data from CoinGecko.
          </p>

          <form onSubmit={handleSubmit} className="form-row">
            <input
              className="input"
              value={inputSymbol}
              onChange={e => setInputSymbol(e.target.value.toUpperCase())}
              placeholder="BTC, ETH, AVAX, SOL..."
            />
            <button
              type="submit"
              className="button"
              disabled={loadingAnalysis || !inputSymbol.trim()}
            >
              {loadingAnalysis ? "Thinking..." : "Analyze"}
            </button>
          </form>

          {error && <div className="error-box">{error}</div>}

          {loadingAnalysis && !analysis && (
            <div className="loading-text">
              Contacting the agent. This might take a few seconds.
            </div>
          )}

          {analysis && <div className="analysis-box">{analysis}</div>}
        </div>

        {/* RIGHT: live chart + scalping */}
        <div className="right-panel">
          <div className="live-header">
            <div>
              <div className="live-meta">Live market</div>
              <div className="live-symbol">{displaySymbol} / USD</div>
            </div>
            <div>
              <div className="live-price">{formatDollar(priceInfo?.price)}</div>
              {activeSymbol && (
                <div className={changeClass}>
                  {formatPct(priceInfo?.change24h)} 24h
                </div>
              )}
            </div>
          </div>

          <div className="candles-wrapper">
            {!activeSymbol ? (
              <div style={{ color: "#6b7280", fontSize: "0.85rem" }}>
                Run an analysis to load live market data.
              </div>
            ) : marketError ? (
              <div style={{ color: "#f97373", fontSize: "0.85rem" }}>
                {marketError}
              </div>
            ) : (
              <CandlestickChart candles={candles} />
            )}

            {activeSymbol && !marketError && (
              <div className="candles-caption">
                Intraday OHLC snapshot (CoinGecko, ~1-day window). Data from{" "}
                <a
                  href="https://www.coingecko.com/"
                  target="_blank"
                  rel="noreferrer"
                >
                  CoinGecko
                </a>
                .
              </div>
            )}
          </div>

          {activeSymbol && (
            <div className="scalp-box">
              <div className="scalp-title">Intraday scalping bands</div>
              {bands ? (
                <ul className="scalp-list">
                  <li>
                    <strong>Aggressive entry:</strong>{" "}
                    {formatDollar(bands.aggressiveBuy)}
                  </li>
                  <li>
                    <strong>Conservative entry:</strong>{" "}
                    {formatDollar(bands.conservativeBuy)}
                  </li>
                  <li>
                    <strong>Take-profit zone:</strong>{" "}
                    {formatDollar(bands.takeProfit)}
                  </li>
                  <li>
                    <strong>Hard stop:</strong>{" "}
                    {formatDollar(bands.hardStop)}
                  </li>
                </ul>
              ) : (
                <div style={{ color: "#6b7280", fontSize: "0.85rem" }}>
                  Scalping levels will appear once price data loads.
                </div>
              )}
              <div className="scalp-footer">
                These levels are simple percentage offsets for demo purposes and are{" "}
                <strong>not trading advice</strong>.
              </div>
              {marketError && (
                <div
                  style={{
                    marginTop: "0.4rem",
                    color: "#f97373",
                    fontSize: "0.8rem",
                  }}
                >
                  {marketError}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
