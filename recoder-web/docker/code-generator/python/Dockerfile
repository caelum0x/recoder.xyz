# Python Code Execution Container
FROM python:3.11-alpine

# Install security and build tools
RUN apk add --no-cache \
    dumb-init \
    su-exec \
    gcc \
    g++ \
    make \
    musl-dev \
    libffi-dev \
    openssl-dev \
    git

# Create non-root user for security
RUN addgroup -g 1001 -S coderunner && \
    adduser -S coderunner -u 1001 -G coderunner

# Set up workspace
WORKDIR /workspace
RUN chown -R coderunner:coderunner /workspace

# Install popular Python packages
RUN pip install --no-cache-dir \
    numpy \
    pandas \
    matplotlib \
    seaborn \
    requests \
    beautifulsoup4 \
    scrapy \
    flask \
    django \
    fastapi \
    sqlalchemy \
    pytest \
    black \
    flake8 \
    mypy \
    jupyter \
    ipython \
    scipy \
    scikit-learn \
    pillow \
    opencv-python-headless \
    lxml \
    pydantic \
    httpx \
    aiohttp \
    asyncio \
    pathlib \
    dataclasses \
    typing-extensions

# Install PyPy
RUN wget https://downloads.python.org/pypy/pypy3.10-v7.3.12-linux64.tar.bz2 && \
    tar -xjf pypy3.10-v7.3.12-linux64.tar.bz2 && \
    mv pypy3.10-v7.3.12-linux64 /opt/pypy && \
    ln -s /opt/pypy/bin/pypy3 /usr/local/bin/pypy3 && \
    rm pypy3.10-v7.3.12-linux64.tar.bz2

# Copy execution scripts
COPY entrypoint.sh /entrypoint.sh
COPY execute.py /execute.py
RUN chmod +x /entrypoint.sh

# Security: Remove pip for runtime
RUN rm -f /usr/local/bin/pip /usr/local/bin/pip3

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["/entrypoint.sh"]
