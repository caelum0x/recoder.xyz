import type { McpServerRegistration } from '../registry';

/**
 * recodergit code-knowledge-graph MCP server registration.
 *
 * Exposes the read-only code-graph tools of the vendored `recodergit` engine
 * (Streamable HTTP at POST /mcp) to Recoder agents THROUGH the host's existing
 * permission/risk/audit path. Every tool here is read-only over code; none match
 * the host's high/medium-risk keyword heuristics, so they score `low` risk.
 *
 * Registration is governed and FLAG-GATED: this object is only added to the live
 * server list by the host when RECODER_CODE_GRAPH_ENABLED is on AND the
 * supervised `mcp --http` process is being brought up (see the host wiring in
 * docker-backend). It is never a raw passthrough — calls still flow through
 * checkMcpToolPermission + audit.
 */
export const recodergitMcpServer: McpServerRegistration = {
  serverId: 'recoder.code_graph',
  kind: 'recoder_code_graph',
  displayName: 'Recoder Code Graph (recodergit)',
  transport: 'http',
  enabled: true,
  toolNames: [
    'code_graph.context',
    'code_graph.impact',
    'code_graph.detect_impact',
    'code_graph.query',
    'code_graph.pdg_query',
    'code_graph.cypher',
    'code_graph.scope',
    'code_graph.explain',
    'code_graph.trace',
    'code_graph.route_map',
    'code_graph.generate_map',
    'code_graph.list_repos',
  ],
  metadata: {
    readOnly: true,
    engine: 'recodergit',
    // Live endpoint/health is reported by the code-graph control route; the
    // engine binds loopback Streamable HTTP at POST /mcp.
    transportDetail: 'streamable-http:/mcp',
  },
};
