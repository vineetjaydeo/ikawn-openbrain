FROM node:20-alpine
RUN apk add --no-cache git
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
RUN git config --global user.name "Lucy (OpenBrain)" && \
    git config --global user.email "lucy@ikawn.com"
ARG CACHE_BUST=1
COPY src/ ./src/
COPY scripts/ ./scripts/
COPY docs/ ./docs/
EXPOSE 3000
CMD ["node", "src/index.js"]
