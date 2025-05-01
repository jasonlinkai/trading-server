# 建構階段
FROM node:18-alpine AS builder

# 設置工作目錄
WORKDIR /app

# 複製 package.json 和 package-lock.json 以利用緩存
COPY package*.json ./

# 安裝依賴
RUN npm ci

# 複製源碼
COPY . .

# 編譯 TypeScript
RUN npm run build

# 生產階段
FROM node:18-alpine AS production

# 設置環境變數
ENV NODE_ENV=production

# 創建應用目錄
WORKDIR /app

# 從建構階段複製必要文件
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/dist ./dist

# 僅安裝生產依賴
RUN npm ci --only=production

# 非 root 用戶運行提高安全性
USER node

# 暴露服務端口（預設3000）
EXPOSE 3000

# 設置健康檢查
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

# 啟動應用
CMD ["node", "dist/index.js"] 