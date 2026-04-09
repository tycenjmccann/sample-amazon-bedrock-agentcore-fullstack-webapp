const API_BASE = '/management';

export interface GatewaySummary {
  gatewayId: string;
  name: string;
  status: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  authorizerType: string;
  protocolType: string;
}

export interface GatewayTarget {
  targetId: string;
  name: string;
  status: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export async function listGateways(): Promise<GatewaySummary[]> {
  const res = await fetch(`${API_BASE}/api/gateways`);
  if (!res.ok) throw new Error(`Failed to list gateways: ${res.statusText}`);
  const data = await res.json();
  return data.gateways ?? [];
}

export async function getGateway(gatewayId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/api/gateways/${encodeURIComponent(gatewayId)}`);
  if (!res.ok) throw new Error(`Failed to get gateway: ${res.statusText}`);
  return res.json();
}

export async function listGatewayTargets(gatewayId: string): Promise<GatewayTarget[]> {
  const res = await fetch(`${API_BASE}/api/gateways/${encodeURIComponent(gatewayId)}/targets`);
  if (!res.ok) throw new Error(`Failed to list gateway targets: ${res.statusText}`);
  const data = await res.json();
  return data.targets ?? [];
}
