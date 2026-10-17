// Package contract is the single source of truth for the cross-language names
// that bind the Go xDS control plane to its data plane (Envoy) and to the
// TypeScript @recoder/network package that emits the consuming bootstrap.
//
// These names are load-bearing: the control plane keys its snapshot under
// NodeID, names its LDS listener ListenerName, its RDS route config
// RouteConfigName, and its catch-all vhost VirtualHostName. A consuming Envoy's
// bootstrap MUST set node.id == NodeID, and the TS package
// (packages/network/src/xds-contract.ts) MUST emit the same names. The contract
// test (and the TS contract test reading Contract().JSON()) fail fast on drift.
package contract

import "encoding/json"

const (
	// NodeID is the Envoy node id the control plane keys its single logical
	// snapshot under (ADS, single-node mesh). A consuming Envoy MUST set
	// node.id and node.cluster to this value.
	NodeID = "recoder-mesh"

	// ListenerName is the single ingress HTTPS listener served via LDS.
	ListenerName = "recoder_https_listener"

	// RouteConfigName is the RDS route configuration the HCM references.
	RouteConfigName = "recoder_local_route"

	// VirtualHostName is the catch-all virtual host inside the route config.
	VirtualHostName = "recoder_backend"

	// ExtAuthzClusterName is the default ext_authz cluster name. The TS
	// defaultNetworkConfig uses the same value; it is a default rather than a
	// hard constant (a NetworkConfig may override extAuthz.cluster), but the
	// shared default must agree across languages.
	ExtAuthzClusterName = "recoder_ext_authz"

	// HCMStatPrefix is the HTTP Connection Manager stat prefix.
	HCMStatPrefix = "recoder_ingress_http"

	// RateLimitStatPrefix is the local rate limiter stat prefix.
	RateLimitStatPrefix = "recoder_http_local_rate_limiter"
)

// HTTPFilterOrder is the required ordering of HCM http filters: rate-limit,
// then authz (default-deny), then router LAST. The TS static generator and this
// control plane MUST agree on this order, or a request could reach the router
// before being authorized.
var HTTPFilterOrder = []string{
	"envoy.filters.http.local_ratelimit",
	"envoy.filters.http.ext_authz",
	"envoy.filters.http.router",
}

// Names is the serializable view of the cross-language contract. It is consumed
// by the TS contract test (which reads contract.json) to assert byte-identical
// agreement between the two implementations.
type Names struct {
	NodeID              string   `json:"nodeId"`
	ListenerName        string   `json:"listenerName"`
	RouteConfigName     string   `json:"routeConfigName"`
	VirtualHostName     string   `json:"virtualHostName"`
	ExtAuthzClusterName string   `json:"extAuthzClusterName"`
	HCMStatPrefix       string   `json:"hcmStatPrefix"`
	RateLimitStatPrefix string   `json:"rateLimitStatPrefix"`
	HTTPFilterOrder     []string `json:"httpFilterOrder"`
}

// Contract returns the canonical cross-language name contract.
func Contract() Names {
	return Names{
		NodeID:              NodeID,
		ListenerName:        ListenerName,
		RouteConfigName:     RouteConfigName,
		VirtualHostName:     VirtualHostName,
		ExtAuthzClusterName: ExtAuthzClusterName,
		HCMStatPrefix:       HCMStatPrefix,
		RateLimitStatPrefix: RateLimitStatPrefix,
		HTTPFilterOrder:     HTTPFilterOrder,
	}
}

// JSON returns the canonical contract as indented JSON. The same bytes are
// written to internal/contract/contract.json so the TS side can read them.
func (n Names) JSON() ([]byte, error) {
	return json.MarshalIndent(n, "", "  ")
}
