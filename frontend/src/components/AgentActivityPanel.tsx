import { useEffect, useRef } from 'react';
import Container from '@cloudscape-design/components/container';
import Header from '@cloudscape-design/components/header';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Box from '@cloudscape-design/components/box';
import StatusIndicator from '@cloudscape-design/components/status-indicator';
import Badge from '@cloudscape-design/components/badge';
import ExpandableSection from '@cloudscape-design/components/expandable-section';

export interface ToolActivity {
  id: string;
  tool: string;
  status: 'invoking' | 'complete' | 'error';
  input?: string;
  output?: string;
  timestamp: Date;
  duration?: number;
}

export interface ActivityEvent {
  id: string;
  type: 'thinking' | 'tool_use' | 'response' | 'error';
  content: string;
  timestamp: Date;
  tool?: ToolActivity;
}

interface AgentActivityPanelProps {
  events: ActivityEvent[];
  isProcessing: boolean;
}

export default function AgentActivityPanel({ events, isProcessing }: AgentActivityPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events]);

  const getStatusIcon = (event: ActivityEvent) => {
    if (event.type === 'thinking') {
      return <StatusIndicator type="in-progress">Reasoning</StatusIndicator>;
    }
    if (event.type === 'tool_use' && event.tool) {
      if (event.tool.status === 'invoking') {
        return <StatusIndicator type="loading">Calling {event.tool.tool}</StatusIndicator>;
      }
      if (event.tool.status === 'complete') {
        return <StatusIndicator type="success">{event.tool.tool}</StatusIndicator>;
      }
      if (event.tool.status === 'error') {
        return <StatusIndicator type="error">{event.tool.tool}</StatusIndicator>;
      }
    }
    if (event.type === 'response') {
      return <StatusIndicator type="success">Response</StatusIndicator>;
    }
    if (event.type === 'error') {
      return <StatusIndicator type="error">Error</StatusIndicator>;
    }
    return null;
  };

  const formatTimestamp = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <Container
      header={
        <Header
          variant="h3"
          description="Real-time view of agent reasoning and tool calls"
          counter={events.length > 0 ? `(${events.length})` : undefined}
        >
          <SpaceBetween direction="horizontal" size="xs" alignItems="center">
            <span>Agent Activity</span>
            {isProcessing && <Badge color="blue">Live</Badge>}
          </SpaceBetween>
        </Header>
      }
    >
      <div
        ref={scrollRef}
        style={{
          maxHeight: '600px',
          overflowY: 'auto',
          padding: '4px',
        }}
      >
        {events.length === 0 ? (
          <Box textAlign="center" padding={{ vertical: 'l' }} color="text-body-secondary">
            <SpaceBetween size="xs">
              <Box variant="p" fontSize="body-s">
                Agent activity will appear here as the agent processes your messages.
              </Box>
              <Box variant="p" fontSize="body-s">
                You will see tool invocations, reasoning steps, and response generation in real time.
              </Box>
            </SpaceBetween>
          </Box>
        ) : (
          <SpaceBetween size="s">
            {events.map((event) => (
              <div
                key={event.id}
                style={{
                  borderLeft: `3px solid ${
                    event.type === 'tool_use'
                      ? event.tool?.status === 'error'
                        ? '#d91515'
                        : event.tool?.status === 'complete'
                          ? '#037f0c'
                          : '#0972d3'
                      : event.type === 'thinking'
                        ? '#8c6bb1'
                        : event.type === 'error'
                          ? '#d91515'
                          : '#037f0c'
                  }`,
                  paddingLeft: '12px',
                  paddingTop: '4px',
                  paddingBottom: '4px',
                }}
              >
                <SpaceBetween size="xxs">
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    {getStatusIcon(event)}
                    <Box fontSize="body-s" color="text-body-secondary">
                      {formatTimestamp(event.timestamp)}
                    </Box>
                  </div>

                  {event.type === 'tool_use' && event.tool && (
                    <div>
                      {event.tool.input && (
                        <ExpandableSection
                          variant="footer"
                          headerText="Input"
                          defaultExpanded={false}
                        >
                          <pre
                            style={{
                              backgroundColor: '#f4f4f4',
                              padding: '8px',
                              borderRadius: '4px',
                              fontSize: '12px',
                              fontFamily: 'monospace',
                              overflow: 'auto',
                              maxHeight: '150px',
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-word',
                              margin: 0,
                            }}
                          >
                            {event.tool.input}
                          </pre>
                        </ExpandableSection>
                      )}
                      {event.tool.output && (
                        <ExpandableSection
                          variant="footer"
                          headerText="Output"
                          defaultExpanded={event.tool.status === 'error'}
                        >
                          <pre
                            style={{
                              backgroundColor: event.tool.status === 'error' ? '#fdf3f3' : '#f4f4f4',
                              padding: '8px',
                              borderRadius: '4px',
                              fontSize: '12px',
                              fontFamily: 'monospace',
                              overflow: 'auto',
                              maxHeight: '150px',
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-word',
                              margin: 0,
                            }}
                          >
                            {event.tool.output}
                          </pre>
                        </ExpandableSection>
                      )}
                      {event.tool.duration !== undefined && (
                        <Box fontSize="body-s" color="text-body-secondary">
                          Duration: {event.tool.duration}ms
                        </Box>
                      )}
                    </div>
                  )}

                  {event.type === 'thinking' && (
                    <Box fontSize="body-s" color="text-body-secondary">
                      {event.content}
                    </Box>
                  )}

                  {event.type === 'error' && (
                    <Box fontSize="body-s" color="text-status-error">
                      {event.content}
                    </Box>
                  )}
                </SpaceBetween>
              </div>
            ))}

            {isProcessing && (
              <div
                style={{
                  borderLeft: '3px solid #0972d3',
                  paddingLeft: '12px',
                  paddingTop: '4px',
                  paddingBottom: '4px',
                }}
              >
                <StatusIndicator type="loading">Processing...</StatusIndicator>
              </div>
            )}
          </SpaceBetween>
        )}
      </div>
    </Container>
  );
}
