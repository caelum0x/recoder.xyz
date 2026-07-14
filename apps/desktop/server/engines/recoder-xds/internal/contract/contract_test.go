package contract_test

import (
	"bytes"
	"os"
	"path/filepath"
	"testing"

	listenerv3 "github.com/envoyproxy/go-control-plane/envoy/config/listener/v3"
	routev3 "github.com/envoyproxy/go-control-plane/envoy/config/route/v3"
	hcmv3 "github.com/envoyproxy/go-control-plane/envoy/extensions/filters/network/http_connection_manager/v3"
	resourcev3 "github.com/envoyproxy/go-control-plane/pkg/resource/v3"

	"github.com/recoder-xyz/recoder-xds/internal/config"
	"github.com/recoder-xyz/recoder-xds/internal/contract"
	"github.com/recoder-xyz/recoder-xds/internal/server"
	"github.com/recoder-xyz/recoder-xds/internal/snapshot"
)

// TestContractGoldenMatchesCode guards the checked-in contract.json that the
// TypeScript contract test reads. If the in-code contract changes without
// regenerating contract.json, this fails — keeping the two languages locked.
func TestContractGoldenMatchesCode(t *testing.T) {
	want, err := contract.Contract().JSON()
	if err != nil {
		t.Fatalf("marshal contract: %v", err)
	}
	path := filepath.Join("contract.json")
	got, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	// Normalize trailing newline differences.
	if !bytes.Equal(bytes.TrimSpace(got), bytes.TrimSpace(want)) {
		t.Fatalf("contract.json is stale.\n--- want ---\n%s\n--- got ---\n%s\n"+
			"regenerate with: go test ./internal/contract -run TestContractGoldenMatchesCode -update", want, got)
	}
}

// update regenerates contract.json from the in-code contract.
var update = func() bool {
	for _, a := range os.Args {
		if a == "-update" || a == "--update" {
			return true
		}
	}
	return false
}()

func TestMaybeRegenerateGolden(t *testing.T) {
	if !update {
		t.Skip("run with -update to regenerate contract.json")
	}
	b, err := contract.Contract().JSON()
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	if err := os.WriteFile("contract.json", append(b, '\n'), 0o644); err != nil {
		t.Fatalf("write golden: %v", err)
	}
}

// TestServerNodeIDMatchesContract proves the server's exported NodeID (what the
// snapshot is keyed under) is exactly the contract NodeID — i.e. the value a
// consuming Envoy's node.id must equal.
func TestServerNodeIDMatchesContract(t *testing.T) {
	if server.NodeID != contract.NodeID {
		t.Fatalf("server.NodeID = %q, contract.NodeID = %q", server.NodeID, contract.NodeID)
	}
}

// TestSnapshotUsesContractNames builds the real snapshot and asserts the
// listener / route-config / virtual-host names and the HCM http-filter ordering
// are exactly what the cross-language contract promises. This proves the
// constants are not dead literals: they are the names actually served.
func TestSnapshotUsesContractNames(t *testing.T) {
	cfg := config.Default(func(string) string { return "" })
	snap, err := snapshot.Build(cfg, "v1")
	if err != nil {
		t.Fatalf("Build: %v", err)
	}

	// Listener name.
	if _, ok := snap.GetResources(resourcev3.ListenerType)[contract.ListenerName]; !ok {
		t.Fatalf("snapshot missing listener named %q", contract.ListenerName)
	}
	lres := snap.GetResources(resourcev3.ListenerType)[contract.ListenerName]
	l := lres.(*listenerv3.Listener)

	// Route config + virtual host names.
	rres, ok := snap.GetResources(resourcev3.RouteType)[contract.RouteConfigName]
	if !ok {
		t.Fatalf("snapshot missing route config named %q", contract.RouteConfigName)
	}
	rc := rres.(*routev3.RouteConfiguration)
	if len(rc.GetVirtualHosts()) != 1 || rc.GetVirtualHosts()[0].GetName() != contract.VirtualHostName {
		t.Fatalf("virtual host name = %v, want %q",
			vhostNames(rc), contract.VirtualHostName)
	}

	// ext_authz cluster name (the contract default).
	if _, ok := snap.GetResources(resourcev3.ClusterType)[contract.ExtAuthzClusterName]; !ok {
		t.Fatalf("snapshot missing ext_authz cluster named %q", contract.ExtAuthzClusterName)
	}

	// HCM http-filter ordering matches the contract exactly.
	hcm := &hcmv3.HttpConnectionManager{}
	netFilters := l.GetFilterChains()[0].GetFilters()
	if err := netFilters[0].GetTypedConfig().UnmarshalTo(hcm); err != nil {
		t.Fatalf("unmarshal HCM: %v", err)
	}
	gotOrder := make([]string, 0, len(hcm.GetHttpFilters()))
	for _, f := range hcm.GetHttpFilters() {
		gotOrder = append(gotOrder, f.GetName())
	}
	if len(gotOrder) != len(contract.HTTPFilterOrder) {
		t.Fatalf("http filter count = %d (%v), want %d (%v)",
			len(gotOrder), gotOrder, len(contract.HTTPFilterOrder), contract.HTTPFilterOrder)
	}
	for i, name := range contract.HTTPFilterOrder {
		if gotOrder[i] != name {
			t.Fatalf("http filter[%d] = %q, want %q (full order: %v vs %v)",
				i, gotOrder[i], name, gotOrder, contract.HTTPFilterOrder)
		}
	}

	// Stat prefixes match the contract.
	if hcm.GetStatPrefix() != contract.HCMStatPrefix {
		t.Errorf("HCM stat prefix = %q, want %q", hcm.GetStatPrefix(), contract.HCMStatPrefix)
	}
}

func vhostNames(rc *routev3.RouteConfiguration) []string {
	out := make([]string, 0, len(rc.GetVirtualHosts()))
	for _, v := range rc.GetVirtualHosts() {
		out = append(out, v.GetName())
	}
	return out
}
