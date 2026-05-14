import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

import { COMMON_TAGS, buildRecoderEdgeScaffold } from "../../components";

// ============================================================================
// LIGHTSAIL INSTANCE (Imported from existing)
// ============================================================================

const instance = new aws.lightsail.Instance("recoder-prod-instance", {
  name: "recoder-prod",
  availabilityZone: "us-west-2a",
  blueprintId: "ubuntu_24_04",
  bundleId: "8xlarge_3_0",
  keyPairName: "recoder-prod-key",
  tags: {
    ...COMMON_TAGS,
    Environment: "prod",
    Name: "recoder-prod",
  },
});

const ports = new aws.lightsail.InstancePublicPorts("recoder-prod-ports", {
  instanceName: instance.name,
  portInfos: [{
    protocol: "tcp",
    fromPort: 22,
    toPort: 22,
    cidrs: ["0.0.0.0/0"],
  }],
});

// ============================================================================
// CLOUDFLARE (Existing - not managed by Pulumi)
// ============================================================================

// Tunnel and DNS records are already configured in Cloudflare
const EXISTING_TUNNEL_ID = "f4125d84-33d5-424d-ae6b-2b84b790392b";

// ============================================================================
// ECS (Existing - not managed by Pulumi)
// ============================================================================

// ECS cluster and related resources are already configured in AWS
const ECS_CLUSTER_NAME = "recoder-ecs";
const ALB_DNS_NAME = "recoder-alb-3975a7d-1271164322.us-west-2.elb.amazonaws.com";

// ============================================================================
// SECRETS MANAGER (Reference to existing secret)
// ============================================================================

// IMPORTANT: If this secret is recreated, update the ARN here AND in:
// 1. IAM policy: recoder-ecs-task-exec-role -> recoder-ecs-task-exec-secrets
// 2. ECS task definition: recoder-api (secrets.SUNA_ENV_JSON.valueFrom)
const SECRETS_MANAGER_ENV_ARN = "arn:aws:secretsmanager:us-west-2:935064898258:secret:recoder-env-prod-2ikWXj";

// ============================================================================
// EXPORTS
// ============================================================================

export const environment = "prod";
export const instanceName = instance.name;
export const publicIpAddress = instance.publicIpAddress;
export const privateIpAddress = instance.privateIpAddress;

export const tunnelId = EXISTING_TUNNEL_ID;
export const tunnelCname = `${EXISTING_TUNNEL_ID}.cfargotunnel.com`;

export const ecsClusterName = ECS_CLUSTER_NAME;
export const albDnsName = ALB_DNS_NAME;
export const secretsManagerEnvArn = SECRETS_MANAGER_ENV_ARN;

export const apiEndpoints = {
  primary: "api.recoder.xyz",
  lightsail: "api-lightsail.recoder.xyz",
  ecs: "api-ecs.recoder.xyz",
};
export const edgeScaffold = buildRecoderEdgeScaffold({
  backendOrigin: "http://recoder-prod:8000",
  previewDomain: "preview.recoder.xyz",
  provider: "traefik",
});

// Setup instructions
export const setupInstructions = pulumi.interpolate`
=== PRODUCTION ENVIRONMENT SETUP ===

1. SSH into Lightsail instance:
   ssh ubuntu@${instance.publicIpAddress}

2. Check tunnel status:
   sudo systemctl status cloudflared

3. API endpoints:
   - Primary (routed via Cloudflare Worker): https://api.recoder.xyz
   - Lightsail direct: https://api-lightsail.recoder.xyz
   - ECS direct: https://api-ecs.recoder.xyz

4. ECS cluster: ${ECS_CLUSTER_NAME}
   ALB: ${ALB_DNS_NAME}
`;
