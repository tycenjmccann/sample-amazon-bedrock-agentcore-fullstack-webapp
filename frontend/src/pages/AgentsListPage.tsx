import { useState, useEffect } from 'react';
import Table from '@cloudscape-design/components/table';
import Header from '@cloudscape-design/components/header';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Button from '@cloudscape-design/components/button';
import StatusIndicator from '@cloudscape-design/components/status-indicator';
import Box from '@cloudscape-design/components/box';
import Link from '@cloudscape-design/components/link';
import Alert from '@cloudscape-design/components/alert';
import TextFilter from '@cloudscape-design/components/text-filter';
import { useNavigate } from 'react-router-dom';
import { listAgents, AgentRuntimeSummary } from '../api/agents';

export default function AgentsListPage() {
  const navigate = useNavigate();
  const [agents, setAgents] = useState<AgentRuntimeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterText, setFilterText] = useState('');

  const loadAgents = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await listAgents();
      setAgents(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAgents();
  }, []);

  const filteredAgents = agents.filter(
    (a) =>
      a.agentRuntimeName.toLowerCase().includes(filterText.toLowerCase()) ||
      a.agentRuntimeId.toLowerCase().includes(filterText.toLowerCase()) ||
      (a.description || '').toLowerCase().includes(filterText.toLowerCase()),
  );

  function statusType(status: string) {
    switch (status) {
      case 'READY':
        return 'success';
      case 'CREATING':
      case 'UPDATING':
        return 'in-progress';
      case 'DELETING':
        return 'stopped';
      default:
        return 'error';
    }
  }

  return (
    <SpaceBetween size="l">
      {error && (
        <Alert type="error" dismissible onDismiss={() => setError('')}>
          {error}
        </Alert>
      )}

      <Table
        columnDefinitions={[
          {
            id: 'name',
            header: 'Agent Name',
            cell: (item) => (
              <Link
                onFollow={(e) => {
                  e.preventDefault();
                  navigate(`/agents/${item.agentRuntimeId}`);
                }}
              >
                {item.agentRuntimeName}
              </Link>
            ),
            sortingField: 'agentRuntimeName',
          },
          {
            id: 'status',
            header: 'Status',
            cell: (item) => (
              <StatusIndicator type={statusType(item.status)}>
                {item.status}
              </StatusIndicator>
            ),
            sortingField: 'status',
          },
          {
            id: 'id',
            header: 'Runtime ID',
            cell: (item) => <Box variant="code">{item.agentRuntimeId}</Box>,
          },
          {
            id: 'version',
            header: 'Version',
            cell: (item) => item.agentRuntimeVersion || '-',
          },
          {
            id: 'description',
            header: 'Description',
            cell: (item) => item.description || '-',
          },
          {
            id: 'updated',
            header: 'Last Updated',
            cell: (item) =>
              item.lastUpdatedAt
                ? new Date(item.lastUpdatedAt).toLocaleString()
                : '-',
            sortingField: 'lastUpdatedAt',
          },
          {
            id: 'actions',
            header: 'Actions',
            cell: (item) => (
              <SpaceBetween direction="horizontal" size="xs">
                <Button
                  variant="inline-link"
                  onClick={() => navigate(`/agents/${item.agentRuntimeId}`)}
                >
                  Details
                </Button>
                <Button
                  variant="inline-link"
                  onClick={() =>
                    navigate(`/chat?agentId=${item.agentRuntimeId}&agentArn=${encodeURIComponent(item.agentRuntimeArn)}`)
                  }
                >
                  Chat
                </Button>
              </SpaceBetween>
            ),
          },
        ]}
        items={filteredAgents}
        loading={loading}
        loadingText="Loading agent runtimes..."
        trackBy="agentRuntimeId"
        empty={
          <Box textAlign="center" color="inherit">
            <b>No agent runtimes</b>
            <Box variant="p" color="inherit">
              No agent runtimes found in this account. Deploy an agent to get started.
            </Box>
          </Box>
        }
        filter={
          <TextFilter
            filteringText={filterText}
            onChange={({ detail }) => setFilterText(detail.filteringText)}
            filteringPlaceholder="Find agents"
          />
        }
        header={
          <Header
            variant="h1"
            counter={`(${filteredAgents.length})`}
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <Button iconName="refresh" onClick={loadAgents} loading={loading}>
                  Refresh
                </Button>
              </SpaceBetween>
            }
            description="View and manage all AgentCore runtimes in your account"
          >
            Agent Runtimes
          </Header>
        }
      />
    </SpaceBetween>
  );
}
