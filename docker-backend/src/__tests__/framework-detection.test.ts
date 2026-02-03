/**
 * Framework Detection Tests
 * 
 * Tests the multi-language framework detection and dev server command generation.
 * Ensures proper detection of Python, Rust, Go, Java, and various JS frameworks.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Use vi.hoisted() to ensure mocks are available before module loading
const { mockExecResults, createMockStream, mockExec, mockGetContainer } = vi.hoisted(() => {
  const mockExecResults: Map<string, string> = new Map();

  const createMockStream = (output: string) => ({
    on: (event: string, callback: (data?: Buffer) => void) => {
      if (event === 'data') {
        // Docker multiplexed stream format: 8-byte header + data
        const header = Buffer.alloc(8);
        header.writeUInt32BE(output.length, 4);
        callback(Buffer.concat([header, Buffer.from(output)]));
      }
      if (event === 'end') {
        setTimeout(callback, 0);
      }
      return { on: vi.fn() };
    },
  });

  const mockExec = vi.fn().mockImplementation(async (options: { Cmd: string[] }) => {
    const cmd = options.Cmd.join(' ');
    return {
      start: vi.fn().mockResolvedValue(createMockStream(mockExecResults.get(cmd) || '')),
    };
  });

  const mockGetContainer = vi.fn().mockReturnValue({
    exec: mockExec,
  });

  return { mockExecResults, createMockStream, mockExec, mockGetContainer };
});

vi.mock('dockerode', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      getContainer: mockGetContainer,
    })),
  };
});

import { 
  detectFrameworkFromContainer, 
  getInstallCommand, 
  getDevCommand,
  getExpectedPorts 
} from '../dev-server';

describe('Framework Detection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecResults.clear();
  });

  describe('detectFrameworkFromContainer', () => {
    describe('Node.js frameworks', () => {
      it('should detect Vite project', async () => {
        mockExecResults.set('/bin/bash -c cat /workspace/package.json 2>/dev/null', JSON.stringify({
          dependencies: { vite: '^5.0.0', react: '^18.0.0' },
        }));

        const framework = await detectFrameworkFromContainer('test-container');
        expect(framework).toBe('vite');
      });

      it('should detect Next.js project', async () => {
        mockExecResults.set('/bin/bash -c cat /workspace/package.json 2>/dev/null', JSON.stringify({
          dependencies: { next: '^14.0.0', react: '^18.0.0' },
        }));

        const framework = await detectFrameworkFromContainer('test-container');
        expect(framework).toBe('next');
      });

      it('should detect Expo/React Native project', async () => {
        mockExecResults.set('/bin/bash -c cat /workspace/package.json 2>/dev/null', JSON.stringify({
          dependencies: { expo: '^49.0.0', 'react-native': '^0.72.0' },
        }));

        const framework = await detectFrameworkFromContainer('test-container');
        expect(framework).toBe('expo');
      });

      it('should detect Vue project', async () => {
        mockExecResults.set('/bin/bash -c cat /workspace/package.json 2>/dev/null', JSON.stringify({
          dependencies: { vue: '^3.3.0' },
        }));

        const framework = await detectFrameworkFromContainer('test-container');
        expect(framework).toBe('vue');
      });

      it('should detect SvelteKit project', async () => {
        mockExecResults.set('/bin/bash -c cat /workspace/package.json 2>/dev/null', JSON.stringify({
          devDependencies: { '@sveltejs/kit': '^1.0.0' },
        }));

        const framework = await detectFrameworkFromContainer('test-container');
        expect(framework).toBe('sveltekit');
      });

      it('should detect Angular project', async () => {
        mockExecResults.set('/bin/bash -c cat /workspace/package.json 2>/dev/null', JSON.stringify({
          dependencies: { '@angular/core': '^17.0.0' },
        }));

        const framework = await detectFrameworkFromContainer('test-container');
        expect(framework).toBe('angular');
      });

      it('should detect Express/Node server project', async () => {
        mockExecResults.set('/bin/bash -c cat /workspace/package.json 2>/dev/null', JSON.stringify({
          dependencies: { express: '^4.18.0' },
        }));

        const framework = await detectFrameworkFromContainer('test-container');
        expect(framework).toBe('node-server');
      });
    });

    describe('Python frameworks', () => {
      it('should detect Flask project from requirements.txt', async () => {
        mockExecResults.set('/bin/bash -c cat /workspace/package.json 2>/dev/null', '');
        mockExecResults.set('/bin/bash -c cat /workspace/requirements.txt 2>/dev/null', 'flask==2.3.0\ngunicorn');
        mockExecResults.set('/bin/bash -c cat /workspace/pyproject.toml 2>/dev/null', '');
        mockExecResults.set('/bin/bash -c cat /workspace/Pipfile 2>/dev/null', '');

        const framework = await detectFrameworkFromContainer('test-container');
        expect(framework).toBe('flask');
      });

      it('should detect Django project', async () => {
        mockExecResults.set('/bin/bash -c cat /workspace/package.json 2>/dev/null', '');
        mockExecResults.set('/bin/bash -c cat /workspace/requirements.txt 2>/dev/null', 'django>=4.0');
        mockExecResults.set('/bin/bash -c cat /workspace/pyproject.toml 2>/dev/null', '');
        mockExecResults.set('/bin/bash -c cat /workspace/Pipfile 2>/dev/null', '');

        const framework = await detectFrameworkFromContainer('test-container');
        expect(framework).toBe('django');
      });

      it('should detect FastAPI project', async () => {
        mockExecResults.set('/bin/bash -c cat /workspace/package.json 2>/dev/null', '');
        mockExecResults.set('/bin/bash -c cat /workspace/requirements.txt 2>/dev/null', 'fastapi\nuvicorn');
        mockExecResults.set('/bin/bash -c cat /workspace/pyproject.toml 2>/dev/null', '');
        mockExecResults.set('/bin/bash -c cat /workspace/Pipfile 2>/dev/null', '');

        const framework = await detectFrameworkFromContainer('test-container');
        expect(framework).toBe('fastapi');
      });

      it('should detect Streamlit project', async () => {
        mockExecResults.set('/bin/bash -c cat /workspace/package.json 2>/dev/null', '');
        mockExecResults.set('/bin/bash -c cat /workspace/requirements.txt 2>/dev/null', 'streamlit\npandas');
        mockExecResults.set('/bin/bash -c cat /workspace/pyproject.toml 2>/dev/null', '');
        mockExecResults.set('/bin/bash -c cat /workspace/Pipfile 2>/dev/null', '');

        const framework = await detectFrameworkFromContainer('test-container');
        expect(framework).toBe('streamlit');
      });
    });

    describe('Rust projects', () => {
      it('should detect basic Rust project', async () => {
        mockExecResults.set('/bin/bash -c cat /workspace/package.json 2>/dev/null', '');
        mockExecResults.set('/bin/bash -c cat /workspace/requirements.txt 2>/dev/null', '');
        mockExecResults.set('/bin/bash -c cat /workspace/pyproject.toml 2>/dev/null', '');
        mockExecResults.set('/bin/bash -c cat /workspace/Pipfile 2>/dev/null', '');
        mockExecResults.set('/bin/bash -c cat /workspace/Cargo.toml 2>/dev/null', '[package]\nname = "my-app"');
        mockExecResults.set('/bin/bash -c cat /workspace/go.mod 2>/dev/null', '');
        mockExecResults.set('/bin/bash -c cat /workspace/pom.xml 2>/dev/null', '');
        mockExecResults.set('/bin/bash -c cat /workspace/build.gradle 2>/dev/null', '');

        const framework = await detectFrameworkFromContainer('test-container');
        expect(framework).toBe('rust');
      });

      it('should detect Rust web framework (Actix)', async () => {
        mockExecResults.set('/bin/bash -c cat /workspace/package.json 2>/dev/null', '');
        mockExecResults.set('/bin/bash -c cat /workspace/requirements.txt 2>/dev/null', '');
        mockExecResults.set('/bin/bash -c cat /workspace/pyproject.toml 2>/dev/null', '');
        mockExecResults.set('/bin/bash -c cat /workspace/Pipfile 2>/dev/null', '');
        mockExecResults.set('/bin/bash -c cat /workspace/Cargo.toml 2>/dev/null', '[dependencies]\nactix-web = "4"');
        mockExecResults.set('/bin/bash -c cat /workspace/go.mod 2>/dev/null', '');
        mockExecResults.set('/bin/bash -c cat /workspace/pom.xml 2>/dev/null', '');
        mockExecResults.set('/bin/bash -c cat /workspace/build.gradle 2>/dev/null', '');

        const framework = await detectFrameworkFromContainer('test-container');
        expect(framework).toBe('rust-web');
      });
    });

    describe('Go projects', () => {
      it('should detect basic Go project', async () => {
        mockExecResults.set('/bin/bash -c cat /workspace/package.json 2>/dev/null', '');
        mockExecResults.set('/bin/bash -c cat /workspace/requirements.txt 2>/dev/null', '');
        mockExecResults.set('/bin/bash -c cat /workspace/pyproject.toml 2>/dev/null', '');
        mockExecResults.set('/bin/bash -c cat /workspace/Pipfile 2>/dev/null', '');
        mockExecResults.set('/bin/bash -c cat /workspace/Cargo.toml 2>/dev/null', '');
        mockExecResults.set('/bin/bash -c cat /workspace/go.mod 2>/dev/null', 'module myapp\n\ngo 1.21');
        mockExecResults.set('/bin/bash -c cat /workspace/pom.xml 2>/dev/null', '');
        mockExecResults.set('/bin/bash -c cat /workspace/build.gradle 2>/dev/null', '');

        const framework = await detectFrameworkFromContainer('test-container');
        expect(framework).toBe('go');
      });

      it('should detect Go Gin web framework', async () => {
        mockExecResults.set('/bin/bash -c cat /workspace/package.json 2>/dev/null', '');
        mockExecResults.set('/bin/bash -c cat /workspace/requirements.txt 2>/dev/null', '');
        mockExecResults.set('/bin/bash -c cat /workspace/pyproject.toml 2>/dev/null', '');
        mockExecResults.set('/bin/bash -c cat /workspace/Pipfile 2>/dev/null', '');
        mockExecResults.set('/bin/bash -c cat /workspace/Cargo.toml 2>/dev/null', '');
        mockExecResults.set('/bin/bash -c cat /workspace/go.mod 2>/dev/null', 'module myapp\n\nrequire github.com/gin-gonic/gin v1.9.0');
        mockExecResults.set('/bin/bash -c cat /workspace/pom.xml 2>/dev/null', '');
        mockExecResults.set('/bin/bash -c cat /workspace/build.gradle 2>/dev/null', '');

        const framework = await detectFrameworkFromContainer('test-container');
        expect(framework).toBe('go-web');
      });
    });

    describe('Java projects', () => {
      it('should detect Maven Spring Boot project', async () => {
        mockExecResults.set('/bin/bash -c cat /workspace/package.json 2>/dev/null', '');
        mockExecResults.set('/bin/bash -c cat /workspace/requirements.txt 2>/dev/null', '');
        mockExecResults.set('/bin/bash -c cat /workspace/pyproject.toml 2>/dev/null', '');
        mockExecResults.set('/bin/bash -c cat /workspace/Pipfile 2>/dev/null', '');
        mockExecResults.set('/bin/bash -c cat /workspace/Cargo.toml 2>/dev/null', '');
        mockExecResults.set('/bin/bash -c cat /workspace/go.mod 2>/dev/null', '');
        mockExecResults.set('/bin/bash -c cat /workspace/pom.xml 2>/dev/null', '<parent>\n<artifactId>spring-boot-starter-parent</artifactId>');
        mockExecResults.set('/bin/bash -c cat /workspace/build.gradle 2>/dev/null', '');

        const framework = await detectFrameworkFromContainer('test-container');
        expect(framework).toBe('java-spring');
      });

      it('should detect basic Maven project', async () => {
        mockExecResults.set('/bin/bash -c cat /workspace/package.json 2>/dev/null', '');
        mockExecResults.set('/bin/bash -c cat /workspace/requirements.txt 2>/dev/null', '');
        mockExecResults.set('/bin/bash -c cat /workspace/pyproject.toml 2>/dev/null', '');
        mockExecResults.set('/bin/bash -c cat /workspace/Pipfile 2>/dev/null', '');
        mockExecResults.set('/bin/bash -c cat /workspace/Cargo.toml 2>/dev/null', '');
        mockExecResults.set('/bin/bash -c cat /workspace/go.mod 2>/dev/null', '');
        mockExecResults.set('/bin/bash -c cat /workspace/pom.xml 2>/dev/null', '<project><artifactId>my-app</artifactId></project>');
        mockExecResults.set('/bin/bash -c cat /workspace/build.gradle 2>/dev/null', '');

        const framework = await detectFrameworkFromContainer('test-container');
        expect(framework).toBe('java');
      });
    });

    describe('Static HTML projects', () => {
      it('should detect static HTML project', async () => {
        mockExecResults.set('/bin/bash -c cat /workspace/package.json 2>/dev/null', '');
        mockExecResults.set('/bin/bash -c cat /workspace/requirements.txt 2>/dev/null', '');
        mockExecResults.set('/bin/bash -c cat /workspace/pyproject.toml 2>/dev/null', '');
        mockExecResults.set('/bin/bash -c cat /workspace/Pipfile 2>/dev/null', '');
        mockExecResults.set('/bin/bash -c cat /workspace/Cargo.toml 2>/dev/null', '');
        mockExecResults.set('/bin/bash -c cat /workspace/go.mod 2>/dev/null', '');
        mockExecResults.set('/bin/bash -c cat /workspace/pom.xml 2>/dev/null', '');
        mockExecResults.set('/bin/bash -c cat /workspace/build.gradle 2>/dev/null', '');
        mockExecResults.set('/bin/bash -c ls /workspace/index.html 2>/dev/null', '/workspace/index.html');

        const framework = await detectFrameworkFromContainer('test-container');
        expect(framework).toBe('static');
      });
    });
  });

  describe('getInstallCommand', () => {
    it('should return correct install command for Node.js frameworks', () => {
      expect(getInstallCommand('vite')).toContain('install');
      expect(getInstallCommand('next')).toContain('install');
      expect(getInstallCommand('react')).toContain('install');
    });

    it('should return correct install command for Python frameworks', () => {
      expect(getInstallCommand('flask')).toContain('pip');
      expect(getInstallCommand('django')).toContain('pip');
      expect(getInstallCommand('fastapi')).toContain('pip');
    });

    it('should return correct install command for Rust', () => {
      expect(getInstallCommand('rust')).toContain('cargo');
    });

    it('should return correct install command for Go', () => {
      expect(getInstallCommand('go')).toContain('go mod');
    });

    it('should return correct install command for Java', () => {
      expect(getInstallCommand('java-spring')).toContain('mvn');
    });

    it('should handle static projects', () => {
      expect(getInstallCommand('static')).toBeDefined();
    });
  });

  describe('getDevCommand', () => {
    it('should return correct dev command for Node.js frameworks', () => {
      expect(getDevCommand('vite')).toContain('dev');
      expect(getDevCommand('next')).toContain('dev');
    });

    it('should return correct dev command for Python frameworks', () => {
      expect(getDevCommand('flask')).toContain('flask');
      expect(getDevCommand('django')).toContain('runserver');
      expect(getDevCommand('fastapi')).toContain('uvicorn');
      expect(getDevCommand('streamlit')).toContain('streamlit');
    });

    it('should return correct dev command for Rust', () => {
      expect(getDevCommand('rust')).toContain('cargo run');
    });

    it('should return correct dev command for Go', () => {
      expect(getDevCommand('go')).toContain('go run');
    });

    it('should return correct dev command for Java', () => {
      expect(getDevCommand('java-spring')).toContain('spring-boot:run');
    });

    it('should provide HTTP server for static projects', () => {
      const cmd = getDevCommand('static');
      expect(cmd).toMatch(/serve|http\.server/);
    });
  });

  describe('getExpectedPorts', () => {
    it('should return base ports plus framework-specific ports', () => {
      const basePorts = [5173, 5174];
      
      const nextPorts = getExpectedPorts('next', basePorts);
      expect(nextPorts).toContain(3000); // Next.js default
      expect(nextPorts).toContain(5173); // Base port
      
      const expoPorts = getExpectedPorts('expo', basePorts);
      expect(expoPorts).toContain(8081); // Expo default
      expect(expoPorts).toContain(19000); // Expo metro
    });

    it('should return unique ports (no duplicates)', () => {
      const basePorts = [3000, 5173]; // 3000 is also Next.js default
      const ports = getExpectedPorts('next', basePorts);
      const uniquePorts = [...new Set(ports)];
      expect(ports.length).toBe(uniquePorts.length);
    });

    it('should handle unknown frameworks gracefully', () => {
      const basePorts = [5173];
      const ports = getExpectedPorts('unknown-framework', basePorts);
      expect(ports).toContain(5173);
    });
  });
});
