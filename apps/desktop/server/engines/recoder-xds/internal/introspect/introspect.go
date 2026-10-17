// Package introspect turns the LIVE xDS snapshot the control plane is serving
// into a small, JSON-serializable, READ-ONLY report: the clusters, listeners,
// routes, and endpoints Envoy would receive, plus the snapshot version. It is
// the observe side of the mesh — it reports the CONFIG the control plane serves,
// never live traffic (there is no live data plane until launch), so every
// endpoint/cluster is reported as `registered`, not health-probed.
//
// It reads a go-control-plane cache snapshot (the same object served over ADS)
// and unpacks the real Envoy v3 protos, so the report can never drift from what
// the data plane is actually told.
package introspect

import (
	clusterv3 "github.com/envoyproxy/go-control-plane/envoy/config/cluster/v3"
	listenerv3 "github.com/envoyproxy/go-control-plane/envoy/config/listener/v3"
	routev3 "github.com/envoyproxy/go-control-plane/envoy/config/route/v3"
	hcmv3 "github.com/envoyproxy/go-control-plane/envoy/extensions/filters/network/http_connection_manager/v3"
	"github.com/envoyproxy/go-control-plane/pkg/cache/types"
	resourcev3 "github.com/envoyproxy/go-control-plane/pkg/resource/v3"
)

// registered is the truthful endpoint/cluster status pre-launch: the mesh is
// REGISTERED AND OBSERVABLE with NO LIVE DATA PLANE, so a config entry is
// `registered`, never a faked `active`/`healthy`.
const registered = "registered"

// Snapshot is the read side of a served cache snapshot (*cachev3.Snapshot fits).
// The server passes its live snapshot as this interface so the report reflects
// exactly what Envoy is served.
type Snapshot interface {
	GetVersion(typeURL resourcev3.Type) string
	GetResources(typeURL resourcev3.Type) map[string]types.Resource
}

// Report is the full read-only introspection of the served snapshot.
type Report struct {
	NodeID    string         `json:"nodeId"`
	Version   string         `json:"version"`
	Ready     bool           `json:"ready"`
	Counts    ResourceCounts `json:"counts"`
	Clusters  []Cluster      `json:"clusters"`
	Listeners []Listener     `json:"listeners"`
	Routes    []RouteConfig  `json:"routes"`
	Endpoints []Endpoint     `json:"endpoints"`
}

// ResourceCounts is the at-a-glance resource tally for the snapshot view.
type ResourceCounts struct {
	Clusters  int `json:"clusters"`
	Listeners int `json:"listeners"`
	Routes    int `json:"routes"`
	Endpoints int `json:"endpoints"`
}

// Cluster is a CDS cluster registration (name, discovery type, its endpoints).
type Cluster struct {
	Name      string     `json:"name"`
	Type      string     `json:"type"`
	Status    string     `json:"status"`
	Endpoints []Endpoint `json:"endpoints"`
}

// Endpoint is one upstream address registered under a cluster. `Status` is
// `registered`: the control plane knows the config, not a live health result.
type Endpoint struct {
	Cluster string `json:"cluster"`
	Address string `json:"address"`
	Port    uint32 `json:"port"`
	Status  string `json:"status"`
}

// Listener is an LDS listener registration (address + its HCM filter order).
type Listener struct {
	Name         string   `json:"name"`
	Address      string   `json:"address"`
	Port         uint32   `json:"port"`
	FilterChains int      `json:"filterChains"`
	HTTPFilters  []string `json:"httpFilters"`
	RouteConfig  string   `json:"routeConfig"`
}

// RouteConfig is an RDS route configuration (its virtual hosts + prefix routes).
type RouteConfig struct {
	Name         string        `json:"name"`
	VirtualHosts []VirtualHost `json:"virtualHosts"`
}

// VirtualHost is one domain-matched host inside a route config.
type VirtualHost struct {
	Name    string   `json:"name"`
	Domains []string `json:"domains"`
	Routes  []Route  `json:"routes"`
}

// Route is a single prefix -> cluster mapping inside a virtual host.
type Route struct {
	Prefix  string `json:"prefix"`
	Cluster string `json:"cluster"`
}

