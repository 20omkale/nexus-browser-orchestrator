# BLD Browser Control — Chromium Container
# Architecture: Chromium (127.0.0.1:9222) + socat proxy (0.0.0.0:9223)
# socat bridges the internal CDP binding to a Docker-accessible port

FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y \
    chromium \
    socat \
    curl \
    dos2unix \
    fonts-liberation \
    fonts-noto-color-emoji \
    libnss3 \
    libatk-bridge2.0-0 \
    libdrm2 \
    libxkbcommon0 \
    libgbm1 \
    libasound2 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Non-root user
RUN groupadd -r chrome && useradd -r -g chrome -G audio,video chrome \
    && mkdir -p /home/chrome/data && chown -R chrome:chrome /home/chrome

COPY start.sh /home/chrome/start.sh

# Fix Windows line endings (CRLF->LF) and make executable
RUN dos2unix /home/chrome/start.sh \
    && chmod +x /home/chrome/start.sh \
    && chown chrome:chrome /home/chrome/start.sh

USER chrome
WORKDIR /home/chrome

# 9223 = socat proxy port (reachable via Docker port mapping from host)
EXPOSE 9223

CMD ["/home/chrome/start.sh"]
