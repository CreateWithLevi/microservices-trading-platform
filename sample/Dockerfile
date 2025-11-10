# 範例：一個用於 Node.js TypeScript 應用的 Dockerfile

# --- 階段 1: Build ---
# 使用一個包含完整 Node.js 和 npm 的基礎映像
FROM node:18-alpine AS builder

WORKDIR /app

# 複製 package.json 和 lock 檔案
COPY package*.json ./

# 安裝所有依賴 (包含 devDependencies)
RUN npm install

# 複製所有原始碼
COPY . .

# 編譯 TypeScript
RUN npm run build

# --- 階段 2: Production ---
# 使用一個更小的 alpine 基礎映像
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./

# 僅安裝 production 依賴
RUN npm install --omit=dev

# 從 'builder' 階段複製編譯好的 JavaScript 檔案
# 'dist' 是 TypeScript 編譯後的輸出目錄
COPY --from=builder /app/dist ./dist

# 暴露應用程式運行的端口
EXPOSE 3000

# 啟動應用程式
CMD [ "node", "dist/index.js" ]