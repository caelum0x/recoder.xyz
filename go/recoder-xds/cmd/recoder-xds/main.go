// Command recoder-xds boots the Recoder Envoy xDS control plane.
//
// It loads a NetworkConfig (from a JSON file, the docker-backend network
// endpoint, or env-derived defaults), builds a consistent xDS snapshot, and
// serves it over ADS gRPC so a running Envoy receives live LDS/CDS/RDS updates.
// A small HTTP server exposes /healthz for liveness/readiness probes.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/recoder-xyz/recoder-xds/internal/config"
	"github.com/recoder-xyz/recoder-xds/internal/server"
)

func main() {
	if err := run(); err != nil {
		slog.Error("recoder-xds exited with error", slog.String("err", err.Error()))
		os.Exit(1)
	}
}

func run() error {
	var (
		xdsAddr     = flag.String("xds-addr", envOr("XDS_LISTEN_ADDR", ":18000"), "xDS gRPC listen address")
		healthAddr  = flag.String("health-addr", envOr("XDS_HEALTH_ADDR", ":18001"), "health HTTP listen address")
		configFile  = flag.String("config-file", os.Getenv("XDS_CONFIG_FILE"), "path to a NetworkConfig JSON file (optional)")
		configURL   = flag.String("config-url", os.Getenv("XDS_CONFIG_URL"), "URL returning a NetworkConfig JSON document (optional)")
		logLevelStr = flag.String("log-level", envOr("XDS_LOG_LEVEL", "info"), "log level: debug|info|warn|error")
	)
	flag.Parse()

	logger := newLogger(*logLevelStr)
	slog.SetDefault(logger)

	cfg, src, err := loadConfig(*configFile, *configURL)
	if err != nil {
		return err
	}
	logger.Info("network config loaded",
		slog.String("source", src),
		slog.Int("upstreams", len(cfg.Upstreams)),
		slog.String("ext_authz", fmt.Sprintf("%s:%d", cfg.ExtAuthz.Host, cfg.ExtAuthz.Port)),
	)

	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()

	cp, err := server.New(ctx, cfg, logger)
	if err != nil {
		return fmt.Errorf("init control plane: %w", err)
	}

	ready := newReadiness()
	healthSrv := startHealthServer(ctx, *healthAddr, ready, logger)

	ready.set(true)
	logger.Info("recoder-xds ready", slog.String("xds_addr", *xdsAddr))

	serveErr := cp.Serve(ctx, *xdsAddr)

	// Drain the health server on shutdown so probes flip to not-ready.
	ready.set(false)
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer shutdownCancel()
	_ = healthSrv.Shutdown(shutdownCtx)

	return serveErr
}

// loadConfig resolves the NetworkConfig from the most specific source available:
// explicit file > explicit URL > env-derived defaults. It never silently falls
// back: an explicit file/URL that fails is a hard error.
func loadConfig(file, url string) (config.NetworkConfig, string, error) {
	switch {
	case file != "":
		cfg, err := config.LoadFromFile(file)
		if err != nil {
			return config.NetworkConfig{}, "", fmt.Errorf("load config file: %w", err)
		}
		return cfg, "file:" + file, nil
	case url != "":
		cfg, err := config.LoadFromBackend(&http.Client{Timeout: 5 * time.Second}, url)
		if err != nil {
			return config.NetworkConfig{}, "", fmt.Errorf("load config url: %w", err)
		}
		return cfg, "url:" + url, nil
	default:
		cfg := config.Default(os.Getenv)
		if err := cfg.Validate(); err != nil {
			return config.NetworkConfig{}, "", fmt.Errorf("default config invalid: %w", err)
		}
		return cfg, "env-defaults", nil
	}
}

func startHealthServer(ctx context.Context, addr string, ready *readiness, logger *slog.Logger) *http.Server {
	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		if ready.get() {
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte("ok"))
			return
		}
		w.WriteHeader(http.StatusServiceUnavailable)
		_, _ = w.Write([]byte("not ready"))
	})
	srv := &http.Server{Addr: addr, Handler: mux, ReadHeaderTimeout: 5 * time.Second}
	go func() {
		logger.Info("health server listening", slog.String("addr", addr))
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Error("health server error", slog.String("err", err.Error()))
		}
	}()
	return srv
}

func newLogger(level string) *slog.Logger {
	var lvl slog.Level
	switch level {
	case "debug":
		lvl = slog.LevelDebug
	case "warn":
		lvl = slog.LevelWarn
	case "error":
		lvl = slog.LevelError
	default:
		lvl = slog.LevelInfo
	}
	return slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: lvl}))
}

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
