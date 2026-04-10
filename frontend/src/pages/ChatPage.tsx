import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import Container from '@cloudscape-design/components/container';
import Header from '@cloudscape-design/components/header';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Box from '@cloudscape-design/components/box';
import StatusIndicator from '@cloudscape-design/components/status-indicator';
import Alert from '@cloudscape-design/components/alert';
import ButtonGroup from '@cloudscape-design/components/button-group';
import Badge from '@cloudscape-design/components/badge';
import Grid from '@cloudscape-design/components/grid';
import ChatBubble from '@cloudscape-design/chat-components/chat-bubble';
import Avatar from '@cloudscape-design/chat-components/avatar';
import SupportPromptGroup from '@cloudscape-design/chat-components/support-prompt-group';
import PromptInput from '@cloudscape-design/components/prompt-input';
import Toggle from '@cloudscape-design/components/toggle';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { invokeAgent } from '../agentcore';
import { listAgents, AgentRuntimeSummary } from '../api/agents';
import PersonaToggle, { PERSONAS, Persona } from '../components/PersonaToggle';
import AgentActivityPanel, { ActivityEvent, ToolActivity } from '../components/AgentActivityPanel';
import '../markdown.css';

interface Message {
  type: 'user' | 'agent';
  content: string;
  timestamp: Date;
}

interface MessageFeedback {
  [messageIndex: number]: {
    feedback?: 'helpful' | 'not-helpful';
    submitting?: boolean;
    showCopySuccess?: boolean;
  };
}

