package snapshot

import (
	"testing"

	clusterv3 "github.com/envoyproxy/go-control-plane/envoy/config/cluster/v3"
	listenerv3 "github.com/envoyproxy/go-control-plane/envoy/config/listener/v3"
	routev3 "github.com/envoyproxy/go-control-plane/envoy/config/route/v3"
	extauthzv3 "github.com/envoyproxy/go-control-plane/envoy/extensions/filters/http/ext_authz/v3"
	hcmv3 "github.com/envoyproxy/go-control-plane/envoy/extensions/filters/network/http_connection_manager/v3"
	"github.com/envoyproxy/go-control-plane/pkg/cache/types"
	resourcev3 "github.com/envoyproxy/go-control-plane/pkg/resource/v3"

	"github.com/recoder-xyz/recoder-xds/internal/config"
)

func testConfig() config.NetworkConfig {
	cfg := config.Default(func(string) string { return "" })
	// Enable mTLS to exercise the require-client-cert path.
	cfg.TLS.ClientCAPath = "/etc/envoy/certs/ca.crt"
	return cfg
}

func TestBuildSnapshotConsistent(t *testing.T) {
	cfg := testConfig()
	snap, err := Build(cfg, "v1")
	if err != nil {
		t.Fatalf("Build: %v", err)
	}
	if err := snap.Consistent(); err != nil {
		t.Fatalf("snapshot not Consistent(): %v", err)
	}
}

func TestBuildClusters(t *testing.T) {
	cfg := testConfig()
	snap, err := Build(cfg, "v1")
	if err != nil {
		t.Fatalf("Build: %v", err)
	}

	clusterRes := snap.GetResources(resourcev3.ClusterType)
	// One cluster per upstream + one ext_authz cluster.
	wantCount := len(cfg.Upstreams) + 1
	if len(clusterRes) != wantCount {
		t.Fatalf("cluster count = %d, want %d", len(clusterRes), wantCount)
	}

	for _, u := range cfg.Upstreams {
		res, ok := clusterRes[u.Name]
		if !ok {
			t.Fatalf("missing cluster %q", u.Name)
		}
		c, ok := res.(*clusterv3.Cluster)
		if !ok {
			t.Fatalf("cluster %q is not *Cluster, got %T", u.Name, res)
		}
		if c.GetType() != clusterv3.Cluster_STRICT_DNS {
			t.Errorf("cluster %q type = %v, want STRICT_DNS", u.Name, c.GetType())
		}
		eps := c.GetLoadAssignment().GetEndpoints()
		if len(eps) != 1 || len(eps[0].GetLbEndpoints()) != 1 {
			t.Fatalf("cluster %q endpoints malformed", u.Name)
		}
		addr := eps[0].GetLbEndpoints()[0].GetEndpoint().GetAddress().GetSocketAddress()
		if addr.GetAddress() != u.Host || addr.GetPortValue() != u.Port {
			t.Errorf("cluster %q addr = %s:%d, want %s:%d",
				u.Name, addr.GetAddress(), addr.GetPortValue(), u.Host, u.Port)
		}
	}

	if _, ok := clusterRes[cfg.ExtAuthz.Cluster]; !ok {
		t.Fatalf("missing ext_authz cluster %q", cfg.ExtAuthz.Cluster)
	}
}

func TestBuildRouteConfig(t *testing.T) {
	cfg := testConfig()
	snap, err := Build(cfg, "v1")
	if err != nil {
		t.Fatalf("Build: %v", err)
	}
	res, ok := snap.GetResources(resourcev3.RouteType)[RouteConfigName]
	if !ok {
		t.Fatalf("missing route config %q", RouteConfigName)
	}
	rc, ok := res.(*routev3.RouteConfiguration)
	if !ok {
		t.Fatalf("route config wrong type %T", res)
	}
	vhosts := rc.GetVirtualHosts()
	if len(vhosts) != 1 {
		t.Fatalf("vhost count = %d, want 1", len(vhosts))
	}
	if len(vhosts[0].GetRoutes()) != len(cfg.Upstreams) {
		t.Errorf("route count = %d, want %d", len(vhosts[0].GetRoutes()), len(cfg.Upstreams))
	}
}

