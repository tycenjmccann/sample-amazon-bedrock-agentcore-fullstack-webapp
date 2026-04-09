import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Header from '@cloudscape-design/components/header';
import Container from '@cloudscape-design/components/container';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Tabs from '@cloudscape-design/components/tabs';
import Box from '@cloudscape-design/components/box';
import ColumnLayout from '@cloudscape-design/components/column-layout';
import StatusIndicator from '@cloudscape-design/components/status-indicator';
import Button from '@cloudscape-design/components/button';
import Alert from '@cloudscape-design/components/alert';
import Badge from '@cloudscape-design/components/badge';
import Table from '@cloudscape-design/components/table';
import KeyValuePairs from '@cloudscape-design/components/key-value-pairs';
import FormField from '@cloudscape-design/components/form-field';
import Select from '@cloudscape-design/components/select';
import BreadcrumbGroup from '@cloudscape-design/components/breadcrumb-group';
import { getAgent, updateAgentEnvVars, AgentRuntimeDetail } from '../api/agents';
import { listGateways, listGatewayTargets, GatewaySummary, GatewayTarget } from '../api/gateways';
import { listMemories, MemorySummary } from '../api/memory';
import ModelBadge from '../components/ModelBadge';

const AVAILABLE_MODELS = [
  { label: 'Claude Haiku 4.5', value: 'global.anthropic.claude-haiku-4-5-20251001-v1:0' },
  { label: 'Claude Sonnet 4', value: 'us.anthropic.claude-sonnet-4-20250514' },
  { label: 'Llama 3.3 70B', value: 'us.meta.llama3-3-70b-instruct-v1:0' },
  { label: 'Amazon Nova Pro', value: 'us.amazon.nova-pro-v1:0' },
  { label: 'Amazon Nova Lite', value: 'us.amazon.nova-lite-v1:0' },
  { label: 'Mistral Large', value: 'mistral.mistral-large-2407-v1:0' },
];

function statusType(status: string) {
  switch (status) {
    case 'READY': return 'success';
    case 'CREATING': case 'UPDATING': return 'in-progress';
    case 'DELETING': return 'stopped';
    default: return 'error';
  }
}

