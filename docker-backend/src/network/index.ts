/**
 * Recoder Network + XDR module — the Envoy control plane.
 *
 * Public surface:
 *   - generateEnvoyConfig / emitYaml / emitJson / defaultNetworkConfig (envoy-config)
 *   - decideNetworkAuthz / extractAuthzRequest                          (ext-authz)
 *   - XdrSink / parseAccessLog / detect                                 (xdr)
 *   - createNetworkRouter / createNetworkInternalRouter                 (routes)
 */
export * from './types';
export * from './envoy-config';
export * from './ext-authz';
export * from './xdr';
export {
  createNetworkRouter,
  createNetworkInternalRouter,
  type NetworkRouterOptions,
} from './network.routes';
