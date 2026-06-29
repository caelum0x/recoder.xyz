// Package server runs the Envoy xDS gRPC control plane (ADS) over a
// go-control-plane SnapshotCache. A running Envoy configured with an ADS
// dynamic_resources stanza pointing at this server receives live LDS/CDS/RDS.
package server

import (
	"context"
	"fmt"
	"log/slog"
	"net"
	"sync"
	"sync/atomic"
	"time"

	corev3 "github.com/envoyproxy/go-control-plane/envoy/config/core/v3"
	discoveryv3 "github.com/envoyproxy/go-control-plane/envoy/service/discovery/v3"
	cachev3 "github.com/envoyproxy/go-control-plane/pkg/cache/v3"
	xdslog "github.com/envoyproxy/go-control-plane/pkg/log"
	serverv3 "github.com/envoyproxy/go-control-plane/pkg/server/v3"
	"google.golang.org/grpc"
	"google.golang.org/grpc/health"
	healthpb "google.golang.org/grpc/health/grpc_health_v1"
	"google.golang.org/grpc/keepalive"
	"google.golang.org/grpc/reflection"

	"github.com/recoder-xyz/recoder-xds/internal/config"
	"github.com/recoder-xyz/recoder-xds/internal/contract"
	"github.com/recoder-xyz/recoder-xds/internal/snapshot"
)

// NodeID is the Envoy node ID this control plane serves snapshots for. With ADS
// + a single-node mesh, all Envoys share one logical snapshot keyed by this ID.
// It must match the `node.id` in the Envoy bootstrap. Sourced from the
// cross-language contract so the server, snapshot, and TS bootstrap never drift.
const NodeID = contract.NodeID

// ControlPlane owns the snapshot cache and the xDS gRPC server. It is safe to
// call UpdateConfig concurrently with serving; SnapshotCache is goroutine-safe.
type ControlPlane struct {
	cache  cachev3.SnapshotCache
	srv    serverv3.Server
	logger *slog.Logger

	// updateMu serializes UpdateConfig so the version a snapshot is built with
	// is the version it is installed under. version.Add is atomic, but without
	// this lock two concurrent updates could install in the opposite order they
	// were numbered, regressing the data plane to an older config (a no-restart
	// update hazard). The lock keeps "assign version -> build -> install"
	// monotonic end to end.
	updateMu sync.Mutex
	version  atomic.Uint64
}

// New constructs a ControlPlane and loads the initial snapshot from cfg. It
// fails fast if the initial config cannot be turned into a consistent snapshot.
func New(ctx context.Context, cfg config.NetworkConfig, logger *slog.Logger) (*ControlPlane, error) {
	if logger == nil {
		logger = slog.Default()
	}
	cache := cachev3.NewSnapshotCache(true /* ADS */, cachev3.IDHash{}, newCacheLogger(logger))
	cp := &ControlPlane{
		cache:  cache,
		logger: logger,
	}
	cp.srv = serverv3.NewServer(ctx, cache, newCallbacks(logger))

	if err := cp.UpdateConfig(ctx, cfg); err != nil {
		return nil, err
	}
	return cp, nil
}

// UpdateConfig builds a new snapshot from cfg and installs it for NodeID. The
// version is a monotonic counter so Envoy always perceives a change and resyncs.
//
// The whole assign-build-install sequence is serialized so a slow build cannot
// let a newer config install before an older one. A build failure does NOT
// install anything: the previously-served snapshot stays live, so a bad config
// can never blank the data plane (fail safe, no-restart-friendly).
func (cp *ControlPlane) UpdateConfig(ctx context.Context, cfg config.NetworkConfig) error {
	cp.updateMu.Lock()
	defer cp.updateMu.Unlock()

	version := cp.version.Load() + 1
	snap, err := snapshot.Build(cfg, fmt.Sprintf("v%d", version))
	if err != nil {
		// Do not advance the version on a rejected config: the live snapshot is
		// untouched and the next attempt reuses this number.
		return fmt.Errorf("build snapshot: %w", err)
	}
	if err := cp.cache.SetSnapshot(ctx, NodeID, snap); err != nil {
		return fmt.Errorf("set snapshot: %w", err)
	}
	cp.version.Store(version)
	cp.logger.Info("xds snapshot installed",
		slog.String("node", NodeID),
		slog.Uint64("version", version),
		slog.Int("clusters", len(cfg.Upstreams)+1),
	)
	return nil
}

// Version returns the version of the snapshot currently served for NodeID. It is
// 0 before the first successful UpdateConfig. Readiness probes can use this to
// report "serving config vN" instead of an opaque ok.
func (cp *ControlPlane) Version() uint64 {
	return cp.version.Load()
}

// Register wires the ADS service onto a gRPC server. It also registers the
// standard gRPC health service (reporting SERVING for the ADS service) and
// server reflection so an operator can grpcurl the live control plane.
func (cp *ControlPlane) Register(gs *grpc.Server) {
	discoveryv3.RegisterAggregatedDiscoveryServiceServer(gs, cp.srv)

	hs := health.NewServer()
	// Empty service name = overall server health; the ADS service name lets a
	// caller probe this specific xDS API.
	hs.SetServingStatus("", healthpb.HealthCheckResponse_SERVING)
	hs.SetServingStatus(adsServiceName, healthpb.HealthCheckResponse_SERVING)
	healthpb.RegisterHealthServer(gs, hs)

	reflection.Register(gs)
}

// adsServiceName is the fully-qualified gRPC service the ADS server exposes. It
// is used as the health-check service key so a caller can probe ADS directly.
const adsServiceName = "envoy.service.discovery.v3.AggregatedDiscoveryService"

