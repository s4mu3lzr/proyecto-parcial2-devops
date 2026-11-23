FROM node:20-alpine AS dependencies
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:20-alpine
ENV NODE_ENV=production
ENV PORT=80
ENV OTEL_EXPORTER_OTLP_ENDPOINT=http://3.22.114.176:5080/api/default
WORKDIR /app
RUN apk add --no-cache libstdc++
COPY --from=dependencies /app/node_modules ./node_modules
COPY package*.json ./
COPY server.js ./
COPY telemetry.js ./
COPY public ./public
EXPOSE 80
CMD ["node", "server.js"]
