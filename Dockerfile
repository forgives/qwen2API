# Stage 1: Build Frontend
FROM node:20-slim AS frontend-builder
WORKDIR /app
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Stage 2: Backend + Final Image
FROM python:3.10-slim
WORKDIR /workspace

# Install system dependencies required for headless Firefox (Camoufox)
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget \
    curl \
    ca-certificates \
    libx11-xcb1 \
    libx11-6 \
    libxcb1 \
    libxrandr2 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxext6 \
    libxkbcommon0 \
    libdbus-glib-1-2 \
    libdbus-1-3 \
    libxt6 \
    libgtk-3-0 \
    libasound2 \
    libpulse0 \
    libdrm2 \
    libgbm1 \
    libxshmfence1 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libpangocairo-1.0-0 \
    libcups2 \
    libnss3 \
    libnspr4 \
    libglib2.0-0 \
    fonts-liberation \
    fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/*

ENV PYTHONIOENCODING=utf-8
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

COPY backend/requirements.txt ./backend/
RUN pip install --no-cache-dir -r backend/requirements.txt

# Download Camoufox browser at build time
RUN python -m camoufox fetch

COPY backend/ ./backend/
COPY start.py ./
COPY --from=frontend-builder /app/dist ./frontend/dist

# Create data directory
RUN mkdir -p /workspace/data /workspace/logs

EXPOSE 7860

ENV PORT=7860
ENV FRONTEND_DIST_DIR=/workspace/frontend/dist
ENV ACCOUNTS_FILE=/workspace/data/accounts.json
ENV USERS_FILE=/workspace/data/users.json
ENV CAPTURES_FILE=/workspace/data/captures.json
ENV PYTHONPATH=/workspace

HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 \
    CMD curl -f http://localhost:${PORT}/healthz || exit 1

CMD ["python", "-m", "uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "7860", "--workers", "1"]