// gracefulStopTimeout bounds how long Serve waits for in-flight ADS streams to
// drain on shutdown before forcing the listener closed. Long-lived xDS streams
// would otherwise let GracefulStop block indefinitely.
const gracefulStopTimeout = 10 * time.Second

// NewGRPCServer returns a gRPC server configured for xDS streaming with
// keepalive tuned for long-lived ADS streams. ServerParameters bound idle/age
// so a wedged Envoy connection is eventually reaped instead of leaking.
func NewGRPCServer() *grpc.Server {
	return grpc.NewServer(
		grpc.MaxConcurrentStreams(1<<16),
		grpc.KeepaliveParams(keepalive.ServerParameters{
			// Ping an idle connection after 30s and reap it if unanswered.
			Time:    30 * time.Second,
			Timeout: 5 * time.Second,
		}),
		grpc.KeepaliveEnforcementPolicy(keepalive.EnforcementPolicy{
			// Envoy sends keepalive pings without an active stream while it has
			// no resources to ask for; permit them but rate-limit the floor so a
			// misbehaving client cannot ping-flood us.
			MinTime:             10 * time.Second,
			PermitWithoutStream: true,
		}),
	)
}

// Serve binds the xDS gRPC server to addr and blocks until the listener stops.
// It registers the ADS service and returns once ctx is cancelled (graceful) or
// Serve errors.
func (cp *ControlPlane) Serve(ctx context.Context, addr string) error {
	lis, err := net.Listen("tcp", addr)
	if err != nil {
		return fmt.Errorf("xds listen %q: %w", addr, err)
	}
	gs := NewGRPCServer()
	cp.Register(gs)

	errCh := make(chan error, 1)
	go func() {
		cp.logger.Info("xds gRPC server listening", slog.String("addr", addr))
		errCh <- gs.Serve(lis)
	}()

	select {
	case <-ctx.Done():
		cp.logger.Info("xds gRPC server shutting down")
		cp.gracefulStop(gs)
		return nil
	case err := <-errCh:
		if err != nil {
			return fmt.Errorf("xds serve: %w", err)
		}
		return nil
	}
}

// gracefulStop drains in-flight streams but forces the server closed if the
// drain exceeds gracefulStopTimeout, so a stuck ADS stream cannot hang shutdown.
func (cp *ControlPlane) gracefulStop(gs *grpc.Server) {
	done := make(chan struct{})
	go func() {
		gs.GracefulStop()
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(gracefulStopTimeout):
		cp.logger.Warn("xds graceful stop timed out; forcing close",
			slog.Duration("timeout", gracefulStopTimeout))
		gs.Stop()
		<-done
	}
}

// newCacheLogger adapts an slog.Logger to the go-control-plane log.Logger.
func newCacheLogger(l *slog.Logger) xdslog.Logger {
	return xdslog.LoggerFuncs{
		DebugFunc: func(f string, a ...interface{}) { l.Debug(fmt.Sprintf(f, a...)) },
		InfoFunc:  func(f string, a ...interface{}) { l.Debug(fmt.Sprintf(f, a...)) },
		WarnFunc:  func(f string, a ...interface{}) { l.Warn(fmt.Sprintf(f, a...)) },
		ErrorFunc: func(f string, a ...interface{}) { l.Error(fmt.Sprintf(f, a...)) },
	}
}

// newCallbacks surfaces ADS stream lifecycle + Envoy connect events for audit.
// It makes two no-restart-critical conditions visible:
//
//   - A NACK (Envoy rejected a pushed config: the request carries an
//     ErrorDetail and repeats the last accepted version) is logged at ERROR so
//     a rejected LDS/CDS/RDS update is never silent.
//   - A wrong node.id (the snapshot is keyed under contract.NodeID; any other id
//     receives an empty snapshot) is logged at WARN so data/control-plane drift
//     is caught instead of presenting as a mysteriously unconfigured Envoy.
func newCallbacks(l *slog.Logger) serverv3.Callbacks {
	return serverv3.CallbackFuncs{
		StreamOpenFunc: func(_ context.Context, streamID int64, typeURL string) error {
			l.Info("ads stream open", slog.Int64("stream", streamID), slog.String("type", typeURL))
			return nil
		},
		StreamClosedFunc: func(streamID int64, node *corev3.Node) {
			l.Info("ads stream closed", slog.Int64("stream", streamID), slog.String("node", nodeID(node)))
		},
		StreamRequestFunc: func(streamID int64, req *discoveryv3.DiscoveryRequest) error {
			id := nodeID(req.GetNode())
			// req.Node is only required to be set on the first request of a
			// stream; ignore the empty-id continuation requests.
			if id != "" && id != NodeID {
				l.Warn("ads request from unexpected node id; it will receive an empty snapshot",
					slog.Int64("stream", streamID),
					slog.String("node", id),
					slog.String("expected", NodeID),
				)
			}
			if ed := req.GetErrorDetail(); ed != nil {
				l.Error("ads NACK: envoy rejected config",
					slog.Int64("stream", streamID),
					slog.String("type", req.GetTypeUrl()),
					slog.String("version", req.GetVersionInfo()),
					slog.String("node", id),
					slog.Int("code", int(ed.GetCode())),
					slog.String("detail", ed.GetMessage()),
				)
				return nil
			}
			l.Debug("ads request",
				slog.Int64("stream", streamID),
				slog.String("type", req.GetTypeUrl()),
				slog.String("version", req.GetVersionInfo()),
				slog.String("node", id),
			)
			return nil
		},
	}
}

func nodeID(n *corev3.Node) string {
	if n == nil {
		return ""
	}
	return n.GetId()
}
