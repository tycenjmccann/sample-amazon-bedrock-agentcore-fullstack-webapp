const API_BASE = '/management';

export interface MemorySummary {
  memoryId: string;
  name: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface MemoryDetail {
  memoryId: string;
  name: string;
  description: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  strategies?: Array<{
    strategyId: string;
    name: string;
    type: string;
    status: string;
  }>;
}

export async function listMemories(): Promise<MemorySummary[]> {
  const res = await fetch(`${API_BASE}/api/memory`);
  if (!res.ok) throw new Error(`Failed to list memories: ${res.statusText}`);
  const data = await res.json();
  return data.memories ?? [];
}

export async function getMemory(memoryId: string): Promise<MemoryDetail> {
  const res = await fetch(`${API_BASE}/api/memory/${encodeURIComponent(memoryId)}`);
  if (!res.ok) throw new Error(`Failed to get memory: ${res.statusText}`);
  return res.json();
}

export async function listMemoryRecords(memoryId: string, namespace?: string): Promise<any> {
  const params = namespace ? `?namespace=${encodeURIComponent(namespace)}` : '';
  const res = await fetch(`${API_BASE}/api/memory/${encodeURIComponent(memoryId)}/records${params}`);
  if (!res.ok) throw new Error(`Failed to list memory records: ${res.statusText}`);
  return res.json();
}
