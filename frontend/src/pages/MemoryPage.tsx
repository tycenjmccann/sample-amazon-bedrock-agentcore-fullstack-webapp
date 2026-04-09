import { useState, useEffect } from 'react';
import Header from '@cloudscape-design/components/header';
import Container from '@cloudscape-design/components/container';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Table from '@cloudscape-design/components/table';
import Box from '@cloudscape-design/components/box';
import StatusIndicator from '@cloudscape-design/components/status-indicator';
import Button from '@cloudscape-design/components/button';
import Alert from '@cloudscape-design/components/alert';
import ColumnLayout from '@cloudscape-design/components/column-layout';
import { listMemories, MemorySummary } from '../api/memory';

export default function MemoryPage() {
  const [memories, setMemories] = useState<MemorySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await listMemories();
      setMemories(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  return (
    <SpaceBetween size="l">
      <Header
        variant="h1"
        description="Cross-session memory for personalized agent interactions (Act 5)"
        actions={
          <Button iconName="refresh" onClick={loadData} loading={loading}>
            Refresh
          </Button>
        }
      >
        Agent Memory
      </Header>

      {error && (
        <Alert type="error" dismissible onDismiss={() => setError('')}>
          {error}
        </Alert>
      )}

      <ColumnLayout columns={2}>
        <Container header={<Header variant="h2">How Memory Works</Header>}>
          <SpaceBetween size="s">
            <div>
              <Box variant="awsui-key-label">Session 1</Box>
              <Box variant="p" color="text-body-secondary">
                User reports a harassment issue and mentions they prefer email follow-ups.
                The agent resolves the issue and extracts preferences into long-term memory.
              </Box>
            </div>
            <div>
              <Box variant="awsui-key-label">Session 2 (New Session)</Box>
              <Box variant="p" color="text-body-secondary">
                Same user returns with a new issue. Agent recalls: &quot;Welcome back. I see you
                reported a harassment issue last time that was resolved. You prefer email
                follow-ups — I&apos;ll route updates to your email.&quot;
              </Box>
            </div>
            <div>
              <Box variant="awsui-key-label">No Context Was Passed</Box>
              <Box variant="p" color="text-status-info">
                The agent automatically extracted preferences and history into long-term memory.
                Personalization at scale without building custom persistence.
              </Box>
            </div>
          </SpaceBetween>
        </Container>

        <Container header={<Header variant="h2">Memory Strategies</Header>}>
          <SpaceBetween size="s">
            <div>
              <Box variant="awsui-key-label">SESSION_SUMMARY</Box>
              <Box variant="p" color="text-body-secondary">
                Automatically summarizes each conversation session and stores it
                for future reference.
              </Box>
            </div>
            <div>
              <Box variant="awsui-key-label">SEMANTIC</Box>
              <Box variant="p" color="text-body-secondary">
                Extracts key facts, preferences, and entities from conversations
                for semantic retrieval.
              </Box>
            </div>
            <div>
              <Box variant="awsui-key-label">USER_PREFERENCE</Box>
              <Box variant="p" color="text-body-secondary">
                Explicitly tracks user preferences like communication channel,
                escalation thresholds, and notification settings.
              </Box>
            </div>
          </SpaceBetween>
        </Container>
      </ColumnLayout>

      <Container header={<Header variant="h2">Memory Stores</Header>}>
        {loading ? (
          <Box textAlign="center" padding="l">
            <StatusIndicator type="loading">Loading memory stores...</StatusIndicator>
          </Box>
        ) : memories.length === 0 ? (
          <Box textAlign="center" color="text-body-secondary" padding="xxl">
            <SpaceBetween size="s">
              <Box variant="h3">No Memory Stores Found</Box>
              <Box>
                Configure memory in the AgentCore Console to enable cross-session context
                for your agents.
              </Box>
            </SpaceBetween>
          </Box>
        ) : (
          <Table
            columnDefinitions={[
              { id: 'name', header: 'Name', cell: (item) => item.name },
              {
                id: 'status',
                header: 'Status',
                cell: (item) => (
                  <StatusIndicator type={item.status === 'READY' ? 'success' : 'in-progress'}>
                    {item.status}
                  </StatusIndicator>
                ),
              },
              { id: 'id', header: 'Memory ID', cell: (item) => <Box variant="code">{item.memoryId}</Box> },
              {
                id: 'created',
                header: 'Created',
                cell: (item) => item.createdAt ? new Date(item.createdAt).toLocaleString() : '-',
              },
            ]}
            items={memories}
          />
        )}
      </Container>
    </SpaceBetween>
  );
}
