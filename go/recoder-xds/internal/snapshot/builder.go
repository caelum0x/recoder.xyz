// Package snapshot builds a go-control-plane cache.Snapshot from a NetworkConfig.
//
// This is the dynamic equivalent of docker-backend/src/network/envoy-config.ts:
// the TS side emits a STATIC bootstrap object; here we construct the SAME shapes
// as real Envoy v3 protobuf messages and pack them into an xDS snapshot so a
// running Envoy (pointed at this control plane over ADS) receives live CDS/LDS/
// RDS updates.
//
// Hostile-by-default: the HCM filter chain wires ext_authz (fail-closed) and a
// local rate limit before the router.
package snapshot

import (
	"fmt"
	"time"

	accesslogv3 "github.com/envoyproxy/go-control-plane/envoy/config/accesslog/v3"
	clusterv3 "github.com/envoyproxy/go-control-plane/envoy/config/cluster/v3"
	corev3 "github.com/envoyproxy/go-control-plane/envoy/config/core/v3"
	endpointv3 "github.com/envoyproxy/go-control-plane/envoy/config/endpoint/v3"
	listenerv3 "github.com/envoyproxy/go-control-plane/envoy/config/listener/v3"
	routev3 "github.com/envoyproxy/go-control-plane/envoy/config/route/v3"
	accesslogfilev3 "github.com/envoyproxy/go-control-plane/envoy/extensions/access_loggers/file/v3"
	extauthzv3 "github.com/envoyproxy/go-control-plane/envoy/extensions/filters/http/ext_authz/v3"
	localratelimitv3 "github.com/envoyproxy/go-control-plane/envoy/extensions/filters/http/local_ratelimit/v3"
	routerv3 "github.com/envoyproxy/go-control-plane/envoy/extensions/filters/http/router/v3"
	hcmv3 "github.com/envoyproxy/go-control-plane/envoy/extensions/filters/network/http_connection_manager/v3"
	tlsv3 "github.com/envoyproxy/go-control-plane/envoy/extensions/transport_sockets/tls/v3"
	matcherv3 "github.com/envoyproxy/go-control-plane/envoy/type/matcher/v3"
	typev3 "github.com/envoyproxy/go-control-plane/envoy/type/v3"

	"github.com/envoyproxy/go-control-plane/pkg/cache/types"
	cachev3 "github.com/envoyproxy/go-control-plane/pkg/cache/v3"
	resourcev3 "github.com/envoyproxy/go-control-plane/pkg/resource/v3"

	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/anypb"
	"google.golang.org/protobuf/types/known/durationpb"
	"google.golang.org/protobuf/types/known/structpb"
	"google.golang.org/protobuf/types/known/wrapperspb"

	"github.com/recoder-xyz/recoder-xds/internal/config"
)

const (
	// ListenerName is the single ingress HTTPS listener served via LDS.
	ListenerName = "recoder_https_listener"
	// RouteConfigName is the RDS route configuration the HCM references.
	RouteConfigName = "recoder_local_route"
	// VirtualHostName is the catch-all virtual host inside the route config.
	VirtualHostName = "recoder_backend"
	// statPrefix for the HCM.
	hcmStatPrefix = "recoder_ingress_http"
	// statPrefix for the local rate limiter.
	rateLimitStatPrefix = "recoder_http_local_rate_limiter"
)

// accessLogJSONFormat mirrors ACCESS_LOG_JSON_FORMAT in envoy-config.ts. The XDR
// parser (xdr/parser.ts) depends on exactly these keys.
var accessLogJSONFormat = map[string]string{
	"timestamp":      "%START_TIME%",
	"method":         "%REQ(:METHOD)%",
	"path":           "%REQ(X-ENVOY-ORIGINAL-PATH?:PATH)%",
	"response_code":  "%RESPONSE_CODE%",
	"response_flags": "%RESPONSE_FLAGS%",
	"source_ip":      "%DOWNSTREAM_REMOTE_ADDRESS_WITHOUT_PORT%",
	"principal":      "%DOWNSTREAM_PEER_URI_SAN%",
	"upstream":       "%UPSTREAM_CLUSTER%",
	"bytes_sent":     "%BYTES_SENT%",
	"duration_ms":    "%DURATION%",
}