export default function AgentDetailPage() {
  const { agentId } = useParams<{ agentId: string }>();
  const navigate = useNavigate();
  const [agent, setAgent] = useState<AgentRuntimeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('overview');

  // Model swap state
  const [selectedModel, setSelectedModel] = useState<any>(null);
  const [swapping, setSwapping] = useState(false);
  const [swapSuccess, setSwapSuccess] = useState('');

  // Gateway state
  const [gateways, setGateways] = useState<GatewaySummary[]>([]);
  const [gatewayTargets, setGatewayTargets] = useState<GatewayTarget[]>([]);
  const [gatewaysLoading, setGatewaysLoading] = useState(false);

  // Memory state
  const [memories, setMemories] = useState<MemorySummary[]>([]);
  const [memoriesLoading, setMemoriesLoading] = useState(false);

  useEffect(() => {
    if (agentId) loadAgent();
  }, [agentId]);

  const loadAgent = async () => {
    if (!agentId) return;
    setLoading(true);
    setError('');
    try {
      const data = await getAgent(agentId);
      setAgent(data);
      // Set initial model selection from env vars
      const modelId = data.environmentVariables?.MODEL_ID || data.environmentVariables?.model_id;
      if (modelId) {
        const found = AVAILABLE_MODELS.find((m) => m.value === modelId);
        setSelectedModel(found || { label: modelId, value: modelId });
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadGateways = async () => {
    setGatewaysLoading(true);
    try {
      const gws = await listGateways();
      setGateways(gws);
      if (gws.length > 0) {
        const targets = await listGatewayTargets(gws[0].gatewayId);
        setGatewayTargets(targets);
      }
    } catch {
      // Gateways may not be configured
    } finally {
      setGatewaysLoading(false);
    }
  };

  const loadMemories = async () => {
    setMemoriesLoading(true);
    try {
      const mems = await listMemories();
      setMemories(mems);
    } catch {
      // Memory may not be configured
    } finally {
      setMemoriesLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'gateway') loadGateways();
    if (activeTab === 'memory') loadMemories();
  }, [activeTab]);

  const handleModelSwap = async () => {
    if (!agentId || !selectedModel || !agent) return;
    setSwapping(true);
    setSwapSuccess('');
    try {
      const updatedEnv = { ...(agent.environmentVariables || {}), MODEL_ID: selectedModel.value };
      await updateAgentEnvVars(agentId, updatedEnv);
      setSwapSuccess(`Model updated to ${selectedModel.label}. Runtime is redeploying...`);
      // Reload agent to show updated status
      setTimeout(loadAgent, 3000);
    } catch (err: any) {
      setError(`Failed to swap model: ${err.message}`);
    } finally {
      setSwapping(false);
    }
  };

  if (loading) {
    return (
      <Box textAlign="center" padding="xxl">
        <StatusIndicator type="loading">Loading agent details...</StatusIndicator>
      </Box>
    );
  }

  if (!agent) {
    return (
      <Alert type="error">
        Agent runtime not found: {agentId}
      </Alert>
    );
  }

  const containerUri = agent.agentRuntimeArtifact?.containerConfiguration?.containerUri;
  const envVars = agent.environmentVariables || {};
  const envVarEntries = Object.entries(envVars);

  const overviewTab = (
    <SpaceBetween size="l">
      <Container header={<Header variant="h2">General Information</Header>}>
        <KeyValuePairs
          columns={3}
          items={[
            { label: 'Agent Name', value: agent.agentRuntimeName },
            {
              label: 'Status',
              value: (
                <StatusIndicator type={statusType(agent.status)}>
                  {agent.status}
                </StatusIndicator>
              ),
            },
            { label: 'Runtime ID', value: <Box variant="code">{agent.agentRuntimeId}</Box> },
            { label: 'Version', value: agent.agentRuntimeVersion || '-' },
            { label: 'ARN', value: <Box variant="code" fontSize="body-s">{agent.agentRuntimeArn}</Box> },
            { label: 'Description', value: agent.description || '-' },
            { label: 'Created', value: agent.createdAt ? new Date(agent.createdAt).toLocaleString() : '-' },
            { label: 'Last Updated', value: agent.lastUpdatedAt ? new Date(agent.lastUpdatedAt).toLocaleString() : '-' },
            { label: 'Role ARN', value: <Box variant="code" fontSize="body-s">{agent.roleArn}</Box> },
          ]}
        />
      </Container>

      {agent.failureReason && (
        <Alert type="error" header="Failure Reason">
          {agent.failureReason}
        </Alert>
      )}
    </SpaceBetween>
  );

  const runtimeTab = (
    <SpaceBetween size="l">
      <Container header={<Header variant="h2">Container Configuration</Header>}>
        <KeyValuePairs
          columns={2}
          items={[
            { label: 'Container URI', value: containerUri ? <Box variant="code" fontSize="body-s">{containerUri}</Box> : '-' },
            { label: 'Protocol', value: <Badge>{agent.protocolConfiguration?.serverProtocol || 'HTTP'}</Badge> },
            { label: 'Network Mode', value: <Badge>{agent.networkConfiguration?.networkMode || 'PUBLIC'}</Badge> },
            {
              label: 'Lifecycle',
              value: agent.lifecycleConfiguration
                ? `Idle timeout: ${agent.lifecycleConfiguration.idleRuntimeSessionTimeout}s, Max lifetime: ${agent.lifecycleConfiguration.maxLifetime}s`
                : 'Default',
            },
          ]}
        />
      </Container>

      <Container
        header={
          <Header
            variant="h2"
            description="Change the foundation model powering this agent (Act 3)"
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <Button
                  onClick={handleModelSwap}
                  loading={swapping}
                  disabled={!selectedModel}
                  variant="primary"
                >
                  Swap Model
                </Button>
              </SpaceBetween>
            }
          >
            Model Configuration
          </Header>
        }
      >
        <SpaceBetween size="m">
          {swapSuccess && (
            <Alert type="success" dismissible onDismiss={() => setSwapSuccess('')}>
              {swapSuccess}
            </Alert>
          )}
          <ColumnLayout columns={2}>
            <FormField label="Current Model">
              <ModelBadge modelId={envVars.MODEL_ID || envVars.model_id || 'global.anthropic.claude-haiku-4-5-20251001-v1:0'} />
            </FormField>
            <FormField label="Select New Model">
              <Select
                selectedOption={selectedModel}
                onChange={({ detail }) => setSelectedModel(detail.selectedOption)}
                options={AVAILABLE_MODELS}
                placeholder="Choose a model"
              />
            </FormField>
          </ColumnLayout>
        </SpaceBetween>
      </Container>

      <Container header={<Header variant="h2">Environment Variables</Header>}>
        {envVarEntries.length === 0 ? (
          <Box textAlign="center" color="text-body-secondary" padding="l">
            No environment variables configured.
          </Box>
        ) : (
          <Table
            columnDefinitions={[
              { id: 'key', header: 'Key', cell: (item) => <Box variant="code">{item[0]}</Box> },
              { id: 'value', header: 'Value', cell: (item) => item[1] },
            ]}
            items={envVarEntries}
            variant="embedded"
          />
        )}
      </Container>
    </SpaceBetween>
  );

  const authTab = (
    <Container header={<Header variant="h2">Authentication Configuration</Header>}>
      {agent.authorizerConfiguration?.customJWTAuthorizer ? (
        <KeyValuePairs
          columns={2}
          items={[
            { label: 'Authorizer Type', value: <Badge color="blue">Custom JWT</Badge> },
            {
              label: 'Discovery URL',
              value: (
                <Box variant="code" fontSize="body-s">
                  {agent.authorizerConfiguration.customJWTAuthorizer.discoveryUrl}
                </Box>
              ),
            },
            {
              label: 'Allowed Clients',
              value: (
                <SpaceBetween direction="horizontal" size="xs">
                  {agent.authorizerConfiguration.customJWTAuthorizer.allowedClients.map((c) => (
                    <Badge key={c}>{c}</Badge>
                  ))}
                </SpaceBetween>
              ),
            },
            {
              label: 'Workload Identity',
              value: agent.workloadIdentityDetails?.workloadIdentityArn ? (
                <Box variant="code" fontSize="body-s">
                  {agent.workloadIdentityDetails.workloadIdentityArn}
                </Box>
              ) : (
                '-'
              ),
            },
          ]}
        />
      ) : (
        <Box textAlign="center" color="text-body-secondary" padding="l">
          No custom authorization configured. Using default IAM authentication.
        </Box>
      )}
    </Container>
  );

  const gatewayTab = (
    <SpaceBetween size="l">
      <Container
        header={
          <Header
            variant="h2"
            description="MCP Gateway connects your agent to external tools with zero code (Act 2)"
            actions={
              <Button iconName="refresh" onClick={loadGateways} loading={gatewaysLoading}>
                Refresh
              </Button>
            }
          >
            MCP Gateway & Tools
          </Header>
        }
      >
        {gatewaysLoading ? (
          <StatusIndicator type="loading">Loading gateways...</StatusIndicator>
        ) : gateways.length === 0 ? (
          <Box textAlign="center" color="text-body-secondary" padding="l">
            <SpaceBetween size="s">
              <Box>No MCP Gateways configured yet.</Box>
              <Box variant="small">
                Configure a Gateway in the AgentCore Console to connect tools like DynamoDB,
                CloudWatch, Slack, and custom APIs.
              </Box>
            </SpaceBetween>
          </Box>
        ) : (
          <SpaceBetween size="m">
            {gateways.map((gw) => (
              <KeyValuePairs
                key={gw.gatewayId}
                columns={3}
                items={[
                  { label: 'Gateway Name', value: gw.name },
                  {
                    label: 'Status',
                    value: (
                      <StatusIndicator type={gw.status === 'READY' ? 'success' : 'in-progress'}>
                        {gw.status}
                      </StatusIndicator>
                    ),
                  },
                  { label: 'Protocol', value: <Badge>{gw.protocolType}</Badge> },
                  { label: 'Auth Type', value: <Badge>{gw.authorizerType}</Badge> },
                  { label: 'Gateway ID', value: <Box variant="code">{gw.gatewayId}</Box> },
                ]}
              />
            ))}
          </SpaceBetween>
        )}
      </Container>

      {gatewayTargets.length > 0 && (
        <Container header={<Header variant="h2">Tool Targets</Header>}>
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
            items={gatewayTargets}
            variant="embedded"
          />
        </Container>
      )}
    </SpaceBetween>
  );

  const memoryTab = (
    <SpaceBetween size="l">
      <Container
        header={
          <Header
            variant="h2"
            description="Cross-session memory for personalized agent interactions (Act 5)"
            actions={
              <Button iconName="refresh" onClick={loadMemories} loading={memoriesLoading}>
                Refresh
              </Button>
            }
          >
            Agent Memory
          </Header>
        }
      >
        {memoriesLoading ? (
          <StatusIndicator type="loading">Loading memory stores...</StatusIndicator>
        ) : memories.length === 0 ? (
          <Box textAlign="center" color="text-body-secondary" padding="l">
            <SpaceBetween size="s">
              <Box>No memory stores configured.</Box>
              <Box variant="small">
                Add memory to your agent to enable cross-session context.
                The agent will automatically extract and recall user preferences and conversation history.
              </Box>
            </SpaceBetween>
          </Box>
        ) : (
          <Table
            columnDefinitions={[
              { id: 'name', header: 'Memory Store', cell: (item) => item.name },
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
            variant="embedded"
          />
        )}
      </Container>
    </SpaceBetween>
  );

  const policyTab = (
    <SpaceBetween size="l">
      <Container
        header={
          <Header
            variant="h2"
            description="Cedar-based policies controlling per-user agent behavior (Act 6)"
          >
            Policy Governance
          </Header>
        }
      >
        <SpaceBetween size="l">
          <Alert type="info" header="Cedar Policy Engine">
            Policies provide real-time, deterministic control over agent tool access.
            Same agent, same IAM role — but Cedar enforces role-based behavior at the tool level.
          </Alert>

          <Container header={<Header variant="h3">Example: Trust & Safety Moderator Policies</Header>}>
            <SpaceBetween size="m">
              <Box variant="h4" color="text-status-success">
                Jane (Tier 2 Moderator) — Can Suspend Accounts
              </Box>
              <Box variant="code">
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '0.85em' }}>
{`permit(
  principal == User::"jane",
  action == Action::"SuspendAccount",
  resource
);`}
                </pre>
              </Box>

              <Box variant="h4" color="text-status-error">
                John (Tier 1 Moderator) — Cannot Suspend Accounts
              </Box>
              <Box variant="code">
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '0.85em' }}>
{`forbid(
  principal == User::"john",
  action == Action::"SuspendAccount",
  resource
);`}
                </pre>
              </Box>
            </SpaceBetween>
          </Container>

          <Container header={<Header variant="h3">How It Works</Header>}>
            <ColumnLayout columns={3} variant="text-grid">
              <div>
                <Box variant="awsui-key-label">John asks to suspend a user</Box>
                <Box variant="p" color="text-body-secondary">
                  Agent responds: "I don't have permission to suspend accounts.
                  I've flagged this for a Tier 2 moderator."
                </Box>
              </div>
              <div>
                <Box variant="awsui-key-label">Jane asks to suspend a user</Box>
                <Box variant="p" color="text-body-secondary">
                  Agent successfully suspends the account and notifies the team via Slack.
                </Box>
              </div>
              <div>
                <Box variant="awsui-key-label">CloudWatch Logs</Box>
                <Box variant="p" color="text-body-secondary">
                  Both authorization decisions are logged — John's forbid and Jane's permit — for full audit trail.
                </Box>
              </div>
            </ColumnLayout>
          </Container>
        </SpaceBetween>
      </Container>
    </SpaceBetween>
  );

  return (
    <SpaceBetween size="l">
      <BreadcrumbGroup
        items={[
          { text: 'Agents', href: '/agents' },
          { text: agent.agentRuntimeName, href: '#' },
        ]}
        onFollow={(event) => {
          event.preventDefault();
          if (event.detail.href !== '#') navigate(event.detail.href);
        }}
      />

      {error && (
        <Alert type="error" dismissible onDismiss={() => setError('')}>
          {error}
        </Alert>
      )}

      <Header
        variant="h1"
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button iconName="refresh" onClick={loadAgent} loading={loading}>
              Refresh
            </Button>
            <Button
              variant="primary"
              onClick={() =>
                navigate(
                  `/chat?agentId=${agent.agentRuntimeId}&agentArn=${encodeURIComponent(agent.agentRuntimeArn)}`,
                )
              }
            >
              Chat with Agent
            </Button>
          </SpaceBetween>
        }
      >
        {agent.agentRuntimeName}
        {' '}
        <StatusIndicator type={statusType(agent.status)}>{agent.status}</StatusIndicator>
      </Header>

      <Tabs
        activeTabId={activeTab}
        onChange={({ detail }) => setActiveTab(detail.activeTabId)}
        tabs={[
          { id: 'overview', label: 'Overview', content: overviewTab },
          { id: 'runtime', label: 'Runtime & Model', content: runtimeTab },
          { id: 'auth', label: 'Authentication', content: authTab },
          { id: 'gateway', label: 'MCP Gateway', content: gatewayTab },
          { id: 'memory', label: 'Memory', content: memoryTab },
          { id: 'policies', label: 'Policies', content: policyTab },
        ]}
      />
    </SpaceBetween>
  );
}
