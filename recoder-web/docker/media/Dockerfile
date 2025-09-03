# FFmpeg Docker container for media processing
FROM ubuntu:22.04

# Avoid prompts from apt
ENV DEBIAN_FRONTEND=noninteractive

# Install dependencies
RUN apt-get update && apt-get install -y \
    software-properties-common \
    curl \
    wget \
    python3 \
    python3-pip \
    nodejs \
    npm \
    && rm -rf /var/lib/apt/lists/*

# Add FFmpeg PPA for latest version
RUN add-apt-repository ppa:savoury1/ffmpeg5 -y

# Install FFmpeg with all codecs
RUN apt-get update && apt-get install -y \
    ffmpeg \
    x264 \
    x265 \
    libvpx-dev \
    libmp3lame-dev \
    libopus-dev \
    libvorbis-dev \
    libtheora-dev \
    libx264-dev \
    libx265-dev \
    libvpx-dev \
    libfdk-aac-dev \
    libopenjp2-7-dev \
    && rm -rf /var/lib/apt/lists/*

# Install additional tools for media processing
RUN apt-get update && apt-get install -y \
    imagemagick \
    exiftool \
    mediainfo \
    sox \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install Node.js dependencies
RUN npm install

# Copy application code
COPY . .

# Create directories for media processing
RUN mkdir -p /app/uploads /app/output /app/temp

# Set permissions
RUN chmod -R 755 /app

# Expose port for the worker service
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3001/health || exit 1

# Start the media processing worker
CMD ["node", "media-worker.js"]
