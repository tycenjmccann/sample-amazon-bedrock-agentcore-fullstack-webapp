import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import Container from '@cloudscape-design/components/container';
import Header from '@cloudscape-design/components/header';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Box from '@cloudscape-design/components/box';
import Select from '@cloudscape-design/components/select';
import StatusIndicator from '@cloudscape-design/components/status-indicator';
import Alert from '@cloudscape-design/components/alert';
import ButtonGroup from '@cloudscape-design/components/button-group';
import Badge from '@cloudscape-design/components/badge';
import ColumnLayout from '@cloudscape-design/components/column-layout';
import ChatBubble from '@cloudscape-design/chat-components/chat-bubble';
import Avatar from '@cloudscape-design/chat-components/avatar';
import SupportPromptGroup from '@cloudscape-design/chat-components/support-prompt-group';
import PromptInput from '@cloudscape-design/components/prompt-input';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { invokeAgent } from '../agentcore';
import { listAgents, AgentRuntimeSummary } from '../api/agents';
import PersonaToggle, { PERSONAS, Persona } from '../components/PersonaToggle';
import '../markdown.css';

interface Message {
  type: 'user' | 'agent';
  content: string;
  timestamp: Date;
  toolCalls?: ToolCall[];
}

interface ToolCall {
  tool: string;
  status: 'calling' | 'done';
  result?: string;
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

  const isLocalDev = (import.meta as any).env.VITE_LOCAL_DEV === 'true';

