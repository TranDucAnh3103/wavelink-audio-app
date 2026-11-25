# ==============================================================================
# WaveLink Frontend Dockerfile - Multi-stage Vite + Nginx Alpine
# ==============================================================================

# STAGE 1: Build Production Assets
FROM node:20-alpine AS builder

WORKDIR /app

# Cache dependencies
COPY package.json package-lock.json ./
RUN npm ci || npm install

# Copy source code
COPY . .

# Hỗ trợ truyền dynamic API URL và các cấu hình phân trang khi build Docker image
ARG VITE_API_BASE_URL="https://wavelink-audio-app-backend-latest.onrender.com/api/v1"
ARG VITE_STREAM_BASE_URL=""
ARG VITE_AUDIO_ENGINE="stream"
ARG VITE_ITEMS_PER_PAGE="12"

ENV VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_STREAM_BASE_URL=$VITE_STREAM_BASE_URL \
    VITE_AUDIO_ENGINE=$VITE_AUDIO_ENGINE \
    VITE_ITEMS_PER_PAGE=$VITE_ITEMS_PER_PAGE 

# Build React Vite
RUN npm run build:vite

# ------------------------------------------------------------------------------
# STAGE 2: High Performance Nginx Static Server
FROM nginx:1.27-alpine AS runner

# Xóa cấu hình mặc định và nạp cấu hình tối ưu SPA + WebSocket Proxy
RUN rm -rf /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/nginx.conf

# Copy static assets sau khi build
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD wget -qO- http://localhost/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
