import { useState, useEffect } from 'react';
import Header from '@cloudscape-design/components/header';
import Container from '@cloudscape-design/components/container';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Table from '@cloudscape-design/components/table';
import Box from '@cloudscape-design/components/box';
import StatusIndicator from '@cloudscape-design/components/status-indicator';
import Button from '@cloudscape-design/components/button';
import Alert from '@cloudscape-design/components/alert';
import Badge from '@cloudscape-design/components/badge';
import ExpandableSection from '@cloudscape-design/components/expandable-section';
import Link from '@cloudscape-design/components/link';
import { listGateways, listGatewayTargets, GatewaySummary, GatewayTarget } from '../api/gateways';

export default function GatewaysPage() {
  const [gateways, setGateways] = useState<GatewaySummary[]>([]);
  const [targetsByGateway, setTargetsByGateway] = useState<Record<string, GatewayTarget[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const gws = await listGateways();
      setGateways(gws);
      // Load targets for each gateway
      const targetsMap: Record<string, GatewayTarget[]> = {};
      await Promise.all(
        gws.map(async (gw) => {
          try {
            targetsMap[gw.gatewayId] = await listGatewayTargets(gw.gatewayId);
          } catch {
            targetsMap[gw.gatewayId] = [];
          }
        }),
      );
      setTargetsByGateway(targetsMap);
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
        description="Connect agents to tools via MCP Gateway — zero code integration (Act 2)"
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button iconName="refresh" onClick={loadData} loading={loading}>
              Refresh
            </Button>
          </SpaceBetween>
        }
      >
        MCP Gateways
      </Header>

      {error && (
        <Alert type="error" dismissible onDismiss={() => setError('')}>
          {error}
        </Alert>
      )}

      <Alert type="info">
        The MCP Gateway turns existing APIs into agent-ready tools with zero code.
        Upload an OpenAPI spec and a new tool appears instantly. See{' '}
        <Link href="https://github.com/awslabs/mcp" external>
          66 open-source AWS MCP servers
        </Link>{' '}
        ready to plug in.
      </Alert>

      {loading ? (
        <Container>
          <Box textAlign="center" padding="xxl">
            <StatusIndicator type="loading">Loading gateways...</StatusIndicator>
          </Box>
        </Container>
      ) : gateways.length === 0 ? (
        <Container>
          <Box textAlign="center" color="text-body-secondary" padding="xxl">
            <SpaceBetween size="s">
              <Box variant="h3">No MCP Gateways Found</Box>
              <Box>
                Create a Gateway in the AgentCore Console to connect tools like DynamoDB,
                CloudWatch, Slack, and custom APIs to your agents.
              </Box>
            </SpaceBetween>
          </Box>
        </Container>
      ) : (
        gateways.map((gw) => (
          <Container
            key={gw.gatewayId}
            header={
              <Header
                variant="h2"
                info={<Badge>{gw.protocolType}</Badge>}
              >
                {gw.name}
                {' '}
                <StatusIndicator type={gw.status === 'READY' ? 'success' : 'in-progress'}>
                  {gw.status}
                </StatusIndicator>
              </Header>
            }
          >
            <SpaceBetween size="m">
              <Box variant="small" color="text-body-secondary">
                Gateway ID: {gw.gatewayId} | Auth: {gw.authorizerType} |
                Created: {new Date(gw.createdAt).toLocaleString()}
              </Box>

              {(targetsByGateway[gw.gatewayId] || []).length > 0 && (
                <ExpandableSection headerText={`Tool Targets (${targetsByGateway[gw.gatewayId].length})`} defaultExpanded>
                  <Table
                    columnDefinitions={[
                      { id: 'name', header: 'Tool Name', cell: (item) => item.name },
                      {
                        id: 'status',
                        header: 'Status',
                        cell: (item) => (
                          <StatusIndicator type={item.status === 'READY' ? 'success' : 'in-progress'}>
                            {item.status}
                          </StatusIndicator>
                        ),
                      },
                      { id: 'description', header: 'Description', cell: (item) => item.description || '-' },
                      { id: 'id', header: 'Target ID', cell: (item) => <Box variant="code">{item.targetId}</Box> },
                    ]}
                    items={targetsByGateway[gw.gatewayId]}
                    variant="embedded"
                  />
                </ExpandableSection>
              )}
            </SpaceBetween>
          </Container>
        ))
      )}
    </SpaceBetween>
  );
}
