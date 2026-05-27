# STAGE 1: Build TypeScript Code
FROM node:20-slim AS builder

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src
COPY server.ts ./

RUN npm run build


# STAGE 2: Run Production Server
FROM node:20-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=80

COPY package*.json ./

RUN npm ci --omit=dev

COPY --from=builder /app/build ./build
 
COPY *.html ./

EXPOSE 80

CMD ["npm", "start"]
