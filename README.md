# Trading Server

這是一個基於 Node.js、Express 和 TypeScript 的交易服務器，部署在 Google Cloud Functions 上。

## 功能特點

- IP 白名單驗證
- 訂單 API 端點
- 環境變量配置

## 安裝

1. 克隆專案
2. 安裝依賴：
```bash
npm install
```

3. 複製環境變量文件：
```bash
cp .env.example .env
```

4. 編輯 `.env` 文件，填入必要的配置信息

## 開發

運行開發服務器：
```bash
npm run dev
```

## 構建

構建專案：
```bash
npm run build
```

## 執行
運行開發服務器：
```bash
npm run start
```

## API 端點

### POST /api/[exchange]/order

接收訂單請求的端點。

請求體格式：
```json
{
  "exchange": "{{exchange}}",
  "interval": "{{interval}}",
  "now": "{{timenow}}",
  "action": "{{strategy.order.action}}",
  "symbol": "{{ticker}}",
  "qty": "{{strategy.order.contracts}}",
  "price": "{{strategy.order.price}}",
  "take_profit": {
    "points": 900,
    "is_percentage": false
  },
  "stop_loss": {
    "points": 300,
    "is_percentage": false
  }
}
```