// Build constructs a consistent xDS snapshot from the NetworkConfig. The version
// string is opaque to Envoy but must change whenever resources change so the
// data plane re-syncs. Callers typically pass a monotonic counter or timestamp.
func Build(cfg config.NetworkConfig, version string) (*cachev3.Snapshot, error) {
	if err := cfg.Validate(); err != nil {
		return nil, fmt.Errorf("snapshot build: %w", err)
	}

	clusters, err := buildClusters(cfg)
	if err != nil {
		return nil, err
	}
	routeConfig, err := buildRouteConfig(cfg)
	if err != nil {
		return nil, err
	}
	listener, err := buildListener(cfg)
	if err != nil {
		return nil, err
	}

	snap, err := cachev3.NewSnapshot(version, map[resourcev3.Type][]types.Resource{
		resourcev3.ClusterType:  clusters,
		resourcev3.RouteType:    {routeConfig},
		resourcev3.ListenerType: {listener},
	})
	if err != nil {
		return nil, fmt.Errorf("new snapshot: %w", err)
	}
	// Consistency check: ADS demands that the resources referenced by listeners
	// (route configs) and clusters (endpoints) are coherent within the snapshot.
	if err := snap.Consistent(); err != nil {
		return nil, fmt.Errorf("snapshot inconsistent: %w", err)
	}
	return snap, nil
}

// --- Clusters --------------------------------------------------------------

