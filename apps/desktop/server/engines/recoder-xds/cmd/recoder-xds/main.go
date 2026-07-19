// Command recoder-xds boots the Recoder Envoy xDS control plane.
//
// It loads a NetworkConfig (from a JSON file, the docker-backend network
// endpoint, or env-derived defaults), builds a consistent xDS snapshot, and
// serves it over ADS gRPC so a running Envoy receives live LDS/CDS/RDS updates.
// A small HTTP server exposes /healthz for liveness/readiness probes.
package main

import (
	"context"
	"encoding/json"
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
	"github.com/recoder-xyz/recoder-xds/internal/introspect"
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
	healthSrv := startHealthServer(ctx, *healthAddr, ready, cp, logger)

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

// introspector is the read side of the control plane the health/introspection
// HTTP surface reads. *server.ControlPlane satisfies it.
type introspector interface {
	Version() uint64
	Introspect() (introspect.Report, bool)
}

func startHealthServer(ctx context.Context, addr string, ready *readiness, cp introspector, logger *slog.Logger) *http.Server {
	mux := http.NewServeMux()
	// /healthz: liveness/readiness. Reports the version of the snapshot the
	// control plane is actually serving so a probe shows real state, not a bare
	// "ok". 503 until the first snapshot is installed and ready is set.
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		v := cp.Version()
		if ready.get() && v > 0 {
			w.WriteHeader(http.StatusOK)
			_, _ = fmt.Fprintf(w, "ok serving config v%d", v)
			return
		}
		w.WriteHeader(http.StatusServiceUnavailable)
		_, _ = fmt.Fprintf(w, "not ready (config v%d)", v)
	})

	// report resolves the live snapshot introspection with the readiness flag
	// stamped on. It is the single source the JSON introspection routes serialize.
	report := func() (introspect.Report, bool) {
		rep, ok := cp.Introspect()
		rep.Ready = ready.get() && cp.Version() > 0
		return rep, ok && rep.Ready
	}

	// The READ-ONLY JSON introspection surface: the config the control plane is
	// actually serving over ADS. Every route degrades truthfully — a not-yet-ready
	// control plane answers 503 with an empty-but-well-formed body, never a fake.
	writeJSON := func(w http.ResponseWriter, code int, v any) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(code)
		_ = json.NewEncoder(w).Encode(v)
	}
	introspectRoute := func(project func(introspect.Report) any) http.HandlerFunc {
		return func(w http.ResponseWriter, _ *http.Request) {
			rep, ready := report()
			code := http.StatusOK
			if !ready {
				code = http.StatusServiceUnavailable
			}
			writeJSON(w, code, project(rep))
		}
	}
	// /health: JSON liveness the TS xds adapter probes (200 when serving).
	mux.HandleFunc("/health", introspectRoute(func(r introspect.Report) any {
		return map[string]any{"engine": "xds", "ready": r.Ready, "nodeId": r.NodeID, "version": r.Version, "counts": r.Counts}
	}))
	// /snapshot: snapshot version + status + resource counts.
	mux.HandleFunc("/snapshot", introspectRoute(func(r introspect.Report) any {
		return map[string]any{"nodeId": r.NodeID, "version": r.Version, "ready": r.Ready, "counts": r.Counts}
	}))
	// /clusters, /routes, /listeners, /endpoints: config introspection.
	mux.HandleFunc("/clusters", introspectRoute(func(r introspect.Report) any {
		return map[string]any{"clusters": r.Clusters}
	}))
	mux.HandleFunc("/routes", introspectRoute(func(r introspect.Report) any {
		return map[string]any{"routes": r.Routes}
	}))
	mux.HandleFunc("/listeners", introspectRoute(func(r introspect.Report) any {
		return map[string]any{"listeners": r.Listeners}
	}))
	mux.HandleFunc("/endpoints", introspectRoute(func(r introspect.Report) any {
		return map[string]any{"endpoints": r.Endpoints}
	}))

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