func TestBuildListenerHasExtAuthzFilter(t *testing.T) {
	cfg := testConfig()
	snap, err := Build(cfg, "v1")
	if err != nil {
		t.Fatalf("Build: %v", err)
	}

	res, ok := snap.GetResources(resourcev3.ListenerType)[ListenerName]
	if !ok {
		t.Fatalf("missing listener %q", ListenerName)
	}
	l, ok := res.(*listenerv3.Listener)
	if !ok {
		t.Fatalf("listener wrong type %T", res)
	}

	chains := l.GetFilterChains()
	if len(chains) != 1 {
		t.Fatalf("filter chain count = %d, want 1", len(chains))
	}

	// The chain must carry a downstream TLS transport socket (mTLS enabled here).
	if chains[0].GetTransportSocket() == nil {
		t.Fatalf("filter chain missing TLS transport socket")
	}

	// Unmarshal the HCM and assert its http_filters include ext_authz + router,
	// with ext_authz ordered before router and pointing at the ext_authz cluster.
	netFilters := chains[0].GetFilters()
	if len(netFilters) != 1 {
		t.Fatalf("network filter count = %d, want 1", len(netFilters))
	}
	hcm := &hcmv3.HttpConnectionManager{}
	if err := netFilters[0].GetTypedConfig().UnmarshalTo(hcm); err != nil {
		t.Fatalf("unmarshal HCM: %v", err)
	}

	// RDS must reference the route config by name (dynamic, not inlined).
	rds := hcm.GetRds()
	if rds == nil || rds.GetRouteConfigName() != RouteConfigName {
		t.Fatalf("HCM not configured for RDS route %q", RouteConfigName)
	}

	httpFilters := hcm.GetHttpFilters()
	var extAuthzIdx, routerIdx = -1, -1
	var extAuthz *extauthzv3.ExtAuthz
	for i, f := range httpFilters {
		switch f.GetName() {
		case "envoy.filters.http.ext_authz":
			extAuthzIdx = i
			ea := &extauthzv3.ExtAuthz{}
			if err := f.GetTypedConfig().UnmarshalTo(ea); err != nil {
				t.Fatalf("unmarshal ext_authz: %v", err)
			}
			extAuthz = ea
		case "envoy.filters.http.router":
			routerIdx = i
		}
	}
	if extAuthzIdx < 0 {
		t.Fatalf("ext_authz http filter not found; filters=%v", filterNames(httpFilters))
	}
	if routerIdx < 0 {
		t.Fatalf("router http filter not found; filters=%v", filterNames(httpFilters))
	}
	if extAuthzIdx >= routerIdx {
		t.Errorf("ext_authz (%d) must come before router (%d)", extAuthzIdx, routerIdx)
	}

	// ext_authz must be fail-closed and target the ext_authz cluster over HTTP.
	if extAuthz.GetFailureModeAllow() {
		t.Errorf("ext_authz failure_mode_allow = true, want false (fail-closed)")
	}
	httpSvc := extAuthz.GetHttpService()
	if httpSvc == nil {
		t.Fatalf("ext_authz http_service nil")
	}
	if got := httpSvc.GetServerUri().GetCluster(); got != cfg.ExtAuthz.Cluster {
		t.Errorf("ext_authz cluster = %q, want %q", got, cfg.ExtAuthz.Cluster)
	}
	if got := httpSvc.GetPathPrefix(); got != cfg.ExtAuthz.Path {
		t.Errorf("ext_authz path_prefix = %q, want %q", got, cfg.ExtAuthz.Path)
	}

	// Access log must be wired (the XDR feed).
	if len(hcm.GetAccessLog()) != 1 {
		t.Errorf("access log count = %d, want 1", len(hcm.GetAccessLog()))
	}
}

func TestBuildRejectsInvalidConfig(t *testing.T) {
	cfg := testConfig()
	cfg.Upstreams = nil // invalid: no upstreams
	if _, err := Build(cfg, "v1"); err == nil {
		t.Fatalf("Build accepted invalid config (no upstreams)")
	}
}

func filterNames(fs []*hcmv3.HttpFilter) []string {
	out := make([]string, 0, len(fs))
	for _, f := range fs {
		out = append(out, f.GetName())
	}
	return out
}

// Guard: snapshot resources implement the cache types.Resource interface.
var _ types.Resource = (*clusterv3.Cluster)(nil)
