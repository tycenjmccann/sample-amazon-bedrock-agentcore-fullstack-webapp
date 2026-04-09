import { useState, useEffect } from 'react';
import Header from '@cloudscape-design/components/header';
import Container from '@cloudscape-design/components/container';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Box from '@cloudscape-design/components/box';
import ColumnLayout from '@cloudscape-design/components/column-layout';
import StatusIndicator from '@cloudscape-design/components/status-indicator';
import Button from '@cloudscape-design/components/button';
import Alert from '@cloudscape-design/components/alert';
import Link from '@cloudscape-design/components/link';
import { useNavigate } from 'react-router-dom';
import { listAgents, AgentRuntimeSummary } from '../api/agents';
import { listGateways, GatewaySummary } from '../api/gateways';
import { listMemories, MemorySummary } from '../api/memory';

function StatusCount({ label, count, status }: { label: string; count: number; status: 'success' | 'info' | 'warning' }) {
  return (
    <div>
      <Box variant="awsui-key-label">{label}</Box>
      <Box variant="h1">
        <StatusIndicator type={status}>{count}</StatusIndicator>
      </Box>
    </div>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const [agents, setAgents] = useState<AgentRuntimeSummary[]>([]);
  const [gateways, setGateways] = useState<GatewaySummary[]>([]);
  const [memories, setMemories] = useState<MemorySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError('');
      try {
        const [a, g, m] = await Promise.allSettled([
          listAgents(),
          listGateways(),
          listMemories(),
        ]);
        if (a.status === 'fulfilled') setAgents(a.value);
        if (g.status === 'fulfilled') setGateways(g.value);
        if (m.status === 'fulfilled') setMemories(m.value);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const readyAgents = agents.filter((a) => a.status === 'READY').length;
  const readyGateways = gateways.filter((g) => g.status === 'READY').length;

  return (
    <SpaceBetween size="l">
      <Header
        variant="h1"
        description="Manage and monitor your Amazon Bedrock AgentCore resources"
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button onClick={() => navigate('/agents')}>View Agents</Button>
            <Button variant="primary" onClick={() => navigate('/chat')}>
              Open Chat
            </Button>
          </SpaceBetween>
        }
      >
        AgentCore Operations Dashboard
      </Header>

      {error && (
        <Alert type="error" dismissible onDismiss={() => setError('')}>
          {error}
        </Alert>
      )}

      <Container header={<Header variant="h2">Resource Overview</Header>}>
        <ColumnLayout columns={4} variant="text-grid">
          <StatusCount
            label="Agent Runtimes"
            count={agents.length}
            status={agents.length > 0 ? 'success' : 'info'}
          />
          <StatusCount
            label="Ready Agents"
            count={readyAgents}
            status={readyAgents > 0 ? 'success' : 'warning'}
          />
          <StatusCount
            label="MCP Gateways"
            count={gateways.length}
            status={readyGateways > 0 ? 'success' : 'info'}
          />
          <StatusCount
            label="Memory Stores"
            count={memories.length}
            status={memories.length > 0 ? 'success' : 'info'}
          />
        </ColumnLayout>
      </Container>

      <ColumnLayout columns={2}>
        <Container header={<Header variant="h2">Agent Runtimes</Header>}>
          {loading ? (
            <StatusIndicator type="loading">Loading agents...</StatusIndicator>
          ) : agents.length === 0 ? (
            <Box textAlign="center" color="text-body-secondary" padding="l">
              No agent runtimes found. Deploy an agent to get started.
            </Box>
          ) : (
            <SpaceBetween size="s">
              {agents.slice(0, 5).map((agent) => (
                <div
                  key={agent.agentRuntimeId}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <Link
                    onFollow={(e) => {
                      e.preventDefault();
                      navigate(`/agents/${agent.agentRuntimeId}`);
                    }}
                  >
                    {agent.agentRuntimeName}
                  </Link>
                  <StatusIndicator
                    type={
                      agent.status === 'READY'
                        ? 'success'
                        : agent.status === 'CREATING' || agent.status === 'UPDATING'
                          ? 'in-progress'
                          : 'error'
                    }
                  >
                    {agent.status}
                  </StatusIndicator>
                </div>
              ))}
              {agents.length > 5 && (
                <Box textAlign="center">
                  <Link onFollow={(e) => { e.preventDefault(); navigate('/agents'); }}>
                    View all {agents.length} agents
                  </Link>
                </Box>
              )}
            </SpaceBetween>
          )}
        </Container>

        <Container header={<Header variant="h2">Demo Guide</Header>}>
          <SpaceBetween size="s">
            <Box variant="p">
              This operations dashboard showcases Amazon Bedrock AgentCore capabilities:
            </Box>
            <div>
              <Box variant="awsui-key-label">Act 1 — Build the Agent</Box>
              <Box variant="p" color="text-body-secondary">
                Trust & safety content moderation agent built with Strands SDK
              </Box>
            </div>
            <div>
              <Box variant="awsui-key-label">Act 2 — MCP Gateway</Box>
              <Box variant="p" color="text-body-secondary">
                Connect tools via Gateway — zero code integration
              </Box>
            </div>
            <div>
              <Box variant="awsui-key-label">Act 3 — Swap Models</Box>
              <Box variant="p" color="text-body-secondary">
                Change foundation models with a single parameter
              </Box>
            </div>
            <div>
              <Box variant="awsui-key-label">Act 4 — Evaluations</Box>
              <Box variant="p" color="text-body-secondary">
                Compare model performance with data-driven evals
              </Box>
            </div>
            <div>
              <Box variant="awsui-key-label">Act 5 — Memory</Box>
              <Box variant="p" color="text-body-secondary">
                Cross-session memory for personalized experiences
              </Box>
            </div>
            <div>
              <Box variant="awsui-key-label">Act 6 — Policy Governance</Box>
              <Box variant="p" color="text-body-secondary">
                Cedar-based policies controlling per-user agent behavior
              </Box>
            </div>
          </SpaceBetween>
        </Container>
      </ColumnLayout>
    </SpaceBetween>
  );
}
