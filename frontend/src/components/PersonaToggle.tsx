import SpaceBetween from '@cloudscape-design/components/space-between';
import Toggle from '@cloudscape-design/components/toggle';
import Box from '@cloudscape-design/components/box';
import Badge from '@cloudscape-design/components/badge';

export interface Persona {
  id: string;
  name: string;
  role: string;
  tier: string;
}

export const PERSONAS: Persona[] = [
  { id: 'john', name: 'John', role: 'Tier 1 Moderator', tier: 'tier1' },
  { id: 'jane', name: 'Jane', role: 'Tier 2 Moderator', tier: 'tier2' },
];

interface PersonaToggleProps {
  activePersona: Persona;
  onChange: (persona: Persona) => void;
}

export default function PersonaToggle({ activePersona, onChange }: PersonaToggleProps) {
  const isJane = activePersona.id === 'jane';

  return (
    <SpaceBetween direction="horizontal" size="xs" alignItems="center">
      <Box variant="span" fontSize="body-s" color="text-body-secondary">
        Persona:
      </Box>
      <Box variant="span" fontWeight={!isJane ? 'bold' : 'normal'}>
        John
      </Box>
      <Toggle
        checked={isJane}
        onChange={({ detail }) => {
          onChange(detail.checked ? PERSONAS[1] : PERSONAS[0]);
        }}
      >
        {''}
      </Toggle>
      <Box variant="span" fontWeight={isJane ? 'bold' : 'normal'}>
        Jane
      </Box>
      <Badge color={isJane ? 'green' : 'blue'}>
        {activePersona.role}
      </Badge>
    </SpaceBetween>
  );
}