func buildClusters(cfg config.NetworkConfig) ([]types.Resource, error) {
	out := make([]types.Resource, 0, len(cfg.Upstreams)+1)
	for _, u := range cfg.Upstreams {
		c, err := buildUpstreamCluster(u)
		if err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	out = append(out, buildExtAuthzCluster(cfg.ExtAuthz))
	return out, nil
}

func socketAddress(host string, port uint32) *corev3.Address {
	return &corev3.Address{
		Address: &corev3.Address_SocketAddress{
			SocketAddress: &corev3.SocketAddress{
				Address: host,
				PortSpecifier: &corev3.SocketAddress_PortValue{
					PortValue: port,
				},
			},
		},
	}
}

func strictDNSCluster(name, host string, port uint32) *clusterv3.Cluster {
	return &clusterv3.Cluster{
		Name:                 name,
		ConnectTimeout:       durationpb.New(time.Second),
		LbPolicy:             clusterv3.Cluster_ROUND_ROBIN,
		ClusterDiscoveryType: &clusterv3.Cluster_Type{Type: clusterv3.Cluster_STRICT_DNS},
		LoadAssignment: &endpointv3.ClusterLoadAssignment{
			ClusterName: name,
			Endpoints: []*endpointv3.LocalityLbEndpoints{
				{
					LbEndpoints: []*endpointv3.LbEndpoint{
						{
							HostIdentifier: &endpointv3.LbEndpoint_Endpoint{
								Endpoint: &endpointv3.Endpoint{
									Address: socketAddress(host, port),
								},
							},
						},
					},
				},
			},
		},
	}
}

func buildUpstreamCluster(u config.Upstream) (*clusterv3.Cluster, error) {
	c := strictDNSCluster(u.Name, u.Host, u.Port)
	if u.TLSUpstream {
		sni := u.HostHeader
		if sni == "" {
			sni = u.Host
		}
		ts, err := upstreamTLSTransportSocket(sni)
		if err != nil {
			return nil, fmt.Errorf("upstream %q tls: %w", u.Name, err)
		}
		c.TransportSocket = ts
	}
	return c, nil
}

func buildExtAuthzCluster(ea config.ExtAuthz) *clusterv3.Cluster {
	return strictDNSCluster(ea.Cluster, ea.Host, ea.Port)
}

func upstreamTLSTransportSocket(sni string) (*corev3.TransportSocket, error) {
	ctx := &tlsv3.UpstreamTlsContext{Sni: sni}
	any, err := anypb.New(ctx)
	if err != nil {
		return nil, err
	}
	return &corev3.TransportSocket{
		Name:       "envoy.transport_sockets.tls",
		ConfigType: &corev3.TransportSocket_TypedConfig{TypedConfig: any},
	}, nil
}

// --- Routes ----------------------------------------------------------------

func buildRouteConfig(cfg config.NetworkConfig) (*routev3.RouteConfiguration, error) {
	routes := make([]*routev3.Route, 0, len(cfg.Upstreams))
	for _, u := range cfg.Upstreams {
		route := &routev3.Route{
			Match: &routev3.RouteMatch{
				PathSpecifier: &routev3.RouteMatch_Prefix{Prefix: "/" + u.Name + "/"},
			},
			Action: &routev3.Route_Route{
				Route: &routev3.RouteAction{
					ClusterSpecifier: &routev3.RouteAction_Cluster{Cluster: u.Name},
					PrefixRewrite:    "/",
				},
			},
		}
		if u.HostHeader != "" {
			route.GetRoute().HostRewriteSpecifier = &routev3.RouteAction_HostRewriteLiteral{
				HostRewriteLiteral: u.HostHeader,
			}
		}
		routes = append(routes, route)
	}
	return &routev3.RouteConfiguration{
		Name: RouteConfigName,
		VirtualHosts: []*routev3.VirtualHost{
			{
				Name:    VirtualHostName,
				Domains: []string{"*"},
				Routes:  routes,
			},
		},
	}, nil
}

// --- Listener (HCM + filters) ----------------------------------------------

func buildListener(cfg config.NetworkConfig) (*listenerv3.Listener, error) {
	hcmAny, err := buildHCM(cfg)
	if err != nil {
		return nil, err
	}
	transportSocket, err := downstreamTLSTransportSocket(cfg.TLS)
	if err != nil {
		return nil, err
	}
	return &listenerv3.Listener{
		Name:    ListenerName,
		Address: socketAddress(cfg.ListenAddress, cfg.ListenPort),
		FilterChains: []*listenerv3.FilterChain{
			{
				Filters: []*listenerv3.Filter{
					{
						Name:       "envoy.filters.network.http_connection_manager",
						ConfigType: &listenerv3.Filter_TypedConfig{TypedConfig: hcmAny},
					},
				},
				TransportSocket: transportSocket,
			},
		},
	}, nil
}

func buildHCM(cfg config.NetworkConfig) (*anypb.Any, error) {
	accessLog, err := buildAccessLog(cfg.AccessLog)
	if err != nil {
		return nil, err
	}
	rateLimitFilter, err := buildLocalRateLimitFilter(cfg.RateLimit)
	if err != nil {
		return nil, err
	}
	extAuthzFilter, err := buildExtAuthzFilter(cfg.ExtAuthz)
	if err != nil {
		return nil, err
	}
	routerFilter, err := buildRouterFilter()
	if err != nil {
		return nil, err
	}

	hcm := &hcmv3.HttpConnectionManager{
		StatPrefix: hcmStatPrefix,
		CodecType:  hcmv3.HttpConnectionManager_AUTO,
		// RDS: the route configuration is delivered dynamically over ADS rather
		// than inlined. This is the live-update path the control plane exists for.
		RouteSpecifier: &hcmv3.HttpConnectionManager_Rds{
			Rds: &hcmv3.Rds{
				RouteConfigName: RouteConfigName,
				ConfigSource:    adsConfigSource(),
			},
		},
		AccessLog: []*accesslogv3.AccessLog{accessLog},
		// Order matters: rate-limit, then authz (default-deny), then router last.
		HttpFilters: []*hcmv3.HttpFilter{rateLimitFilter, extAuthzFilter, routerFilter},
	}
	return anypb.New(hcm)
}

func adsConfigSource() *corev3.ConfigSource {
	return &corev3.ConfigSource{
		ResourceApiVersion: corev3.ApiVersion_V3,
		ConfigSourceSpecifier: &corev3.ConfigSource_Ads{
			Ads: &corev3.AggregatedConfigSource{},
		},
	}
}

func buildRouterFilter() (*hcmv3.HttpFilter, error) {
	any, err := anypb.New(&routerv3.Router{})
	if err != nil {
		return nil, err
	}
	return &hcmv3.HttpFilter{
		Name:       "envoy.filters.http.router",
		ConfigType: &hcmv3.HttpFilter_TypedConfig{TypedConfig: any},
	}, nil
}

func buildExtAuthzFilter(ea config.ExtAuthz) (*hcmv3.HttpFilter, error) {
	timeout := durationpb.New(time.Duration(ea.TimeoutMS) * time.Millisecond)
	extAuthz := &extauthzv3.ExtAuthz{
		TransportApiVersion: corev3.ApiVersion_V3,
		// Fail-closed by default: unreachable authz DENIES.
		FailureModeAllow: ea.FailureModeAllow,
		Services: &extauthzv3.ExtAuthz_HttpService{
			HttpService: &extauthzv3.HttpService{
				ServerUri: &corev3.HttpUri{
					Uri: fmt.Sprintf("http://%s:%d", ea.Host, ea.Port),
					HttpUpstreamType: &corev3.HttpUri_Cluster{
						Cluster: ea.Cluster,
					},
					Timeout: timeout,
				},
				PathPrefix: ea.Path,
				AuthorizationRequest: &extauthzv3.AuthorizationRequest{
					AllowedHeaders: &matcherv3.ListStringMatcher{
						Patterns: []*matcherv3.StringMatcher{
							exactIgnoreCase("authorization"),
							exactIgnoreCase("x-recoder-actor"),
							exactIgnoreCase("x-recoder-task"),
							prefixMatch("x-forwarded-"),
						},
					},
				},
				AuthorizationResponse: &extauthzv3.AuthorizationResponse{
					AllowedUpstreamHeaders: &matcherv3.ListStringMatcher{
						Patterns: []*matcherv3.StringMatcher{
							exactIgnoreCase("x-recoder-decision"),
						},
					},
				},
			},
		},
	}
	any, err := anypb.New(extAuthz)
	if err != nil {
		return nil, err
	}
	return &hcmv3.HttpFilter{
		Name:       "envoy.filters.http.ext_authz",
		ConfigType: &hcmv3.HttpFilter_TypedConfig{TypedConfig: any},
	}, nil
}

func buildLocalRateLimitFilter(rl config.RateLimit) (*hcmv3.HttpFilter, error) {
	full := &typev3.FractionalPercent{Numerator: 100, Denominator: typev3.FractionalPercent_HUNDRED}
	cfg := &localratelimitv3.LocalRateLimit{
		StatPrefix: rateLimitStatPrefix,
		TokenBucket: &typev3.TokenBucket{
			MaxTokens:     rl.MaxTokens,
			TokensPerFill: wrapperspb.UInt32(rl.TokensPerFill),
			FillInterval:  durationpb.New(time.Duration(rl.FillIntervalMS) * time.Millisecond),
		},
		FilterEnabled: &corev3.RuntimeFractionalPercent{
			RuntimeKey:   "local_rate_limit_enabled",
			DefaultValue: full,
		},
		FilterEnforced: &corev3.RuntimeFractionalPercent{
			RuntimeKey:   "local_rate_limit_enforced",
			DefaultValue: full,
		},
	}
	any, err := anypb.New(cfg)
	if err != nil {
		return nil, err
	}
	return &hcmv3.HttpFilter{
		Name:       "envoy.filters.http.local_ratelimit",
		ConfigType: &hcmv3.HttpFilter_TypedConfig{TypedConfig: any},
	}, nil
}

func exactIgnoreCase(s string) *matcherv3.StringMatcher {
	return &matcherv3.StringMatcher{
		MatchPattern: &matcherv3.StringMatcher_Exact{Exact: s},
		IgnoreCase:   true,
	}
}

func prefixMatch(s string) *matcherv3.StringMatcher {
	return &matcherv3.StringMatcher{
		MatchPattern: &matcherv3.StringMatcher_Prefix{Prefix: s},
	}
}

// --- Access log ------------------------------------------------------------

func buildAccessLog(al config.AccessLog) (*accesslogv3.AccessLog, error) {
	jsonFields := &structpb.Struct{Fields: map[string]*structpb.Value{}}
	for k, v := range accessLogJSONFormat {
		jsonFields.Fields[k] = structpb.NewStringValue(v)
	}
	fileLog := &accesslogfilev3.FileAccessLog{
		Path: al.Path,
		AccessLogFormat: &accesslogfilev3.FileAccessLog_LogFormat{
			LogFormat: &corev3.SubstitutionFormatString{
				Format: &corev3.SubstitutionFormatString_JsonFormat{
					JsonFormat: jsonFields,
				},
			},
		},
	}
	any, err := anypb.New(fileLog)
	if err != nil {
		return nil, err
	}
	return &accesslogv3.AccessLog{
		Name:       "envoy.access_loggers.file",
		ConfigType: &accesslogv3.AccessLog_TypedConfig{TypedConfig: any},
	}, nil
}

// --- Downstream TLS --------------------------------------------------------

func downstreamTLSTransportSocket(t config.TLS) (*corev3.TransportSocket, error) {
	minVersion := tlsv3.TlsParameters_TLSv1_2
	if t.MinVersion == "TLSv1_3" {
		minVersion = tlsv3.TlsParameters_TLSv1_3
	}
	common := &tlsv3.CommonTlsContext{
		TlsParams: &tlsv3.TlsParameters{
			TlsMinimumProtocolVersion: minVersion,
		},
		TlsCertificates: []*tlsv3.TlsCertificate{
			{
				CertificateChain: &corev3.DataSource{
					Specifier: &corev3.DataSource_Filename{Filename: t.CertPath},
				},
				PrivateKey: &corev3.DataSource{
					Specifier: &corev3.DataSource_Filename{Filename: t.KeyPath},
				},
			},
		},
	}
	downstream := &tlsv3.DownstreamTlsContext{CommonTlsContext: common}

	// mTLS: require + verify the client cert against the trusted CA bundle.
	if t.ClientCAPath != "" {
		common.ValidationContextType = &tlsv3.CommonTlsContext_ValidationContext{
			ValidationContext: &tlsv3.CertificateValidationContext{
				TrustedCa: &corev3.DataSource{
					Specifier: &corev3.DataSource_Filename{Filename: t.ClientCAPath},
				},
			},
		}
		downstream.RequireClientCertificate = wrapperspb.Bool(true)
	}

	any, err := anypb.New(downstream)
	if err != nil {
		return nil, err
	}
	return &corev3.TransportSocket{
		Name:       "envoy.transport_sockets.tls",
		ConfigType: &corev3.TransportSocket_TypedConfig{TypedConfig: any},
	}, nil
}

// Compile-time assurance the snapshot builder only emits real proto messages.
var _ proto.Message = (*clusterv3.Cluster)(nil)
