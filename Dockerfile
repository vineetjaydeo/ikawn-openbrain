FROM node:20-alpine
# Install git + Chromium for puppeteer-core (HTML artifact -> PDF rendering)
RUN apk add --no-cache \
    git \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
WORKDIR /app
COPY package*.json ./
COPY packages/ ./packages/
RUN npm ci --only=production
RUN git config --global user.name "Lucy (OpenBrain)" && \
    git config --global user.email "lucy@ikawn.com" && \
    git config --global credential.helper '!f() { echo "username=x-access-token"; echo "password=$GITHUB_TOKEN"; }; f'
ARG CACHE_BUST=1
COPY src/ ./src/
COPY scripts/ ./scripts/
COPY docs/ ./docs/

# Build design-app
RUN cd src/design-app && npm install && npm run build

EXPOSE 3000
CMD ["node", "src/index.js"]
