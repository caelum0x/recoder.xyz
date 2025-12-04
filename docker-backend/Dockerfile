FROM node:20-slim

WORKDIR /app

# Install Docker CLI (to communicate with host Docker)
RUN apt-get update && apt-get install -y \
    docker.io \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

EXPOSE 3100

CMD ["npm", "start"]
