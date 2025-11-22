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

const SYMBOL_TO_COINGECKO: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  AVAX: "avalanche-2",
};

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

async function fetchCandlesAndStats(
  symbol: string,
): Promise<{ candles: Candle[]; info: PriceInfo } | null> {
  const id = SYMBOL_TO_COINGECKO[symbol.toUpperCase()];
  if (!id) return null;

  // 1-day OHLC data
  const ohlcUrl =
    `https://api.coingecko.com/api/v3/coins/${id}/ohlc?vs_currency=usd&days=1`;

  const res = await fetch(ohlcUrl);
  if (!res.ok) return null;

  const raw = (await res.json()) as [number, number, number, number, number][];

  if (!raw.length) return null;

  const candles: Candle[] = raw.map(([t, o, h, l, c]) => ({
    time: t,
    open: o,
    high: h,
    low: l,
    close: c,
  }));

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
}

type CandlestickChartProps = {
  candles: Candle[];
};

function CandlestickChart({ candles }: CandlestickChartProps) {
  if (!candles.length) {
    return (
      <div style={{ color: "#6b7280", fontSize: "0.85rem" }}>
        Waiting for market data…
      </div>
    );
  }

  const width = 640;
  const height = 260;
  const padX = 20;
  const padY = 10;
  const innerWidth = width - padX * 2;
  const innerHeight = height - padY * 2;

  const lows = candles.map(c => c.low);
  const highs = candles.map(c => c.high);
  const minPrice = Math.min(...lows);
  const maxPrice = Math.max(...highs);
  const priceSpan = maxPrice - minPrice || 1;

  const n = candles.length;
  const step = innerWidth / Math.max(n, 1);
  const bodyWidth = Math.max(step * 0.4, 4);

  const mapY = (price: number) =>
    padY + innerHeight - ((price - minPrice) / priceSpan) * innerHeight;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: "260px" }}>
      {/* grid lines */}
      <line
        x1={padX}
        y1={padY}
        x2={padX}
        y2={height - padY}
        stroke="#1f2933"
        strokeWidth={1}
      />
      <line
        x1={width - padX}
        y1={padY}
        x2={width - padX}
        y2={height - padY}
        stroke="#1f2933"
        strokeWidth={1}
      />
      <line
        x1={padX}
        y1={padY}
        x2={width - padX}
        y2={padY}
        stroke="#1f2933"
        strokeWidth={1}
      />
      <line
        x1={padX}
        y1={height - padY}
        x2={width - padX}
        y2={height - padY}
        stroke="#1f2933"
        strokeWidth={1}
      />

      {candles.map((candle, i) => {
        const xCenter = padX + step * (i + 0.5);
        const yOpen = mapY(candle.open);
        const yClose = mapY(candle.close);
        const yHigh = mapY(candle.high);
        const yLow = mapY(candle.low);

        const bullish = candle.close >= candle.open;
        const color = bullish ? "#22c55e" : "#f97373";
        const fill = bullish ? "rgba(34,197,94,0.25)" : "rgba(248,113,113,0.25)";

        const bodyTop = Math.min(yOpen, yClose);
        const bodyHeight = Math.max(Math.abs(yClose - yOpen), 3);

        return (
          <g key={candle.time}>
            {/* wick */}
            <line
              x1={xCenter}
              y1={yHigh}
              x2={xCenter}
              y2={yLow}
              stroke={color}
              strokeWidth={1.2}
            />
            {/* body */}
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

function App() {
  const [symbol, setSymbol] = useState("BTC");
  const [analysis, setAnalysis] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [activeSymbol, setActiveSymbol] = useState("BTC");
  const [priceInfo, setPriceInfo] = useState<PriceInfo | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [marketError, setMarketError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setAnalysis("");

    try {
      const res = await fetch("http://localhost:8000/api/crypto", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ symbol }),
      });

      if (!res.ok) {
        throw new Error("Request failed");
      }

      const data = await res.json();
      setAnalysis(data.analysis);
      setActiveSymbol(symbol.toUpperCase());
    } catch (err) {
      console.error(err);
      setError("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  };

  // Load candles + price whenever activeSymbol changes
  useEffect(() => {
    let cancelled = false;

    async function loadMarket() {
      setMarketError("");
      const res = await fetchCandlesAndStats(activeSymbol);
      if (!res) {
        if (!cancelled) {
          setMarketError("Unable to load market data for this symbol.");
          setCandles([]);
          setPriceInfo(null);
        }
        return;
      }
      if (cancelled) return;
      setCandles(res.candles);
      setPriceInfo(res.info);
    }

    loadMarket();

    return () => {
      cancelled = true;
    };
  }, [activeSymbol]);

  const changeClass =
    (priceInfo?.change24h ?? 0) >= 0 ? "live-change change-up" : "live-change change-down";

  const bands = (() => {
    if (!priceInfo) return null;
    const p = priceInfo.price;
    return {
      aggressiveBuy: p * 0.997,
      conservativeBuy: p * 0.994,
      takeProfit: p * 1.004,
      hardStop: p * 0.989,
    };
  })();

  return (
    <div className="app-container">
      <div className="app-content">
        {/* LEFT: analysis */}
        <div className="panel">
          <h1 className="panel-title">Zypher Crypto Tracker</h1>
          <p className="panel-subtitle">
            Type a crypto symbol and get a short analysis from your Zypher agent.
          </p>

          <form onSubmit={handleSubmit} className="form-row">
            <input
              className="input"
              value={symbol}
              onChange={e => setSymbol(e.target.value.toUpperCase())}
              placeholder="BTC, ETH, AVAX"
            />
            <button
              type="submit"
              className="button"
              disabled={loading || !symbol.trim()}
            >
              {loading ? "Thinking..." : "Analyze"}
            </button>
          </form>

          {error && <div className="error-box">{error}</div>}

          {loading && !analysis && (
            <div className="loading-text">
              Contacting the agent. This might take a few seconds.
            </div>
          )}

          {analysis && <div className="analysis-box">{analysis}</div>}
        </div>

        {/* RIGHT: full-height candlestick chart + bands */}
        <div className="right-panel">
          <div className="live-header">
            <div>
              <div className="live-meta">Live market</div>
              <div className="live-symbol">{activeSymbol} / USD</div>
            </div>
            <div>
              <div className="live-price">{formatDollar(priceInfo?.price)}</div>
              <div className={changeClass}>{formatPct(priceInfo?.change24h)} 24h</div>
            </div>
          </div>

          <div className="candles-wrapper">
            <CandlestickChart candles={candles} />
            <div className="candles-caption">
              Intraday OHLC snapshot (CoinGecko, 1-day window)
            </div>
          </div>

          <div className="scalp-box">
            <div className="scalp-title">Intraday scalping bands</div>
            {bands ? (
              <ul className="scalp-list">
                <li>
                  <strong>Aggressive entry:</strong> {formatDollar(bands.aggressiveBuy)}
                </li>
                <li>
                  <strong>Conservative entry:</strong> {formatDollar(bands.conservativeBuy)}
                </li>
                <li>
                  <strong>Take-profit zone:</strong> {formatDollar(bands.takeProfit)}
                </li>
                <li>
                  <strong>Hard stop:</strong> {formatDollar(bands.hardStop)}
                </li>
              </ul>
            ) : (
              <div style={{ color: "#6b7280", fontSize: "0.85rem" }}>
                Scalping levels will appear once market data loads.
              </div>
            )}
            <div className="scalp-footer">
              These levels are simple percentage offsets for demo purposes and are{" "}
              <strong>not trading advice</strong>.
            </div>
            {marketError && (
              <div style={{ marginTop: "0.4rem", color: "#f97373", fontSize: "0.8rem" }}>
                {marketError}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
