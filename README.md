# Zypher Crypto Agent Dashboard

A full-stack crypto analysis dashboard.  
This project demonstrates a **Zypher AI Agent** (Claude Sonnet 4) integrated with a modern React UI featuring a live candlestick chart, price feed, and short-term trading insights.

Backend is **pure ZypherAgent**.  
Frontend is **React + Vite**.

---

## 📁 Project Structure

│

├── backend/ # Deno + ZypherAgent server

│ ├── server.ts

│ ├── deno.json

│ └── .zypher/ # auto-created locally

│

└── frontend/ # React dashboard with candlestick chart

├── src/

│ ├── App.tsx

│ ├── App.css

├── package.json


---

## 🚀 Features

### Backend (Deno + Zypher)
- Pure **ZypherAgent.runTask** with event streaming  
- Uses **Claude Sonnet 4 (`claude-sonnet-4-20250514`)**  
- Streams tokens via `rxjs-for-await`  
- Clean `/api/crypto` endpoint  
- Windows-safe manual ZypherContext (no home directory issues)

### Frontend (React)
- Token input (BTC / ETH / AVAX / SOL / etc.)
- Live OHLC candlestick chart (CoinGecko API)
- Realtime prices + 24h change
- Auto-generated scalping bands
- Modern, clean dashboard UI

---

## 🔧 Requirements

- **Deno ≥ 2**
- **Node.js ≥ 18**
- npm or yarn

---

## 🔑 Environment Variables

Create a `.env` inside **backend/**:
OR there should a env file, just rename it to .env and replace your API KEY

---

## ▶️ Running the Backend

Inside the **backend/** directory:

```bash
deno run -A server.ts
```

Expected output:
```
🚀 Zypher backend running at http://localhost:8000/
```
API route:

POST /api/crypto


Body:

{ "symbol": "BTC" }


## ▶️ Running the Frontend

Inside frontend/:
```
npm install
npm run dev
```

Vite starts at:
```
http://localhost:5173/
```

The frontend automatically communicates with localhost:8000.


## 📦 Tech Stack

Backend:

Deno

ZypherAgent

RxJS for async streaming

Frontend:

React

Vite

Custom SVG candlestick rendering

CoinGecko market data
