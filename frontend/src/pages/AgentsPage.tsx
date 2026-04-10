import { useEffect } from 'react';
import Header from '@cloudscape-design/components/header';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Box from '@cloudscape-design/components/box';
import StatusIndicator from '@cloudscape-design/components/status-indicator';
import Link from '@cloudscape-design/components/link';
import Table from '@cloudscape-design/components/table';
import Button from '@cloudscape-design/components/button';
import { useNavigate } from 'react-router-dom';
import { useAppState } from '../context/AppContext';

export default function AgentsPage() {
  const navigate = useNavigate();
  const { agents, dataLoaded, loadData } = useAppState();

  useEffect(() => {
    if (!dataLoaded) loadData();
  }, [dataLoaded, loadData]);

  const loading = !dataLoaded;

  return (
    <SpaceBetween size="l">
      <Header
        variant="h1"
        description="All deployed agent runtimes"
        actions={
          <Button variant="primary" onClick={() => navigate('/builder')}>
            Build New Agent
          </Button>
        }
      >
        Agents
      </Header>
      <Table
        loading={loading}
        loadingText="Loading agents..."
        items={agents}
        empty={
          <Box textAlign="center" padding="l" color="text-body-secondary">
            No agents deployed yet.
          </Box>
        }
        columnDefinitions={[
          {
            id: 'name',
            header: 'Agent Name',
            cell: (item) => (
              <Link onFollow={(e) => { e.preventDefault(); navigate(`/agents/${item.agentRuntimeId}`); }}>
                {item.agentRuntimeName}
              </Link>
            ),
            sortingField: 'agentRuntimeName',
          },
          {
            id: 'id',
            header: 'Runtime ID',
            cell: (item) => <Box variant="code">{item.agentRuntimeId}</Box>,
          },
          {
            id: 'status',
            header: 'Status',
            cell: (item) => (
              <StatusIndicator
                type={item.status === 'READY' ? 'success' : item.status === 'CREATING' || item.status === 'UPDATING' ? 'in-progress' : 'error'}
              >
                {item.status}
              </StatusIndicator>
            ),
          },
          {
            id: 'actions',
            header: 'Actions',
            cell: (item) => (
              <SpaceBetween direction="horizontal" size="xs">
                <Button variant="inline-link" onClick={() => navigate(`/agents/${item.agentRuntimeId}`)}>Details</Button>
                {item.status === 'READY' && (
                  <Button variant="inline-link" onClick={() => navigate(`/chat?agent=${item.agentRuntimeId}`)}>Chat</Button>
                )}
              </SpaceBetween>
            ),
          },
        ]}
        sortingDisabled
      />
    </SpaceBetween>
  );
}
