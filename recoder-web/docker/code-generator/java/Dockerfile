# Java Code Execution Container
FROM openjdk:21-jdk-slim

# Install security and build tools
RUN apt-get update && apt-get install -y \
    dumb-init \
    sudo \
    wget \
    curl \
    git \
    jq \
    maven \
    gradle \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user for security
RUN groupadd -g 1001 coderunner && \
    useradd -r -u 1001 -g coderunner coderunner

# Set up workspace
WORKDIR /workspace
RUN chown -R coderunner:coderunner /workspace

# Install popular Java libraries via Maven
RUN mkdir -p /opt/maven-cache && \
    cd /opt/maven-cache && \
    echo '<?xml version="1.0" encoding="UTF-8"?>' > pom.xml && \
    echo '<project xmlns="http://maven.apache.org/POM/4.0.0"' >> pom.xml && \
    echo '         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"' >> pom.xml && \
    echo '         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0' >> pom.xml && \
    echo '         http://maven.apache.org/xsd/maven-4.0.0.xsd">' >> pom.xml && \
    echo '    <modelVersion>4.0.0</modelVersion>' >> pom.xml && \
    echo '    <groupId>com.recoder</groupId>' >> pom.xml && \
    echo '    <artifactId>cache</artifactId>' >> pom.xml && \
    echo '    <version>1.0.0</version>' >> pom.xml && \
    echo '    <properties>' >> pom.xml && \
    echo '        <maven.compiler.source>21</maven.compiler.source>' >> pom.xml && \
    echo '        <maven.compiler.target>21</maven.compiler.target>' >> pom.xml && \
    echo '    </properties>' >> pom.xml && \
    echo '    <dependencies>' >> pom.xml && \
    echo '        <dependency>' >> pom.xml && \
    echo '            <groupId>org.apache.commons</groupId>' >> pom.xml && \
    echo '            <artifactId>commons-lang3</artifactId>' >> pom.xml && \
    echo '            <version>3.13.0</version>' >> pom.xml && \
    echo '        </dependency>' >> pom.xml && \
    echo '        <dependency>' >> pom.xml && \
    echo '            <groupId>com.google.guava</groupId>' >> pom.xml && \
    echo '            <artifactId>guava</artifactId>' >> pom.xml && \
    echo '            <version>32.1.2-jre</version>' >> pom.xml && \
    echo '        </dependency>' >> pom.xml && \
    echo '        <dependency>' >> pom.xml && \
    echo '            <groupId>com.fasterxml.jackson.core</groupId>' >> pom.xml && \
    echo '            <artifactId>jackson-databind</artifactId>' >> pom.xml && \
    echo '            <version>2.15.2</version>' >> pom.xml && \
    echo '        </dependency>' >> pom.xml && \
    echo '    </dependencies>' >> pom.xml && \
    echo '</project>' >> pom.xml

# Pre-download dependencies
RUN mvn dependency:resolve && \
    rm -rf /opt/maven-cache

# Copy execution scripts
COPY entrypoint.sh /entrypoint.sh
COPY runner.sh /runner.sh
RUN chmod +x /entrypoint.sh /runner.sh

# Set Java environment
ENV JAVA_HOME=/usr/local/openjdk-21
ENV M2_HOME=/usr/share/maven
ENV MAVEN_OPTS="-Xmx512m"

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["/entrypoint.sh"]
