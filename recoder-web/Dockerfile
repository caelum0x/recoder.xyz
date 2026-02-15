FROM node:20-slim

WORKDIR /app

# Copy pre-built output and server
COPY build ./build
COPY server.js ./
COPY package.json ./
COPY .env* ./

# Use npm for flat node_modules (Remix server build has unbundled external imports)
RUN npm install --legacy-peer-deps

EXPOSE 5173

CMD ["node", "server.js"]
