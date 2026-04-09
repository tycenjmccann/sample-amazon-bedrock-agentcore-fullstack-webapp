const API_BASE = '/management';

export interface AgentRuntimeSummary {
  agentRuntimeArn: string;
  agentRuntimeId: string;
  agentRuntimeName: string;
  agentRuntimeVersion: string;
  description: string;
  lastUpdatedAt: string;
  status: string;
}

export interface AgentRuntimeDetail {
  agentRuntimeArn: string;
  agentRuntimeId: string;
  agentRuntimeName: string;
  agentRuntimeVersion: string;
  description: string;
  createdAt: string;
  lastUpdatedAt: string;
  status: string;
  roleArn: string;
  networkConfiguration: {
    networkMode: string;
    networkModeConfig?: {
      securityGroups?: string[];
      subnets?: string[];
    };
  };
  agentRuntimeArtifact: {
    containerConfiguration?: {
      containerUri: string;
    };
    codeConfiguration?: {
      runtime: string;
      entryPoint: string[];
    };
  };
  authorizerConfiguration?: {
    customJWTAuthorizer?: {
      discoveryUrl: string;
      allowedClients: string[];
      allowedAudience?: string[];
    };
  };
  protocolConfiguration?: {
    serverProtocol: string;
  };
  environmentVariables?: Record<string, string>;
  lifecycleConfiguration?: {
    idleRuntimeSessionTimeout: number;
    maxLifetime: number;
  };
  workloadIdentityDetails?: {
    workloadIdentityArn: string;
  };
  failureReason?: string;
}

export async function listAgents(): Promise<AgentRuntimeSummary[]> {
  const res = await fetch(`${API_BASE}/api/agents`);
  if (!res.ok) throw new Error(`Failed to list agents: ${res.statusText}`);
  const data = await res.json();
  return data.agentRuntimes ?? [];
}

export async function getAgent(agentRuntimeId: string): Promise<AgentRuntimeDetail> {
  const res = await fetch(`${API_BASE}/api/agents/${encodeURIComponent(agentRuntimeId)}`);
  if (!res.ok) throw new Error(`Failed to get agent: ${res.statusText}`);
  return res.json();
}

export async function updateAgentEnvVars(
  agentRuntimeId: string,
  environmentVariables: Record<string, string>,
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/agents/${encodeURIComponent(agentRuntimeId)}/env`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ environmentVariables }),
  });
  if (!res.ok) throw new Error(`Failed to update agent env: ${res.statusText}`);
}
