/**
 * Language-specific file generators for multi-language project support
 * Generates starter files for Python, Rust, Go, and Java projects
 */

export type PythonFramework = 'flask' | 'django' | 'fastapi' | 'generic';
export type JavaFramework = 'spring' | 'generic';

export interface GeneratedFiles {
  [filePath: string]: string;
}

/**
 * Generate Python project files
 */
export function generatePythonFiles(framework: PythonFramework): GeneratedFiles {
  const files: GeneratedFiles = {};

  switch (framework) {
    case 'flask':
      files['requirements.txt'] = `Flask>=3.0.0
python-dotenv>=1.0.0
gunicorn>=21.0.0
`;
      files['app.py'] = `from flask import Flask, render_template, jsonify

app = Flask(__name__)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/health')
def health():
    return jsonify({'status': 'healthy'})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5173, debug=True)
`;
      files['templates/index.html'] = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Flask App</title>
    <style>
        body { font-family: system-ui, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
        h1 { color: #333; }
    </style>
</head>
<body>
    <h1>Welcome to Flask!</h1>
    <p>Your Flask application is running.</p>
</body>
</html>
`;
      break;

    case 'django':
      files['requirements.txt'] = `Django>=5.0.0
python-dotenv>=1.0.0
gunicorn>=21.0.0
`;
      files['manage.py'] = `#!/usr/bin/env python
import os
import sys

if __name__ == '__main__':
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'project.settings')
    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError(
            "Couldn't import Django. Are you sure it's installed and "
            "available on your PYTHONPATH environment variable? Did you "
            "forget to activate a virtual environment?"
        ) from exc
    execute_from_command_line(sys.argv)
`;
      break;

    case 'fastapi':
      files['requirements.txt'] = `fastapi>=0.109.0
uvicorn[standard]>=0.27.0
python-dotenv>=1.0.0
`;
      files['main.py'] = `from fastapi import FastAPI
from fastapi.responses import HTMLResponse

app = FastAPI(title="FastAPI App")

@app.get("/", response_class=HTMLResponse)
async def root():
    return """
    <!DOCTYPE html>
    <html>
    <head>
        <title>FastAPI App</title>
        <style>
            body { font-family: system-ui, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
            h1 { color: #333; }
        </style>
    </head>
    <body>
        <h1>Welcome to FastAPI!</h1>
        <p>Your FastAPI application is running.</p>
        <p>Visit <a href="/docs">/docs</a> for the API documentation.</p>
    </body>
    </html>
    """

@app.get("/api/health")
async def health():
    return {"status": "healthy"}
`;
      break;

    case 'generic':
    default:
      files['requirements.txt'] = `# Add your dependencies here
`;
      files['main.py'] = `def main():
    print("Hello, Python!")

if __name__ == '__main__':
    main()
`;
      break;
  }

  return files;
}

/**
 * Generate Rust project files
 */
export function generateRustFiles(): GeneratedFiles {
  return {
    'Cargo.toml': `[package]
name = "project"
version = "0.1.0"
edition = "2021"

[dependencies]
actix-web = "4"
tokio = { version = "1", features = ["full"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
`,
    'src/main.rs': `use actix_web::{web, App, HttpResponse, HttpServer, Responder};

async fn index() -> impl Responder {
    HttpResponse::Ok()
        .content_type("text/html")
        .body(r#"
<!DOCTYPE html>
<html>
<head>
    <title>Rust Web App</title>
    <style>
        body { font-family: system-ui, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
        h1 { color: #333; }
    </style>
</head>
<body>
    <h1>Welcome to Rust + Actix Web!</h1>
    <p>Your Rust application is running.</p>
</body>
</html>
        "#)
}

async fn health() -> impl Responder {
    HttpResponse::Ok().json(serde_json::json!({"status": "healthy"}))
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    println!("Starting server at http://0.0.0.0:8080");

    HttpServer::new(|| {
        App::new()
            .route("/", web::get().to(index))
            .route("/api/health", web::get().to(health))
    })
    .bind("0.0.0.0:8080")?
    .run()
    .await
}
`,
  };
}

/**
 * Generate Go project files
 */
export function generateGoFiles(): GeneratedFiles {
  return {
    'go.mod': `module project

go 1.21

require github.com/gin-gonic/gin v1.9.1
`,
    'main.go': `package main

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func main() {
	r := gin.Default()

	r.GET("/", func(c *gin.Context) {
		c.Header("Content-Type", "text/html")
		c.String(http.StatusOK, \`
<!DOCTYPE html>
<html>
<head>
    <title>Go Web App</title>
    <style>
        body { font-family: system-ui, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
        h1 { color: #333; }
    </style>
</head>
<body>
    <h1>Welcome to Go + Gin!</h1>
    <p>Your Go application is running.</p>
</body>
</html>
		\`)
	})

	r.GET("/api/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "healthy"})
	})

	r.Run(":8080")
}
`,
  };
}

/**
 * Generate Java project files
 */
export function generateJavaFiles(framework: JavaFramework): GeneratedFiles {
  const files: GeneratedFiles = {};

  switch (framework) {
    case 'spring':
      files['pom.xml'] = `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <parent>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-parent</artifactId>
        <version>3.2.0</version>
        <relativePath/>
    </parent>

    <groupId>com.example</groupId>
    <artifactId>project</artifactId>
    <version>1.0.0</version>
    <packaging>jar</packaging>

    <properties>
        <java.version>17</java.version>
    </properties>

    <dependencies>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>
    </dependencies>

    <build>
        <plugins>
            <plugin>
                <groupId>org.springframework.boot</groupId>
                <artifactId>spring-boot-maven-plugin</artifactId>
            </plugin>
        </plugins>
    </build>
</project>
`;
      files['src/main/java/com/example/Application.java'] = `package com.example;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class Application {
    public static void main(String[] args) {
        SpringApplication.run(Application.class, args);
    }
}
`;
      files['src/main/java/com/example/HomeController.java'] = `package com.example;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.http.MediaType;
import java.util.Map;

@RestController
public class HomeController {

    @GetMapping(value = "/", produces = MediaType.TEXT_HTML_VALUE)
    public String index() {
        return """
            <!DOCTYPE html>
            <html>
            <head>
                <title>Spring Boot App</title>
                <style>
                    body { font-family: system-ui, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
                    h1 { color: #333; }
                </style>
            </head>
            <body>
                <h1>Welcome to Spring Boot!</h1>
                <p>Your Spring Boot application is running.</p>
            </body>
            </html>
            """;
    }

    @GetMapping("/api/health")
    public Map<String, String> health() {
        return Map.of("status", "healthy");
    }
}
`;
      files['src/main/resources/application.properties'] = `server.port=8080
`;
      break;

    case 'generic':
    default:
      files['pom.xml'] = `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <groupId>com.example</groupId>
    <artifactId>project</artifactId>
    <version>1.0.0</version>
    <packaging>jar</packaging>

    <properties>
        <maven.compiler.source>17</maven.compiler.source>
        <maven.compiler.target>17</maven.compiler.target>
        <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
    </properties>

    <build>
        <plugins>
            <plugin>
                <groupId>org.codehaus.mojo</groupId>
                <artifactId>exec-maven-plugin</artifactId>
                <version>3.1.0</version>
                <configuration>
                    <mainClass>com.example.App</mainClass>
                </configuration>
            </plugin>
        </plugins>
    </build>
</project>
`;
      files['src/main/java/com/example/App.java'] = `package com.example;

public class App {
    public static void main(String[] args) {
        System.out.println("Hello, Java!");
    }
}
`;
      break;
  }

  return files;
}

/**
 * Get install command for a given framework
 */
export function getInstallCommand(framework: string): string {
  switch (framework) {
    // Expo / React Native (Node-based, uses bun/npm)
    case 'expo':
      return 'bun install --force || npm install --legacy-peer-deps';

    // Python
    case 'flask':
    case 'django':
    case 'fastapi':
    case 'python':
      return 'pip install -r requirements.txt';

    // Rust
    case 'rust':
      return 'cargo build';

    // Go
    case 'go':
      return 'go mod tidy';

    // Java
    case 'java':
    case 'java-spring':
      return 'mvn install -DskipTests';

    default:
      return '';
  }
}

/**
 * Get dev server command for a given framework
 */
export function getDevServerCommand(framework: string): { command: string; port: number } {
  switch (framework) {
    // Expo / React Native
    case 'expo':
      return { command: 'EXPO_DEVTOOLS_LISTEN_ADDRESS=0.0.0.0 BROWSER=none CI=1 npx expo start --host 0.0.0.0 --port 8081', port: 8081 };

    // Python
    case 'flask':
      return { command: 'python -m flask run --host=0.0.0.0 --port=5173', port: 5173 };
    case 'django':
      return { command: 'python manage.py runserver 0.0.0.0:5173', port: 5173 };
    case 'fastapi':
      return { command: 'uvicorn main:app --host 0.0.0.0 --port 5173 --reload', port: 5173 };
    case 'python':
      return { command: 'python main.py', port: 5173 };

    // Rust
    case 'rust':
      return { command: 'cargo run', port: 8080 };

    // Go
    case 'go':
      return { command: 'go run .', port: 8080 };

    // Java
    case 'java-spring':
      return { command: 'mvn spring-boot:run', port: 8080 };
    case 'java':
      return { command: 'mvn exec:java', port: 8080 };

    default:
      return { command: '', port: 5173 };
  }
}

/**
 * Check if framework is a non-Node.js language
 */
export function isNonNodeFramework(framework: string): boolean {
  return [
    'python', 'flask', 'django', 'fastapi',
    'rust',
    'go',
    'java', 'java-spring'
  ].includes(framework);
}
