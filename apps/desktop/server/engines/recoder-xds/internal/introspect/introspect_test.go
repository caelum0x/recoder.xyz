package introspect

import (
	"testing"

	"github.com/recoder-xyz/recoder-xds/internal/config"
	"github.com/recoder-xyz/recoder-xds/internal/snapshot"
)

func testReport(t *testing.T) Report {
	t.Helper()
	cfg := config.Default(func(string) string { return "" })
	snap, err := snapshot.Build(cfg, "v7")
	if err != nil {
		t.Fatalf("Build snapshot: %v", err)
	}
	return Build("recoder-mesh", snap)
}

func TestBuildNilSnapshotIsWellFormed(t *testing.T) {
	r := Build("recoder-mesh", nil)
	if r.NodeID != "recoder-mesh" {
		t.Fatalf("nodeId = %q, want recoder-mesh", r.NodeID)
	}
	if r.Version != "" {
		t.Fatalf("version = %q, want empty", r.Version)
	}
	// Non-nil empty slices so JSON serializes [] not null.
	if r.Clusters == nil || r.Listeners == nil || r.Routes == nil || r.Endpoints == nil {
		t.Fatalf("nil slices in empty report: %+v", r)
	}
}

func TestBuildReportsSnapshotVersion(t *testing.T) {
	r := testReport(t)
	if r.Version != "v7" {
		t.Fatalf("version = %q, want v7", r.Version)
	}
}

func TestBuildClustersAndEndpoints(t *testing.T) {
	cfg := config.Default(func(string) string { return "" })
	r := testReport(t)

	wantClusters := len(cfg.Upstreams) + 1 // upstreams + ext_authz
	if r.Counts.Clusters != wantClusters {
		t.Fatalf("clusters = %d, want %d", r.Counts.Clusters, wantClusters)
	}
	if len(r.Clusters) != wantClusters {
		t.Fatalf("cluster slice = %d, want %d", len(r.Clusters), wantClusters)
	}
	for _, c := range r.Clusters {
		if c.Type != "STRICT_DNS" {
			t.Errorf("cluster %q type = %q, want STRICT_DNS", c.Name, c.Type)
		}
		if c.Status != registered {
			t.Errorf("cluster %q status = %q, want %q", c.Name, c.Status, registered)
		}
		if len(c.Endpoints) == 0 {
			t.Errorf("cluster %q has no endpoints", c.Name)
		}
		for _, e := range c.Endpoints {
			if e.Status != registered {
				t.Errorf("endpoint %s:%d status = %q, want registered (no live data plane)", e.Address, e.Port, e.Status)
			}
			if e.Port == 0 {
				t.Errorf("endpoint for %q has zero port", c.Name)
			}
		}
	}
	if r.Counts.Endpoints != len(r.Endpoints) || r.Counts.Endpoints == 0 {
		t.Fatalf("endpoint count = %d (flat=%d)", r.Counts.Endpoints, len(r.Endpoints))
	}
}

func TestBuildListenerCarriesHostileFilterOrder(t *testing.T) {
	r := testReport(t)
	if len(r.Listeners) != 1 {
		t.Fatalf("listeners = %d, want 1", len(r.Listeners))
	}
	l := r.Listeners[0]
	if l.RouteConfig == "" {
		t.Errorf("listener %q has no RDS route config name", l.Name)
	}
	// Hostile-by-default: local_ratelimit -> ext_authz -> router, authz before router.
	authz, router := -1, -1
	for i, f := range l.HTTPFilters {
		switch f {
		case "envoy.filters.http.ext_authz":
			authz = i
		case "envoy.filters.http.router":
			router = i
		}
	}
	if authz < 0 || router < 0 {
		t.Fatalf("missing ext_authz/router in %v", l.HTTPFilters)
	}
	if authz >= router {
		t.Fatalf("ext_authz (%d) must precede router (%d): %v", authz, router, l.HTTPFilters)
	}
}

func TestBuildRoutesMapPrefixesToClusters(t *testing.T) {
	cfg := config.Default(func(string) string { return "" })
	r := testReport(t)
	if len(r.Routes) != 1 {
		t.Fatalf("route configs = %d, want 1", len(r.Routes))
	}
	rc := r.Routes[0]
	if len(rc.VirtualHosts) != 1 {
		t.Fatalf("virtual hosts = %d, want 1", len(rc.VirtualHosts))
	}
	got := map[string]string{}
	for _, route := range rc.VirtualHosts[0].Routes {
		got[route.Prefix] = route.Cluster
	}
	for _, u := range cfg.Upstreams {
		if got["/"+u.Name+"/"] != u.Name {
			t.Errorf("route /%s/ -> %q, want %q", u.Name, got["/"+u.Name+"/"], u.Name)
		}
	}
}