  const [agents, setAgents] = useState<AgentRuntimeSummary[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<any>(null);
  const [selectedAgentArn, setSelectedAgentArn] = useState<string>(paramAgentArn || '');
  const [agentsLoading, setAgentsLoading] = useState(false);

  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [messageFeedback, setMessageFeedback] = useState<MessageFeedback>({});
  const [showSupportPrompts, setShowSupportPrompts] = useState(true);

  // Persona state for Act 6
  const [activePersona, setActivePersona] = useState<Persona>(PERSONAS[0]);

  // Load agents list
  useEffect(() => {
    if (isLocalDev) return;
    async function loadAgents() {
      setAgentsLoading(true);
      try {
        const data = await listAgents();
        setAgents(data);
        // Auto-select agent from URL params
        if (paramAgentId) {
          const found = data.find((a) => a.agentRuntimeId === paramAgentId);
          if (found) {
            setSelectedAgent({ label: found.agentRuntimeName, value: found.agentRuntimeId });
            setSelectedAgentArn(found.agentRuntimeArn);
          }
        } else if (data.length > 0) {
          setSelectedAgent({ label: data[0].agentRuntimeName, value: data[0].agentRuntimeId });
          setSelectedAgentArn(data[0].agentRuntimeArn);
        }
      } catch {
        // Agent list may fail if no backend
      } finally {
        setAgentsLoading(false);
      }
    }
    loadAgents();
  }, [isLocalDev, paramAgentId]);

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
      setShowSupportPrompts(true);
    } catch (err: any) {
      setError(err.message);
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setLoading(false);
    }
  };

  const getSupportPrompts = () => {
    if (messages.length === 0) {
      return [
        { id: 'lookup', text: 'Look up user profile for user ID 12345' },
        { id: 'metrics', text: "What are today's trust & safety metrics?" },
        { id: 'flag', text: 'Flag content ID C-789 for harassment' },
        { id: 'suspend', text: 'Suspend user 12345 for repeated harassment' },
      ];
    }

    const lastMessage = messages[messages.length - 1];
    if (lastMessage.type === 'agent') {
      const content = lastMessage.content.toLowerCase();
      if (content.includes('user') || content.includes('profile') || content.includes('violation')) {
        return [
          { id: 'flag-content', text: 'Flag their latest content for review' },
          { id: 'check-metrics', text: 'Show me overall safety metrics' },
          { id: 'suspend-user', text: 'Suspend this account for 7 days' },
        ];
      }
      if (content.includes('flagged') || content.includes('flag')) {
        return [
          { id: 'notify', text: 'Notify the team via Slack' },
          { id: 'escalate', text: 'Escalate to a senior moderator' },
          { id: 'more-flags', text: 'Check for more content from this user' },
        ];
      }
      if (content.includes('suspended') || content.includes('suspension')) {
        return [
          { id: 'slack-notify', text: 'Send Slack notification about this action' },
          { id: 'daily-stats', text: 'Show daily moderation stats' },
          { id: 'next-case', text: 'What other cases need review?' },
        ];
      }
    }

    return [
      { id: 'more', text: 'Tell me more' },
      { id: 'metrics-default', text: 'Show safety metrics' },
      { id: 'lookup-default', text: 'Look up a user' },
    ];
  };

  const handleSupportPromptClick = (promptText: string) => {
    setPrompt(promptText);
    setShowSupportPrompts(false);
  };

  const selectedAgentData = agents.find((a) => a.agentRuntimeId === selectedAgent?.value);

  return (
    <SpaceBetween size="l">
      <Header
        variant="h1"
        description="Chat with your AgentCore agents"
        actions={
          <SpaceBetween direction="horizontal" size="m" alignItems="center">
            <PersonaToggle activePersona={activePersona} onChange={setActivePersona} />
          </SpaceBetween>
        }
      >
        Agent Chat
      </Header>

      {!isLocalDev && (
        <ColumnLayout columns={2}>
          <Select
            selectedOption={selectedAgent}
            onChange={({ detail }) => {
              setSelectedAgent(detail.selectedOption);
              const found = agents.find((a) => a.agentRuntimeId === detail.selectedOption.value);
              if (found) setSelectedAgentArn(found.agentRuntimeArn);
              setMessages([]);
              setShowSupportPrompts(true);
            }}
            options={agents.map((a) => ({
              label: a.agentRuntimeName,
              value: a.agentRuntimeId,
              description: a.description,
              labelTag: a.status,
            }))}
            placeholder="Select an agent"
            statusType={agentsLoading ? 'loading' : 'finished'}
            loadingText="Loading agents..."
            empty="No agents available"
          />
          <Box>
            {selectedAgentData && (
              <SpaceBetween direction="horizontal" size="xs" alignItems="center">
                <StatusIndicator
                  type={selectedAgentData.status === 'READY' ? 'success' : 'in-progress'}
                >
                  {selectedAgentData.status}
                </StatusIndicator>
                <Badge color="blue">
                  {activePersona.name} ({activePersona.role})
                </Badge>
              </SpaceBetween>
            )}
          </Box>
        </ColumnLayout>
      )}

      {error && (
        <Alert type="error" dismissible onDismiss={() => setError('')}>
          {error}
        </Alert>
      )}

      <Container>
        <div role="region" aria-label="Chat">
          <SpaceBetween size="m">
            {messages.length === 0 ? (
              <Box textAlign="center" padding={{ vertical: 'xxl' }} color="text-body-secondary">
                <SpaceBetween size="s">
                  <Box variant="h3">Trust & Safety Content Moderation Agent</Box>
                  <Box>
                    Investigate reports, review user profiles, flag content, and take enforcement
                    actions. Start by selecting a prompt below or typing your own.
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
                          ariaLabel="Trust & Safety Agent"
                          tooltipText="Trust & Safety Agent"
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
                      ariaLabel="Trust & Safety Agent"
                      tooltipText="Trust & Safety Agent"
                      iconName="gen-ai"
                      color="gen-ai"
                      loading={true}
                    />
                    <Box color="text-body-secondary">Generating a response</Box>
                  </div>
                )}
              </div>
            )}

            {showSupportPrompts && !loading && (
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
          </SpaceBetween>
        </div>
      </Container>
    </SpaceBetween>
  );
}
