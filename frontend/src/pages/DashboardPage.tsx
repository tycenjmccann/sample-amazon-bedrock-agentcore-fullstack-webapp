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
import { useAppState } from '../context/AppContext';

export default function DashboardPage() {
  const navigate = useNavigate();
  const { agents, gateways, memories, dataLoaded, loadData } = useAppState();
  const [error, setError] = useState('');

  useEffect(() => {
    if (!dataLoaded) loadData().catch((e) => setError(e.message));
  }, [dataLoaded, loadData]);

  const loading = !dataLoaded;

  const readyAgents = agents.filter((a) => a.status === 'READY').length;

  function statusType(s: string) {
    if (s === 'READY' || s === 'ACTIVE') return 'success' as const;
    if (s === 'CREATING' || s === 'UPDATING') return 'in-progress' as const;
    return 'error' as const;
  }

  return (
    <SpaceBetween size="l">
      <Header
        variant="h1"
        description="Manage and monitor your Amazon Bedrock AgentCore resources"
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button onClick={() => navigate('/agents/list')}>View All Agents</Button>
            <Button variant="primary" onClick={() => navigate('/builder')}>Build Agent</Button>
          </SpaceBetween>
        }
      >
        AgentCore Operations Dashboard
      </Header>

      {error && <Alert type="error" dismissible onDismiss={() => setError('')}>{error}</Alert>}

      {/* Resource Overview */}
      <Container header={<Header variant="h2">Resource Overview</Header>}>
        <ColumnLayout columns={3} variant="text-grid">
          <div>
            <Box variant="awsui-key-label">Agent Runtimes</Box>
            <Box variant="h1">
              <StatusIndicator type={readyAgents > 0 ? 'success' : 'info'}>
                {readyAgents} / {agents.length}
              </StatusIndicator>
            </Box>
            <Box variant="small" color="text-body-secondary">ready</Box>
          </div>
          <div>
            <Box variant="awsui-key-label">MCP Gateways</Box>
            <Box variant="h1">
              <StatusIndicator type={gateways.length > 0 ? 'success' : 'info'}>
                {gateways.length}
              </StatusIndicator>
            </Box>
          </div>
          <div>
            <Box variant="awsui-key-label">Memory Stores</Box>
            <Box variant="h1">
              <StatusIndicator type={memories.length > 0 ? 'success' : 'info'}>
                {memories.length}
              </StatusIndicator>
            </Box>
          </div>
        </ColumnLayout>
      </Container>

      {/* Agent Runtimes */}
      <Container
        header={
          <Header variant="h2" actions={<Button variant="inline-link" onClick={() => navigate('/agents/list')}>View all</Button>}>
            Agent Runtimes
          </Header>
        }
      >
        {loading ? (
          <StatusIndicator type="loading">Loading...</StatusIndicator>
        ) : agents.length === 0 ? (
          <Box textAlign="center" color="text-body-secondary" padding="l">No agents deployed yet.</Box>
        ) : (
          <SpaceBetween size="s">
            {agents.map((agent) => (
              <div key={agent.agentRuntimeId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Link onFollow={(e) => { e.preventDefault(); navigate(`/agents/${agent.agentRuntimeId}`); }}>
                  {agent.agentRuntimeName}
                </Link>
                <StatusIndicator type={statusType(agent.status)}>{agent.status}</StatusIndicator>
              </div>
            ))}
          </SpaceBetween>
        )}
      </Container>

      {/* Gateways + Memory side by side */}
      <ColumnLayout columns={2}>
        <Container
          header={
            <Header variant="h2" actions={<Button variant="inline-link" onClick={() => navigate('/gateways')}>Manage</Button>}>
              MCP Gateways
            </Header>
          }
        >
          {loading ? (
            <StatusIndicator type="loading">Loading...</StatusIndicator>
          ) : gateways.length === 0 ? (
            <Box textAlign="center" color="text-body-secondary" padding="l">No gateways configured.</Box>
          ) : (
            <SpaceBetween size="s">
              {gateways.map((gw) => (
                <div key={gw.gatewayId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Link onFollow={(e) => { e.preventDefault(); navigate('/gateways'); }}>
                    {gw.name}
                  </Link>
                  <StatusIndicator type={statusType(gw.status)}>{gw.status}</StatusIndicator>
                </div>
              ))}
            </SpaceBetween>
          )}
        </Container>

        <Container
          header={
            <Header variant="h2" actions={<Button variant="inline-link" onClick={() => navigate('/memory')}>Manage</Button>}>
              Memory Stores
            </Header>
          }
        >
          {loading ? (
            <StatusIndicator type="loading">Loading...</StatusIndicator>
          ) : memories.length === 0 ? (
            <Box textAlign="center" color="text-body-secondary" padding="l">No memory stores configured.</Box>
          ) : (
            <SpaceBetween size="s">
              {memories.map((mem) => (
                <div key={mem.memoryId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Link onFollow={(e) => { e.preventDefault(); navigate('/memory'); }}>
                    {mem.name}
                  </Link>
                  <StatusIndicator type={statusType(mem.status)}>{mem.status}</StatusIndicator>
                </div>
              ))}
            </SpaceBetween>
          )}
        </Container>
      </ColumnLayout>
    </SpaceBetween>
  );
}