// Build extracts a Report from the live served snapshot. It never panics: a nil
// snapshot yields an empty (but well-formed) report so the HTTP surface can
// still answer truthfully while the control plane is warming up.
func Build(nodeID string, snap Snapshot) Report {
	r := Report{NodeID: nodeID, Clusters: []Cluster{}, Listeners: []Listener{}, Routes: []RouteConfig{}, Endpoints: []Endpoint{}}
	if snap == nil {
		return r
	}
	r.Version = snap.GetVersion(resourcev3.ClusterType)

	r.Clusters, r.Endpoints = extractClusters(snap.GetResources(resourcev3.ClusterType))
	r.Listeners = extractListeners(snap.GetResources(resourcev3.ListenerType))
	r.Routes = extractRoutes(snap.GetResources(resourcev3.RouteType))
	r.Counts = ResourceCounts{
		Clusters:  len(r.Clusters),
		Listeners: len(r.Listeners),
		Routes:    len(r.Routes),
		Endpoints: len(r.Endpoints),
	}
	return r
}

func extractClusters(res map[string]types.Resource) ([]Cluster, []Endpoint) {
	clusters := make([]Cluster, 0, len(res))
	allEndpoints := make([]Endpoint, 0, len(res))
	for _, raw := range res {
		c, ok := raw.(*clusterv3.Cluster)
		if !ok {
			continue
		}
		eps := clusterEndpoints(c)
		clusters = append(clusters, Cluster{
			Name:      c.GetName(),
			Type:      c.GetType().String(),
			Status:    registered,
			Endpoints: eps,
		})
		allEndpoints = append(allEndpoints, eps...)
	}
	return clusters, allEndpoints
}

func clusterEndpoints(c *clusterv3.Cluster) []Endpoint {
	la := c.GetLoadAssignment()
	if la == nil {
		return []Endpoint{}
	}
	out := make([]Endpoint, 0)
	for _, locality := range la.GetEndpoints() {
		for _, lb := range locality.GetLbEndpoints() {
			addr := lb.GetEndpoint().GetAddress().GetSocketAddress()
			if addr == nil {
				continue
			}
			out = append(out, Endpoint{
				Cluster: c.GetName(),
				Address: addr.GetAddress(),
				Port:    addr.GetPortValue(),
				Status:  registered,
			})
		}
	}
	return out
}

func extractListeners(res map[string]types.Resource) []Listener {
	out := make([]Listener, 0, len(res))
	for _, raw := range res {
		l, ok := raw.(*listenerv3.Listener)
		if !ok {
			continue
		}
		addr := l.GetAddress().GetSocketAddress()
		item := Listener{
			Name:         l.GetName(),
			FilterChains: len(l.GetFilterChains()),
		}
		if addr != nil {
			item.Address = addr.GetAddress()
			item.Port = addr.GetPortValue()
		}
		item.HTTPFilters, item.RouteConfig = listenerHCM(l)
		out = append(out, item)
	}
	return out
}

// listenerHCM unpacks the HTTP connection manager from a listener's first filter
// chain to surface the ordered HTTP filter names and the RDS route config it
// references — the security-critical bit (ext_authz/local_ratelimit ordering).
func listenerHCM(l *listenerv3.Listener) ([]string, string) {
	for _, chain := range l.GetFilterChains() {
		for _, f := range chain.GetFilters() {
			tc := f.GetTypedConfig()
			if tc == nil {
				continue
			}
			hcm := &hcmv3.HttpConnectionManager{}
			if err := tc.UnmarshalTo(hcm); err != nil {
				continue
			}
			names := make([]string, 0, len(hcm.GetHttpFilters()))
			for _, hf := range hcm.GetHttpFilters() {
				names = append(names, hf.GetName())
			}
			return names, hcm.GetRds().GetRouteConfigName()
		}
	}
	return []string{}, ""
}

func extractRoutes(res map[string]types.Resource) []RouteConfig {
	out := make([]RouteConfig, 0, len(res))
	for _, raw := range res {
		rc, ok := raw.(*routev3.RouteConfiguration)
		if !ok {
			continue
		}
		out = append(out, RouteConfig{
			Name:         rc.GetName(),
			VirtualHosts: extractVirtualHosts(rc.GetVirtualHosts()),
		})
	}
	return out
}

func extractVirtualHosts(vhosts []*routev3.VirtualHost) []VirtualHost {
	out := make([]VirtualHost, 0, len(vhosts))
	for _, vh := range vhosts {
		routes := make([]Route, 0, len(vh.GetRoutes()))
		for _, rt := range vh.GetRoutes() {
			routes = append(routes, Route{
				Prefix:  rt.GetMatch().GetPrefix(),
				Cluster: rt.GetRoute().GetCluster(),
			})
		}
		out = append(out, VirtualHost{
			Name:    vh.GetName(),
			Domains: vh.GetDomains(),
			Routes:  routes,
		})
	}
	return out
}