export default function ChatPage() {
  const [searchParams] = useSearchParams();
  const paramAgentId = searchParams.get('agentId');
  const paramAgentArn = searchParams.get('agentArn');

  const [agents, setAgents] = useState<AgentRuntimeSummary[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string>(paramAgentId || '');
  const [selectedAgentArn, setSelectedAgentArn] = useState<string>(paramAgentArn || '');
  const [agentsLoading, setAgentsLoading] = useState(false);

  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [messageFeedback, setMessageFeedback] = useState<MessageFeedback>({});
  const [showSupportPrompts, setShowSupportPrompts] = useState(true);
  const [showActivityPanel, setShowActivityPanel] = useState(true);

  // Activity events for the Agent Activity panel
  const [activityEvents, setActivityEvents] = useState<ActivityEvent[]>([]);

  // Persona state for Act 6
  const [activePersona, setActivePersona] = useState<Persona>(PERSONAS[0]);

  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load agents list
  useEffect(() => {
    async function loadAgents() {
      setAgentsLoading(true);
      try {
        const data = await listAgents();
        setAgents(data);
        if (paramAgentId) {
          const found = data.find((a) => a.agentRuntimeId === paramAgentId);
          if (found) {
            setSelectedAgentId(found.agentRuntimeId);
            setSelectedAgentArn(found.agentRuntimeArn);
          }
        } else if (data.length > 0) {
          setSelectedAgentId(data[0].agentRuntimeId);
          setSelectedAgentArn(data[0].agentRuntimeArn);
        }
      } catch {
        // Agent list may fail if no backend
      } finally {
        setAgentsLoading(false);
      }
    }
    loadAgents();
  }, [paramAgentId]);

  const handleSelectAgent = (agent: AgentRuntimeSummary) => {
    setSelectedAgentId(agent.agentRuntimeId);
    setSelectedAgentArn(agent.agentRuntimeArn);
    setMessages([]);
    setActivityEvents([]);
    setShowSupportPrompts(true);
    setError('');
  };

  const handleFeedback = async (messageIndex: number, feedbackType: 'helpful' | 'not-helpful') => {
    setMessageFeedback((prev) => ({
      ...prev,
      [messageIndex]: { ...prev[messageIndex], submitting: true },
    }));
    await new Promise((resolve) => setTimeout(resolve, 500));
    setMessageFeedback((prev) => ({
      ...prev,
      [messageIndex]: { feedback: feedbackType, submitting: false },
    }));
  };

  const handleCopy = async (messageIndex: number, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setMessageFeedback((prev) => ({
        ...prev,
        [messageIndex]: { ...prev[messageIndex], showCopySuccess: true },
      }));
      setTimeout(() => {
        setMessageFeedback((prev) => ({
          ...prev,
          [messageIndex]: { ...prev[messageIndex], showCopySuccess: false },
        }));
      }, 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const cleanResponse = (response: string): string => {
    let cleaned = response.trim();
    if (
      (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
      (cleaned.startsWith("'") && cleaned.endsWith("'"))
    ) {
      cleaned = cleaned.slice(1, -1);
    }
    cleaned = cleaned.replace(/\\n/g, '\n');
    cleaned = cleaned.replace(/\\t/g, '\t');
    return cleaned;
  };

  // Parse streaming content for tool use patterns
  const parseToolActivity = (chunk: string, fullContent: string) => {
    const toolCallPattern = /(?:Using tool|Calling|Invoking|Tool call):\s*(\w+)/i;
    const callMatch = chunk.match(toolCallPattern);
    if (callMatch) {
      const toolName = callMatch[1];
      const eventId = `event-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const toolId = `tool-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const tool: ToolActivity = {
        id: toolId,
        tool: toolName,
        status: 'invoking',
        timestamp: new Date(),
      };
      const event: ActivityEvent = {
        id: eventId,
        type: 'tool_use',
        content: `Calling ${toolName}`,
        timestamp: new Date(),
        tool,
      };
      setActivityEvents((prev) => [...prev, event]);

      setTimeout(() => {
        setActivityEvents((prev) =>
          prev.map((e) =>
            e.id === eventId && e.tool
              ? {
                  ...e,
                  tool: {
                    ...e.tool,
                    status: 'complete' as const,
                    duration: Math.floor(Math.random() * 800) + 200,
                  },
                }
              : e,
          ),
        );
      }, 1000);
    }

    const thinkingPattern = /(?:Let me|I'll|I will|Checking|Looking up|Analyzing|Processing)/i;
    if (chunk.match(thinkingPattern) && chunk.length > 10) {
      if (fullContent.length < 200) {
        setActivityEvents((prev) => {
          if (prev.length > 0 && prev[prev.length - 1].type === 'thinking') return prev;
          return [
            ...prev,
            {
              id: `event-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              type: 'thinking',
              content: chunk.slice(0, 100),
              timestamp: new Date(),
            },
          ];
        });
      }
    }
  };

  const handleSendMessage = async () => {
    if (!prompt.trim()) {
      setError('Please enter a prompt');
      return;
    }

    setShowSupportPrompts(false);
    const userMessage: Message = {
      type: 'user',
      content: prompt,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setLoading(true);
    setError('');
    const currentPrompt = prompt;
    setPrompt('');

    // Add a "thinking" event to the activity panel
    setActivityEvents((prev) => [
      ...prev,
      {
        id: `event-thinking-${Date.now()}`,
        type: 'thinking',
        content: `Processing: "${currentPrompt.slice(0, 60)}${currentPrompt.length > 60 ? '...' : ''}"`,
        timestamp: new Date(),
      },
    ]);

    const streamingMessageIndex = messages.length + 1;
    setMessages((prev) => [...prev, { type: 'agent', content: '', timestamp: new Date() }]);

    try {
      let streamedContent = '';
      const data = await invokeAgent({
        prompt: currentPrompt,
        agentRuntimeArn: selectedAgentArn || undefined,
        persona: activePersona.id,
        onChunk: (chunk: string) => {
          streamedContent += chunk;
          parseToolActivity(chunk, streamedContent);
          setMessages((prev) => {
            const updated = [...prev];
            updated[streamingMessageIndex] = {
              type: 'agent',
              content: streamedContent,
              timestamp: new Date(),
            };
            return updated;
          });
        },
      });

      const finalContent = cleanResponse(data.response || streamedContent);
      setMessages((prev) => {
        const updated = [...prev];
        updated[streamingMessageIndex] = {
          type: 'agent',
          content: finalContent,
          timestamp: new Date(),
        };
        return updated;
      });

      // Add response complete event
      setActivityEvents((prev) => [
        ...prev,
        {
          id: `event-response-${Date.now()}`,
          type: 'response',
          content: 'Response complete',
          timestamp: new Date(),
        },
      ]);

      setShowSupportPrompts(true);
    } catch (err: any) {
      setError(err.message);
      setMessages((prev) => prev.slice(0, -1));
      setActivityEvents((prev) => [
        ...prev,
        {
          id: `event-error-${Date.now()}`,
          type: 'error',
          content: err.message,
          timestamp: new Date(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const getSupportPrompts = () => {
    if (messages.length === 0) {
      return [
        { id: 'hello', text: 'Hello! What can you help me with?' },
        { id: 'capabilities', text: 'What tools and capabilities do you have?' },
        { id: 'example', text: 'Show me an example of what you can do' },
      ];
    }

    return [
      { id: 'more', text: 'Tell me more' },
      { id: 'next', text: 'What else can you do?' },
      { id: 'help', text: 'Help me with something else' },
    ];
  };

  const handleSupportPromptClick = (promptText: string) => {
    setPrompt(promptText);
    setShowSupportPrompts(false);
  };

  const selectedAgentData = agents.find((a) => a.agentRuntimeId === selectedAgentId);

  // Chat panel content
  const chatContent = (
    <Container
      fitHeight
      header={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box variant="h3">
            {selectedAgentData ? selectedAgentData.agentRuntimeName : 'Select an agent'}
          </Box>
          <SpaceBetween direction="horizontal" size="xs" alignItems="center">
            <Box variant="span" fontSize="body-s" color="text-body-secondary">
              Activity Panel
            </Box>
            <Toggle
              checked={showActivityPanel}
              onChange={({ detail }) => setShowActivityPanel(detail.checked)}
            >
              {''}
            </Toggle>
          </SpaceBetween>
        </div>
      }
    >
      <div
        role="region"
        aria-label="Chat"
        style={{ display: 'flex', flexDirection: 'column', minHeight: '400px' }}
      >
        <div style={{ flex: 1, overflowY: 'auto', maxHeight: '500px', paddingBottom: '16px' }}>
          <SpaceBetween size="m">
            {messages.length === 0 ? (
              <Box textAlign="center" padding={{ vertical: 'xxl' }} color="text-body-secondary">
                <SpaceBetween size="s">
                  <Box fontSize="display-l">💬</Box>
                  <Box>
                    {selectedAgentData
                      ? `Ask ${selectedAgentData.agentRuntimeName} anything, or pick a prompt below.`
                      : 'Select an agent above to start chatting.'}
                  </Box>
                </SpaceBetween>
              </Box>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {messages.map((message, index) => {
                  const feedback = messageFeedback[index];
                  const isAgent = message.type === 'agent';

                  return (
                    <div
                      key={index}
                      style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}
                    >
                      {isAgent && (
                        <Avatar
                          ariaLabel="Agent"
                          tooltipText="Agent"
                          iconName="gen-ai"
                          color="gen-ai"
                        />
                      )}
                      <div style={{ flex: 1 }}>
                        <ChatBubble
                          type={message.type === 'user' ? 'outgoing' : 'incoming'}
                          ariaLabel={`${message.type === 'user' ? activePersona.name : 'Agent'} message`}
                          avatar={message.type === 'user' ? <div /> : undefined}
                        >
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              code: ({ className, children }: any) => {
                                const inline = !className;
                                return inline ? (
                                  <code
                                    style={{
                                      backgroundColor: '#f4f4f4',
                                      padding: '2px 6px',
                                      borderRadius: '3px',
                                      fontFamily: 'monospace',
                                      fontSize: '0.9em',
                                    }}
                                  >
                                    {children}
                                  </code>
                                ) : (
                                  <pre
                                    style={{
                                      backgroundColor: '#f4f4f4',
                                      padding: '12px',
                                      borderRadius: '6px',
                                      overflow: 'auto',
                                      fontFamily: 'monospace',
                                      fontSize: '0.9em',
                                    }}
                                  >
                                    <code className={className}>{children}</code>
                                  </pre>
                                );
                              },
                              a: ({ children, href }: any) => (
                                <a
                                  href={href}
                                  style={{ color: '#0972d3' }}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  {children}
                                </a>
                              ),
                              ul: ({ children }: any) => (
                                <ul
                                  style={{
                                    marginLeft: '20px',
                                    marginTop: '8px',
                                    marginBottom: '8px',
                                  }}
                                >
                                  {children}
                                </ul>
                              ),
                              ol: ({ children }: any) => (
                                <ol
                                  style={{
                                    marginLeft: '20px',
                                    marginTop: '8px',
                                    marginBottom: '8px',
                                  }}
                                >
                                  {children}
                                </ol>
                              ),
                              p: ({ children }: any) => (
                                <p style={{ marginTop: '8px', marginBottom: '8px' }}>{children}</p>
                              ),
                            }}
                          >
                            {message.content}
                          </ReactMarkdown>
                        </ChatBubble>

                        {isAgent && message.content && (
                          <div style={{ marginTop: '8px' }}>
                            <ButtonGroup
                              variant="icon"
                              ariaLabel="Message actions"
                              items={[
                                {
                                  type: 'icon-button',
                                  id: 'thumbs-up',
                                  iconName:
                                    feedback?.feedback === 'helpful'
                                      ? 'thumbs-up-filled'
                                      : 'thumbs-up',
                                  text: 'Helpful',
                                  disabled: feedback?.submitting || !!feedback?.feedback,
                                  loading:
                                    feedback?.submitting && feedback?.feedback !== 'not-helpful',
                                },
                                {
                                  type: 'icon-button',
                                  id: 'thumbs-down',
                                  iconName:
                                    feedback?.feedback === 'not-helpful'
                                      ? 'thumbs-down-filled'
                                      : 'thumbs-down',
                                  text: 'Not helpful',
                                  disabled: feedback?.submitting || !!feedback?.feedback,
                                  loading:
                                    feedback?.submitting && feedback?.feedback !== 'helpful',
                                },
                                {
                                  type: 'icon-button',
                                  id: 'copy',
                                  iconName: 'copy',
                                  text: 'Copy',
                                  popoverFeedback: feedback?.showCopySuccess ? (
                                    <StatusIndicator type="success">Copied</StatusIndicator>
                                  ) : undefined,
                                },
                              ]}
                              onItemClick={({ detail }) => {
                                if (detail.id === 'thumbs-up')
                                  handleFeedback(index, 'helpful');
                                else if (detail.id === 'thumbs-down')
                                  handleFeedback(index, 'not-helpful');
                                else if (detail.id === 'copy')
                                  handleCopy(index, message.content);
                              }}
                            />
                            {feedback?.feedback && (
                              <Box
                                margin={{ top: 'xs' }}
                                color="text-status-info"
                                fontSize="body-s"
                              >
                                Feedback submitted
                              </Box>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                {loading && (
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                    <Avatar
                      ariaLabel="Agent"
                      tooltipText="Agent"
                      iconName="gen-ai"
                      color="gen-ai"
                      loading={true}
                    />
                    <Box color="text-body-secondary">Generating a response</Box>
                  </div>
                )}
              </div>
            )}

          </SpaceBetween>
          <div ref={chatEndRef} />
        </div>

        {showSupportPrompts && !loading && (
          <div style={{ paddingBottom: '8px' }}>
            <SupportPromptGroup
              onItemClick={({ detail }) =>
                handleSupportPromptClick(
                  getSupportPrompts().find((p) => p.id === detail.id)?.text || '',
                )
              }
              ariaLabel="Suggested prompts"
              alignment="horizontal"
              items={getSupportPrompts()}
            />
          </div>
        )}

        <PromptInput
          value={prompt}
          onChange={({ detail }) => setPrompt(detail.value)}
          onAction={handleSendMessage}
          placeholder={`Ask as ${activePersona.name} (${activePersona.role})...`}
          actionButtonAriaLabel="Send message"
          actionButtonIconName="send"
          disabled={loading}
        />
      </div>
    </Container>
  );

  return (
    <SpaceBetween size="l">
      <Header
        variant="h1"
        actions={
          <SpaceBetween direction="horizontal" size="m" alignItems="center">
            <PersonaToggle activePersona={activePersona} onChange={setActivePersona} />
          </SpaceBetween>
        }
      >
        Agent Chat
      </Header>

      {/* Agent Selector Cards */}
      {agents.length > 0 && (
        <div
          style={{
            display: 'flex',
            gap: '12px',
            overflowX: 'auto',
            paddingBottom: '4px',
          }}
        >
          {agents.map((agent) => {
            const isSelected = agent.agentRuntimeId === selectedAgentId;
            return (
              <div
                key={agent.agentRuntimeId}
                onClick={() => handleSelectAgent(agent)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') handleSelectAgent(agent);
                }}
                style={{
                  minWidth: '200px',
                  maxWidth: '280px',
                  padding: '12px 16px',
                  borderRadius: '8px',
                  border: isSelected ? '2px solid #0972d3' : '2px solid #e9ebed',
                  backgroundColor: isSelected ? '#f2f8fd' : '#ffffff',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  boxShadow: isSelected ? '0 0 0 1px #0972d3' : 'none',
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.borderColor = '#89bdee';
                    e.currentTarget.style.backgroundColor = '#f9fbfd';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.borderColor = '#e9ebed';
                    e.currentTarget.style.backgroundColor = '#ffffff';
                  }
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
                    <Box variant="span" fontWeight="bold" fontSize="body-s">
                      {agent.agentRuntimeName}
                    </Box>
                    <Badge
                      color={
                        agent.status === 'READY'
                          ? 'green'
                          : agent.status === 'CREATING' || agent.status === 'UPDATING'
                            ? 'blue'
                            : 'grey'
                      }
                    >
                      {agent.status}
                    </Badge>
                  </div>
                  {agent.description && (
                    <Box variant="span" fontSize="body-s" color="text-body-secondary">
                      {agent.description.length > 60
                        ? agent.description.slice(0, 60) + '...'
                        : agent.description}
                    </Box>
                  )}
                </SpaceBetween>
              </div>
            );
          })}
        </div>
      )}

      {agentsLoading && (
        <Box textAlign="center" padding="s">
          <StatusIndicator type="loading">Loading agents...</StatusIndicator>
        </Box>
      )}

      {error && (
        <Alert type="error" dismissible onDismiss={() => setError('')}>
          {error}
        </Alert>
      )}

      {/* Dual-panel layout: Chat + Agent Activity */}
      {showActivityPanel ? (
        <Grid gridDefinition={[{ colspan: 8 }, { colspan: 4 }]}>
          {chatContent}
          <AgentActivityPanel events={activityEvents} isProcessing={loading} />
        </Grid>
      ) : (
        chatContent
      )}
    </SpaceBetween>
  );
}
