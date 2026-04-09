import Badge from '@cloudscape-design/components/badge';

interface ModelBadgeProps {
  modelId?: string;
}

const MODEL_LABELS: Record<string, { label: string; color: 'blue' | 'grey' | 'green' | 'red' }> = {
  'anthropic.claude': { label: 'Claude', color: 'blue' },
  'meta.llama': { label: 'Llama', color: 'green' },
  'amazon.nova': { label: 'Nova', color: 'grey' },
  'mistral': { label: 'Mistral', color: 'red' },
};

function getModelInfo(modelId: string): { label: string; color: 'blue' | 'grey' | 'green' | 'red' } {
  for (const [key, value] of Object.entries(MODEL_LABELS)) {
    if (modelId.includes(key)) return value;
  }
  return { label: modelId.split('.').pop() || modelId, color: 'grey' };
}

export default function ModelBadge({ modelId }: ModelBadgeProps) {
  if (!modelId) return null;
  const info = getModelInfo(modelId);
  return <Badge color={info.color}>{info.label}: {modelId}</Badge>;
}
