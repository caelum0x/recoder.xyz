package server

import (
	"context"
	"net"
	"sync"
	"testing"
	"time"

	clusterv3 "github.com/envoyproxy/go-control-plane/envoy/config/cluster/v3"
	corev3 "github.com/envoyproxy/go-control-plane/envoy/config/core/v3"
	discoveryv3 "github.com/envoyproxy/go-control-plane/envoy/service/discovery/v3"
	resourcev3 "github.com/envoyproxy/go-control-plane/pkg/resource/v3"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	healthpb "google.golang.org/grpc/health/grpc_health_v1"

	"github.com/recoder-xyz/recoder-xds/internal/config"
)

// TestADSServesClusters boots a real ControlPlane, dials its ADS endpoint with a
// real gRPC client, and verifies the snapshot's clusters are streamed back. This
// exercises the actual go-control-plane server path end to end — no mocks.
func TestADSServesClusters(t *testing.T) {
	cfg := config.Default(func(string) string { return "" })

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	cp, err := New(ctx, cfg, nil)
	if err != nil {
		t.Fatalf("New: %v", err)
	}

	lis, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	gs := NewGRPCServer()
	cp.Register(gs)
	go func() { _ = gs.Serve(lis) }()
	defer gs.GracefulStop()

	conn, err := grpc.NewClient(lis.Addr().String(),
		grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	defer conn.Close()

	client := discoveryv3.NewAggregatedDiscoveryServiceClient(conn)
	streamCtx, streamCancel := context.WithTimeout(ctx, 5*time.Second)
	defer streamCancel()

	stream, err := client.StreamAggregatedResources(streamCtx)
	if err != nil {
		t.Fatalf("open ADS stream: %v", err)
	}

	// Request the cluster resources for our node, like a real Envoy would.
	if err := stream.Send(&discoveryv3.DiscoveryRequest{
		Node:    &corev3.Node{Id: NodeID},
		TypeUrl: resourcev3.ClusterType,
	}); err != nil {
		t.Fatalf("send CDS request: %v", err)
	}

	resp, err := stream.Recv()
	if err != nil {
		t.Fatalf("recv CDS response: %v", err)
	}
	if resp.GetTypeUrl() != resourcev3.ClusterType {
		t.Fatalf("response type = %q, want %q", resp.GetTypeUrl(), resourcev3.ClusterType)
	}

	wantClusters := len(cfg.Upstreams) + 1
	if len(resp.GetResources()) != wantClusters {
		t.Fatalf("served %d clusters, want %d", len(resp.GetResources()), wantClusters)
	}

	// Decode one cluster to confirm real protos crossed the wire.
	got := map[string]bool{}
	for _, any := range resp.GetResources() {
		c := &clusterv3.Cluster{}
		if err := any.UnmarshalTo(c); err != nil {
			t.Fatalf("unmarshal served cluster: %v", err)
		}
		got[c.GetName()] = true
	}
	for _, u := range cfg.Upstreams {
		if !got[u.Name] {
			t.Errorf("served clusters missing %q", u.Name)
		}
	}
	if !got[cfg.ExtAuthz.Cluster] {
		t.Errorf("served clusters missing ext_authz cluster %q", cfg.ExtAuthz.Cluster)
	}
}

// TestUpdateConfigBumpsVersion verifies snapshots get monotonic versions so
// Envoy always perceives a change and re-syncs.
func TestUpdateConfigBumpsVersion(t *testing.T) {
	cfg := config.Default(func(string) string { return "" })
	ctx := context.Background()
	cp, err := New(ctx, cfg, nil)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	if err := cp.UpdateConfig(ctx, cfg); err != nil {
		t.Fatalf("UpdateConfig: %v", err)
	}
	if cp.version.Load() < 2 {
		t.Errorf("version = %d, want >= 2 after one update", cp.version.Load())
	}
	if cp.Version() != cp.version.Load() {
		t.Errorf("Version() = %d, want %d", cp.Version(), cp.version.Load())
	}
}

// TestUpdateConfigRejectsBadConfigKeepsVersion proves a build/validation failure
// does NOT advance the served version: the live snapshot is untouched so a bad
// push can never blank the data plane (fail-safe no-restart update).
func TestUpdateConfigRejectsBadConfigKeepsVersion(t *testing.T) {
	cfg := config.Default(func(string) string { return "" })
	ctx := context.Background()
	cp, err := New(ctx, cfg, nil)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	before := cp.Version()

	bad := cfg
	bad.Upstreams = nil // fails NetworkConfig.Validate (>=1 upstream required)
	if err := cp.UpdateConfig(ctx, bad); err == nil {
		t.Fatalf("UpdateConfig(bad) = nil, want validation error")
	}
	if got := cp.Version(); got != before {
		t.Errorf("version advanced on rejected config: got %d, want %d", got, before)
	}
}

// TestConcurrentUpdatesAreMonotonic hammers UpdateConfig from many goroutines and
// asserts the final served version equals the number of successful updates. The
// updateMu lock is what keeps assign-build-install ordered; without it a slow
// build could install an older snapshot after a newer one.
func TestConcurrentUpdatesAreMonotonic(t *testing.T) {
	cfg := config.Default(func(string) string { return "" })
	ctx := context.Background()
	cp, err := New(ctx, cfg, nil)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	start := cp.Version()

	const n = 50
	var wg sync.WaitGroup
	wg.Add(n)
	for i := 0; i < n; i++ {
		go func() {
			defer wg.Done()
			if err := cp.UpdateConfig(ctx, cfg); err != nil {
				t.Errorf("UpdateConfig: %v", err)
			}
		}()
	}
	wg.Wait()

	if got := cp.Version(); got != start+n {
		t.Errorf("final version = %d, want %d (no lost/regressed updates)", got, start+n)
	}
}

// TestHealthServiceReportsServing dials the gRPC health service the control
// plane registers and asserts both the overall server and the ADS service
// report SERVING — the standard probe an orchestrator uses for the gRPC port.
func TestHealthServiceReportsServing(t *testing.T) {
	cfg := config.Default(func(string) string { return "" })
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	cp, err := New(ctx, cfg, nil)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	lis, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	gs := NewGRPCServer()
	cp.Register(gs)
	go func() { _ = gs.Serve(lis) }()
	defer gs.GracefulStop()

	conn, err := grpc.NewClient(lis.Addr().String(),
		grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	defer conn.Close()

	hc := healthpb.NewHealthClient(conn)
	checkCtx, checkCancel := context.WithTimeout(ctx, 5*time.Second)
	defer checkCancel()

	for _, svc := range []string{"", adsServiceName} {
		resp, err := hc.Check(checkCtx, &healthpb.HealthCheckRequest{Service: svc})
		if err != nil {
			t.Fatalf("health check %q: %v", svc, err)
		}
		if resp.GetStatus() != healthpb.HealthCheckResponse_SERVING {
			t.Errorf("health %q = %v, want SERVING", svc, resp.GetStatus())
		}
	}
}
