# C++ Code Execution Container
FROM gcc:13-alpine

# Install security and build tools
RUN apk add --no-cache \
    dumb-init \
    su-exec \
    clang \
    clang-dev \
    make \
    cmake \
    ninja \
    gdb \
    valgrind \
    boost-dev \
    fmt-dev \
    catch2 \
    jq \
    git

# Create non-root user for security
RUN addgroup -g 1001 -S coderunner && \
    adduser -S coderunner -u 1001 -G coderunner

# Set up workspace
WORKDIR /workspace
RUN chown -R coderunner:coderunner /workspace

# Install vcpkg for package management
RUN git clone https://github.com/Microsoft/vcpkg.git /opt/vcpkg && \
    cd /opt/vcpkg && \
    ./bootstrap-vcpkg.sh && \
    ln -s /opt/vcpkg/vcpkg /usr/local/bin/vcpkg

# Install common C++ libraries via vcpkg
RUN vcpkg install \
    fmt \
    spdlog \
    nlohmann-json \
    catch2 \
    boost-algorithm \
    boost-filesystem \
    eigen3

# Copy execution scripts
COPY entrypoint.sh /entrypoint.sh
COPY runner.sh /runner.sh
RUN chmod +x /entrypoint.sh /runner.sh

# Set C++ environment
ENV CXX=g++
ENV CC=gcc
ENV CMAKE_TOOLCHAIN_FILE=/opt/vcpkg/scripts/buildsystems/vcpkg.cmake

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["/entrypoint.sh"]
