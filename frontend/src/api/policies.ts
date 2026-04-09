const API_BASE = '/management';

export interface PolicySummary {
  policyId: string;
  name: string;
  status: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface PolicyDetail {
  policyId: string;
  name: string;
  description: string;
  status: string;
  definition?: {
    cedar?: {
      statement: string;
    };
  };
  createdAt: string;
  updatedAt: string;
}

export async function listPolicies(policyEngineId: string): Promise<PolicySummary[]> {
  const res = await fetch(`${API_BASE}/api/policies/${encodeURIComponent(policyEngineId)}`);
  if (!res.ok) throw new Error(`Failed to list policies: ${res.statusText}`);
  const data = await res.json();
  return data.policies ?? [];
}

export async function getPolicy(policyEngineId: string, policyId: string): Promise<PolicyDetail> {
  const res = await fetch(
    `${API_BASE}/api/policies/${encodeURIComponent(policyEngineId)}/${encodeURIComponent(policyId)}`,
  );
  if (!res.ok) throw new Error(`Failed to get policy: ${res.statusText}`);
  return res.json();
}
