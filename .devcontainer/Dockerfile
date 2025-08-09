FROM node:20-bullseye

# Install system dependencies
RUN apt-get update && export DEBIAN_FRONTEND=noninteractive \
    && apt-get -y install --no-install-recommends \
        git \
        curl \
        wget \
        gnupg \
        ca-certificates \
        build-essential \
        python3 \
        python3-pip \
        vim \
        jq \
        zip \
        unzip

# Install global npm packages
RUN npm install -g \
    typescript \
    ts-node \
    prettier \
    eslint \
    nodemon

# Clean up
RUN apt-get autoremove -y && apt-get clean -y && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /workspace

USER node

EXPOSE 3000 3001 3002 3003

CMD ["sleep", "infinity"]