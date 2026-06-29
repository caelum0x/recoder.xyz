// Package server runs the Envoy xDS gRPC control plane (ADS) over a
// go-control-plane SnapshotCache. A running Envoy configured with an ADS
// dynamic_resources stanza pointing at this server receives live LDS/CDS/RDS.
package server

import (
	"context"
	"fmt"
	"log/slog"
	"net"
	"sync/atomic"

	corev3 "github.com/envoyproxy/go-control-plane/envoy/config/core/v3"
	discoveryv3 "github.com/envoyproxy/go-control-plane/envoy/service/discovery/v3"
	cachev3 "github.com/envoyproxy/go-control-plane/pkg/cache/v3"
	xdslog "github.com/envoyproxy/go-control-plane/pkg/log"
	serverv3 "github.com/envoyproxy/go-control-plane/pkg/server/v3"
	"google.golang.org/grpc"
	"google.golang.org/grpc/keepalive"

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
	cache   cachev3.SnapshotCache
	srv     serverv3.Server
	logger  *slog.Logger
	version atomic.Uint64
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
func (cp *ControlPlane) UpdateConfig(ctx context.Context, cfg config.NetworkConfig) error {
	version := cp.version.Add(1)
	snap, err := snapshot.Build(cfg, fmt.Sprintf("v%d", version))
	if err != nil {
		return fmt.Errorf("build snapshot: %w", err)
	}
	if err := cp.cache.SetSnapshot(ctx, NodeID, snap); err != nil {
		return fmt.Errorf("set snapshot: %w", err)
	}
	cp.logger.Info("xds snapshot installed",
		slog.String("node", NodeID),
		slog.Uint64("version", version),
	)
	return nil
}

// Register wires the ADS service onto a gRPC server.
func (cp *ControlPlane) Register(gs *grpc.Server) {
	discoveryv3.RegisterAggregatedDiscoveryServiceServer(gs, cp.srv)
}

// NewGRPCServer returns a gRPC server configured for xDS streaming with
// keepalive tuned for long-lived ADS streams.
func NewGRPCServer() *grpc.Server {
	return grpc.NewServer(
		grpc.MaxConcurrentStreams(1<<16),
		grpc.KeepaliveEnforcementPolicy(keepalive.EnforcementPolicy{
			MinTime:             0,
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
		gs.GracefulStop()
		return nil
	case err := <-errCh:
		if err != nil {
			return fmt.Errorf("xds serve: %w", err)
		}
		return nil
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
			l.Debug("ads request",
				slog.Int64("stream", streamID),
				slog.String("type", req.GetTypeUrl()),
				slog.String("version", req.GetVersionInfo()),
				slog.String("node", nodeID(req.GetNode())),
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
