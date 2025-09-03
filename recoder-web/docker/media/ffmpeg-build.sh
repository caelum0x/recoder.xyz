#!/bin/bash

# FFmpeg build script with essential codecs for recoder.xyz media processing

set -e

# Build variables
FFMPEG_VERSION="6.0"
PREFIX="/usr/local"
PKG_CONFIG_PATH="$PREFIX/lib/pkgconfig"
MAKEFLAGS="-j$(nproc)"

# Create build directory
mkdir -p /tmp/ffmpeg-build
cd /tmp/ffmpeg-build

echo "Building FFmpeg with essential codecs for recoder.xyz..."

# Download and build x264
echo "Building x264..."
git clone --depth 1 https://code.videolan.org/videolan/x264.git
cd x264
./configure --prefix="$PREFIX" --enable-static --enable-pic
make $MAKEFLAGS
make install
cd ..

# Download and build x265
echo "Building x265..."
wget -O x265.tar.bz2 https://bitbucket.org/multicoreware/x265_git/downloads/x265_3.5.tar.bz2
tar xjf x265.tar.bz2
cd x265_*/build/linux
cmake -G "Unix Makefiles" -DCMAKE_INSTALL_PREFIX="$PREFIX" -DENABLE_SHARED=off ../../source
make $MAKEFLAGS
make install
cd ../../..

# Download and build libvpx
echo "Building libvpx..."
git clone --depth 1 https://chromium.googlesource.com/webm/libvpx.git
cd libvpx
./configure --prefix="$PREFIX" --disable-examples --disable-unit-tests --enable-vp9-highbitdepth --as=yasm
make $MAKEFLAGS
make install
cd ..

# Download and build libmp3lame
echo "Building libmp3lame..."
wget -O lame.tar.gz http://downloads.sourceforge.net/project/lame/lame/3.100/lame-3.100.tar.gz
tar xzf lame.tar.gz
cd lame-3.100
./configure --prefix="$PREFIX" --enable-nasm --disable-shared
make $MAKEFLAGS
make install
cd ..

# Download and build libopus
echo "Building libopus..."
wget -O opus.tar.gz https://archive.mozilla.org/pub/opus/opus-1.3.1.tar.gz
tar xzf opus.tar.gz
cd opus-1.3.1
./configure --prefix="$PREFIX" --disable-shared
make $MAKEFLAGS
make install
cd ..

# Download and build FFmpeg
echo "Building FFmpeg..."
wget -O ffmpeg.tar.bz2 https://ffmpeg.org/releases/ffmpeg-${FFMPEG_VERSION}.tar.bz2
tar xjf ffmpeg.tar.bz2
cd ffmpeg-${FFMPEG_VERSION}

./configure \
  --prefix="$PREFIX" \
  --pkg-config-flags="--static" \
  --extra-cflags="-I$PREFIX/include" \
  --extra-ldflags="-L$PREFIX/lib" \
  --extra-libs="-lpthread -lm" \
  --bindir="$PREFIX/bin" \
  --enable-gpl \
  --enable-libmp3lame \
  --enable-libopus \
  --enable-libvorbis \
  --enable-libvpx \
  --enable-libx264 \
  --enable-libx265 \
  --enable-nonfree \
  --enable-pic \
  --enable-static \
  --disable-debug \
  --disable-shared \
  --disable-ffplay \
  --disable-doc \
  --extra-cflags="-O3 -fPIC"

make $MAKEFLAGS
make install

# Verify installation
echo "Verifying FFmpeg installation..."
ffmpeg -version
ffprobe -version

echo "FFmpeg build completed successfully!"

# Cleanup
cd /
rm -rf /tmp/ffmpeg-build

echo "Build artifacts cleaned up."
