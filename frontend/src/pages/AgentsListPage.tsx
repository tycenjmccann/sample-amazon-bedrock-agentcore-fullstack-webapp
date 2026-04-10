import { useState, useEffect, useRef, useCallback } from 'react';
import Container from '@cloudscape-design/components/container';
import Header from '@cloudscape-design/components/header';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Box from '@cloudscape-design/components/box';
import StatusIndicator from '@cloudscape-design/components/status-indicator';
import Alert from '@cloudscape-design/components/alert';
import Badge from '@cloudscape-design/components/badge';
import Tabs from '@cloudscape-design/components/tabs';
import Button from '@cloudscape-design/components/button';
import PromptInput from '@cloudscape-design/components/prompt-input';
import TextFilter from '@cloudscape-design/components/text-filter';
import ChatBubble from '@cloudscape-design/chat-components/chat-bubble';
import Avatar from '@cloudscape-design/chat-components/avatar';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { listAgents, AgentRuntimeSummary } from '../api/agents';
import {
  streamAgentBuilderChat,
  deployAgent,
  getDeployStatus,
  parseDeployableCode,
  ChatMessage as APIChatMessage,
} from '../api/agent-builder';
import '../markdown.css';

interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  tools?: string[];
}

const AGENT_TEMPLATES: AgentTemplate[] = [
  {
    id: 'blank',
    name: 'Blank agent config',
    description: 'A blank starting point with the core toolset.',
    icon: '📄',
  },
  {
    id: 'trust-safety',
    name: 'Trust & Safety Agent',
    description: 'Content moderation with user lookup, flagging, suspension, and Slack notifications.',
    icon: '🛡️',
    tools: ['user_lookup', 'content_flag', 'account_suspension', 'slack_notification', 'safety_metrics'],
  },
  {
    id: 'support',
    name: 'Support Agent',
    description: 'Answers customer questions from your docs and knowledge base, and escalates when needed.',
    icon: '💬',
    tools: ['knowledge_search', 'ticket_create', 'escalation'],
  },
  {
    id: 'data-analyst',
    name: 'Data Analyst',
    description: 'Load, explore, and visualize data; build reports and answer questions from datasets.',
    icon: '📊',
    tools: ['sql_query', 'chart_generate', 'data_export'],
  },
  {
    id: 'research',
    name: 'Deep Researcher',
    description: 'Conducts multi-step web research with source synthesis and citations.',
    icon: '🔍',
    tools: ['web_search', 'document_reader', 'citation_formatter'],
  },
  {
    id: 'incident',
    name: 'Incident Commander',
    description: 'Triages alerts, opens incident tickets, and runs the Slack war room.',
    icon: '🚨',
    tools: ['alert_triage', 'ticket_create', 'slack_channel', 'runbook_execute'],
  },
  {
    id: 'feedback',
    name: 'Feedback Miner',
    description: 'Clusters raw feedback from Slack and Notion into themes and drafts tasks for the top asks.',
    icon: '📋',
    tools: ['slack_reader', 'notion_reader', 'theme_clusterer', 'task_drafter'],
  },
  {
    id: 'field-monitor',
    name: 'Field Monitor',
    description: 'Scans software blogs for a topic and writes a weekly what-changed brief.',
    icon: '📰',
    tools: ['rss_reader', 'web_scraper', 'summary_writer'],
  },
];

interface ChatMessage {
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isSystem?: boolean; // System-generated messages (deploy status) excluded from Bedrock API calls
}

interface DeploymentState {
  status: 'idle' | 'ready' | 'deploying' | 'polling' | 'success' | 'error';
  agentName?: string;
  description?: string;
  code?: string;
  agentRuntimeId?: string;
  errorMessage?: string;
}

interface CanvasState {
  code: string;
  fileName: string;
  agentName: string;
  description: string;
  isFromRuntime: boolean;
}

export default function AgentsListPage() {
  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [chatError, setChatError] = useState('');
  const [deployment, setDeployment] = useState<DeploymentState>({ status: 'idle' });

  // Right panel state
  const [activeTabId, setActiveTabId] = useState('templates');
  const [agents, setAgents] = useState<AgentRuntimeSummary[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [agentsError, setAgentsError] = useState('');
  const [filterText, setFilterText] = useState('');
  const [selectedAgent, setSelectedAgent] = useState<AgentRuntimeSummary | null>(null);
  const [templateContext, setTemplateContext] = useState<string | undefined>(undefined);

  // Canvas state for code editor panel
  const [canvas, setCanvas] = useState<CanvasState | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messages.length > 0) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, streamingContent]);

  // Load agents for the Runtime Agents tab
  useEffect(() => {
    async function loadAgents() {
      setAgentsLoading(true);
      try {
        const data = await listAgents();
        setAgents(data);
      } catch {
        // Agent list may fail if no backend
      } finally {
        setAgentsLoading(false);
      }
    }
    loadAgents();
  }, []);

  const filteredAgents = agents.filter(
    (a) =>
      a.agentRuntimeName.toLowerCase().includes(filterText.toLowerCase()) ||
      a.agentRuntimeId.toLowerCase().includes(filterText.toLowerCase()) ||
      (a.description || '').toLowerCase().includes(filterText.toLowerCase()),
  );

  function statusType(status: string): 'success' | 'in-progress' | 'stopped' | 'error' {
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

  const handleTemplateClick = (template: AgentTemplate) => {
    if (template.id === 'blank') {
      setPrompt('Create a new agent with a blank configuration. I want to start from scratch.');
      setTemplateContext('Blank agent - starting from scratch with no pre-configured tools.');
    } else {
      const toolsList = template.tools ? template.tools.join(', ') : 'standard tools';
      setPrompt(
        `Create a new ${template.name} agent. ${template.description} It should include tools: ${toolsList}.`,
      );
      setTemplateContext(
        `Template: ${template.name}\nDescription: ${template.description}\nTools: ${toolsList}`,
      );
    }
  };

  const handleAgentSelect = (agent: AgentRuntimeSummary) => {
    setSelectedAgent(agent);
    setPrompt(
      `I want to modify agent "${agent.agentRuntimeName}" (ID: ${agent.agentRuntimeId}). It's currently in ${agent.status} status. What changes would you like to make?`,
    );
    setTemplateContext(undefined);
    // Reset deployment state so stale deploy actions don't appear on the canvas
    setDeployment({ status: 'idle' });
    // Load agent info into the canvas
    setCanvas({
      code: `# Agent: ${agent.agentRuntimeName}\n# Runtime ID: ${agent.agentRuntimeId}\n# Status: ${agent.status}\n${agent.description ? `# Description: ${agent.description}\n` : ''}\n# Use the chat to request modifications to this agent.\n# The assistant will generate updated code here.`,
      fileName: 'strands_agent.py',
      agentName: agent.agentRuntimeName,
      description: agent.description || '',
      isFromRuntime: true,
    });
    setActiveTabId('code');
  };

  const checkForDeployableCode = useCallback((content: string) => {
    console.log('[Builder] Checking for deployable code, content length:', content.length);
    const { agentConfig, code } = parseDeployableCode(content);
    console.log('[Builder] Parse result:', { agentConfig, codeLength: code?.length });
    if (code) {
      const name = agentConfig?.agent_name || 'custom_agent';
      const desc = agentConfig?.description || 'Agent created via Agent Builder';
      setDeployment({
        status: 'ready',
        agentName: name,
        description: desc,
        code,
      });
      setCanvas({
        code,
        fileName: 'strands_agent.py',
        agentName: name,
        description: desc,
        isFromRuntime: false,
      });
      setActiveTabId('code');

      // Remove code blocks from the chat message, keep just the explanation text
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last && last.type === 'assistant') {
          let cleaned = last.content;
          cleaned = cleaned.replace(/```agent-config\s*\n[\s\S]*?\n```/g, '');
          cleaned = cleaned.replace(/```python-deploy\s*\n[\s\S]*?\n```/g, '');
          cleaned = cleaned.replace(/```python\s*\n[\s\S]*?\n```/g, '');
          cleaned = cleaned.trim();
          if (cleaned) {
            cleaned += '\n\n*Code is now in the editor →*';
          }
          updated[updated.length - 1] = { ...last, content: cleaned };
        }
        return updated;
      });
    }
  }, []);

  const handleSendMessage = async () => {
    if (!prompt.trim()) return;

    const userMessage: ChatMessage = { type: 'user', content: prompt, timestamp: new Date() };
    setMessages((prev) => [...prev, userMessage]);
    setLoading(true);
    setChatError('');
    setStreamingContent('');
    setDeployment({ status: 'idle' });

    const currentPrompt = prompt;
    setPrompt('');

    // Build the conversation history for the API, excluding system-generated messages
    // (deploy status messages) to maintain alternating user/assistant roles required by Bedrock
    const apiMessages: APIChatMessage[] = [
      ...messages
        .filter((m) => !m.isSystem)
        .map((m) => ({
          role: (m.type === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
          content: m.content,
        })),
      { role: 'user' as const, content: currentPrompt },
    ];

    let fullResponse = '';

    await streamAgentBuilderChat(
      { messages: apiMessages, template_context: templateContext },
      // onText - called for each streaming chunk
      (text) => {
        fullResponse += text;
        setStreamingContent(fullResponse);
      },
      // onDone - called when streaming is complete
      () => {
        setMessages((prev) => [
          ...prev,
          { type: 'assistant', content: fullResponse, timestamp: new Date() },
        ]);
        setStreamingContent('');
        setLoading(false);
        // Clear template context after first message exchange
        setTemplateContext(undefined);
        // Check if the response contains deployable code
        checkForDeployableCode(fullResponse);
      },
      // onError - called if the stream fails
      (error) => {
        setChatError(error);
        setLoading(false);
        setStreamingContent('');
        // Add a synthetic assistant message to preserve alternating user/assistant roles
        // for the Bedrock Converse API. Without this, an orphaned user message would cause
        // consecutive user-role entries on the next send, triggering a ValidationException.
        // NOTE: This must NOT have isSystem: true — system messages are filtered out when
        // building apiMessages, which would defeat the purpose of this fix.
        setMessages((prev) => [
          ...prev,
          {
            type: 'assistant',
            content: 'Sorry, I encountered an error processing your request. Please try again.',
            timestamp: new Date(),
          },
        ]);
      },
    );
  };

  const handleDeploy = async () => {
    if (deployment.status !== 'ready' || !deployment.code || !deployment.agentName) return;
    setDeployment((prev) => ({ ...prev, status: 'deploying' }));

    try {
      const result = await deployAgent({
        agent_name: deployment.agentName,
        description: deployment.description || '',
        agent_code: deployment.code,
      });

      setDeployment((prev) => ({
        ...prev,
        status: 'polling',
        agentRuntimeId: result.agentRuntimeId,
      }));

      setMessages((prev) => [
        ...prev,
        {
          type: 'assistant',
          content: `Deploying **${deployment.agentName}** to AgentCore Runtime...\n\nRuntime ID: \`${result.agentRuntimeId}\`\n\nI'll monitor the deployment status for you.`,
          timestamp: new Date(),
          isSystem: true,
        },
      ]);

      pollDeploymentStatus(result.agentRuntimeId);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Deployment failed';
      setDeployment((prev) => ({ ...prev, status: 'error', errorMessage: errorMsg }));
      setMessages((prev) => [
        ...prev,
        {
          type: 'assistant',
          content: `Deployment failed: ${errorMsg}\n\nPlease check your AWS credentials and AgentCore permissions, then try again.`,
          timestamp: new Date(),
          isSystem: true,
        },
      ]);
    }
  };

  const pollDeploymentStatus = async (agentRuntimeId: string) => {
    const maxAttempts = 30; // Poll for up to 5 minutes (10s intervals)
    let attempts = 0;

    const poll = async () => {
      attempts++;
      try {
        const status = await getDeployStatus(agentRuntimeId);

        if (status.status === 'READY') {
          setDeployment((prev) => ({ ...prev, status: 'success' }));
          setMessages((prev) => [
            ...prev,
            {
              type: 'assistant',
              content: `Agent **${status.agentRuntimeName}** is now **READY** and live on AgentCore Runtime!\n\nRuntime ID: \`${agentRuntimeId}\`\n\nYou can now chat with it from the Chat page, or view its details in the Runtime Agents tab.`,
              timestamp: new Date(),
              isSystem: true,
            },
          ]);
          // Refresh the agents list
          try {
            const data = await listAgents();
            setAgents(data);
          } catch {
            // Ignore refresh errors
          }
          return;
        }

        if (status.status === 'FAILED') {
          setDeployment((prev) => ({
            ...prev,
            status: 'error',
            errorMessage: 'Agent runtime creation failed',
          }));
          setMessages((prev) => [
            ...prev,
            {
              type: 'assistant',
              content:
                'Agent deployment **failed**. The runtime entered FAILED status.\n\nPlease check the AgentCore console for details and try again.',
              timestamp: new Date(),
              isSystem: true,
            },
          ]);
          return;
        }

        if (attempts < maxAttempts) {
          setTimeout(poll, 10000); // Poll every 10 seconds
        } else {
          setDeployment((prev) => ({
            ...prev,
            status: 'error',
            errorMessage: 'Deployment timed out',
          }));
          setMessages((prev) => [
            ...prev,
            {
              type: 'assistant',
              content: `Deployment is taking longer than expected (status: ${status.status}). The agent may still be deploying.\n\nCheck the Runtime Agents tab or the AgentCore console for the latest status.`,
              timestamp: new Date(),
              isSystem: true,
            },
          ]);
        }
      } catch {
        if (attempts < maxAttempts) {
          setTimeout(poll, 10000);
        }
      }
    };

    setTimeout(poll, 10000); // Start polling after 10 seconds
  };

  // Template cards grid for the "Create New" tab
  const templatesContent = (
    <SpaceBetween size="s">
      <Box variant="p" color="text-body-secondary" fontSize="body-s">
        Choose a template to get started quickly, or describe your agent in the chat.
      </Box>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '8px',
        }}
      >
        {AGENT_TEMPLATES.map((template) => (
          <div
            key={template.id}
            onClick={() => handleTemplateClick(template)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') handleTemplateClick(template);
            }}
            style={{
              padding: '12px',
              borderRadius: '8px',
              border: '1px solid #e9ebed',
              backgroundColor: '#ffffff',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#89bdee';
              e.currentTarget.style.backgroundColor = '#f9fbfd';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#e9ebed';
              e.currentTarget.style.backgroundColor = '#ffffff';
            }}
          >
            <SpaceBetween size="xxs">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '18px' }}>{template.icon}</span>
                <Box variant="span" fontWeight="bold" fontSize="body-s">
                  {template.name}
                </Box>
              </div>
              <Box variant="span" fontSize="body-s" color="text-body-secondary">
                {template.description.length > 80
                  ? template.description.slice(0, 80) + '...'
                  : template.description}
              </Box>
              {template.tools && template.tools.length > 0 && (
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                  {template.tools.slice(0, 3).map((tool) => (
                    <Badge key={tool} color="blue">
                      {tool}
                    </Badge>
                  ))}
                  {template.tools.length > 3 && (
                    <Badge color="grey">+{template.tools.length - 3}</Badge>
                  )}
                </div>
              )}
            </SpaceBetween>
          </div>
        ))}
      </div>
    </SpaceBetween>
  );

  // Runtime agents list for the "Runtime Agents" tab
  const runtimeAgentsContent = (
    <SpaceBetween size="s">
      {agentsError && (
        <Alert type="error" dismissible onDismiss={() => setAgentsError('')}>
          {agentsError}
        </Alert>
      )}
      <TextFilter
        filteringText={filterText}
        onChange={({ detail }) => setFilterText(detail.filteringText)}
        filteringPlaceholder="Search agents..."
      />
      {agentsLoading ? (
        <Box textAlign="center" padding="l">
          <StatusIndicator type="loading">Loading agents...</StatusIndicator>
        </Box>
      ) : filteredAgents.length === 0 ? (
        <Box textAlign="center" padding="l" color="text-body-secondary">
          <SpaceBetween size="xs">
            <Box variant="p" fontWeight="bold">
              No agent runtimes found
            </Box>
            <Box variant="p" fontSize="body-s">
              Deploy an agent to see it here, or create a new one using the chat.
            </Box>
          </SpaceBetween>
        </Box>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {filteredAgents.map((agent) => {
            const isSelected = selectedAgent?.agentRuntimeId === agent.agentRuntimeId;
            return (
              <div
                key={agent.agentRuntimeId}
                onClick={() => handleAgentSelect(agent)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') handleAgentSelect(agent);
                }}
                style={{
                  padding: '12px',
                  borderRadius: '8px',
                  border: isSelected ? '2px solid #0972d3' : '1px solid #e9ebed',
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
                    <StatusIndicator type={statusType(agent.status)}>
                      {agent.status}
                    </StatusIndicator>
                  </div>
                  {agent.description && (
                    <Box variant="span" fontSize="body-s" color="text-body-secondary">
                      {agent.description.length > 60
                        ? agent.description.slice(0, 60) + '...'
                        : agent.description}
                    </Box>
                  )}
                  <Box variant="span" fontSize="body-s" color="text-body-secondary">
                    ID: {agent.agentRuntimeId}
                  </Box>
                </SpaceBetween>
              </div>
            );
          })}
        </div>
      )}
      <Button
        iconName="refresh"
        variant="normal"
        loading={agentsLoading}
        onClick={() => {
          setAgentsLoading(true);
          setAgentsError('');
          listAgents()
            .then((data) => setAgents(data))
            .catch(() => setAgentsError('Failed to refresh agents'))
            .finally(() => setAgentsLoading(false));
        }}
      >
        Refresh
      </Button>
    </SpaceBetween>
  );

  // Code canvas content for the "Code" tab
  const codeCanvasContent = canvas ? (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 320px)' }}>
      {/* Canvas header with agent info and deploy button */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '12px',
        }}
      >
        <SpaceBetween direction="horizontal" size="xs" alignItems="center">
          <Box variant="span" fontWeight="bold">{canvas.agentName}</Box>
          {canvas.isFromRuntime && <Badge color="grey">Runtime Agent</Badge>}
          {deployment.status === 'ready' && <Badge color="green">Ready to deploy</Badge>}
          {deployment.status === 'deploying' && <Badge color="blue">Deploying...</Badge>}
          {deployment.status === 'polling' && <Badge color="blue">Deploying...</Badge>}
          {deployment.status === 'success' && <Badge color="green">Deployed</Badge>}
          {deployment.status === 'error' && <Badge color="red">Failed</Badge>}
        </SpaceBetween>
        <SpaceBetween direction="horizontal" size="xs">
          {deployment.status === 'ready' && (
            <Button variant="primary" onClick={handleDeploy}>
              Deploy to AgentCore
            </Button>
          )}
          {deployment.status === 'error' && deployment.code && (
            <Button
              variant="normal"
              onClick={() =>
                setDeployment((prev) => ({ ...prev, status: 'ready', errorMessage: undefined }))
              }
            >
              Retry
            </Button>
          )}
        </SpaceBetween>
      </div>

      {/* Deploy status banner */}
      {deployment.status !== 'idle' && deployment.status !== 'ready' && (
        <div
          style={{
            padding: '8px 12px',
            borderRadius: '6px',
            border:
              deployment.status === 'success'
                ? '1px solid #037f0c'
                : deployment.status === 'error'
                  ? '1px solid #d91515'
                  : '1px solid #0972d3',
            backgroundColor:
              deployment.status === 'success'
                ? '#f2fcf3'
                : deployment.status === 'error'
                  ? '#fdf3f3'
                  : '#f2f8fd',
            marginBottom: '12px',
          }}
        >
          {deployment.status === 'deploying' && (
            <StatusIndicator type="in-progress">
              Deploying {deployment.agentName}...
            </StatusIndicator>
          )}
          {deployment.status === 'polling' && (
            <StatusIndicator type="in-progress">
              Waiting for {deployment.agentName} to become ready...
            </StatusIndicator>
          )}
          {deployment.status === 'success' && (
            <StatusIndicator type="success">
              {deployment.agentName} deployed successfully!
            </StatusIndicator>
          )}
          {deployment.status === 'error' && (
            <StatusIndicator type="error">
              Deployment failed: {deployment.errorMessage}
            </StatusIndicator>
          )}
        </div>
      )}

      {canvas.description && (
        <Box variant="span" fontSize="body-s" color="text-body-secondary" margin={{ bottom: 'xs' }}>
          {canvas.description}
        </Box>
      )}

      {/* File tab bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          backgroundColor: '#232f3e',
          color: '#ff9900',
          padding: '6px 12px',
          borderRadius: '8px 8px 0 0',
          fontFamily: 'monospace',
          fontSize: '0.85em',
          gap: '12px',
        }}
      >
        <span>{canvas.fileName}</span>
      </div>

      {/* Code content - editable */}
      <div
        style={{
          flex: 1,
          backgroundColor: '#1e1e1e',
          borderRadius: '0 0 8px 8px',
          overflow: 'auto',
          position: 'relative',
        }}
      >
        <textarea
          value={canvas.code}
          onChange={(e) => {
            const newCode = e.target.value;
            setCanvas((prev) => prev ? { ...prev, code: newCode } : prev);
            setDeployment((prev) => prev.code ? { ...prev, code: newCode } : prev);
          }}
          spellCheck={false}
          style={{
            width: '100%',
            height: '100%',
            minHeight: 0,
            margin: 0,
            padding: '16px',
            fontFamily: "'Fira Code', 'Cascadia Code', 'JetBrains Mono', 'Consolas', monospace",
            fontSize: '0.85em',
            lineHeight: '1.6',
            color: '#d4d4d4',
            backgroundColor: '#1e1e1e',
            border: 'none',
            outline: 'none',
            resize: 'none',
            whiteSpace: 'pre',
            overflowWrap: 'normal',
            overflowX: 'auto',
          }}
        />
      </div>
    </div>
  ) : (
    <Box textAlign="center" padding={{ vertical: 'xxl' }} color="text-body-secondary">
      <SpaceBetween size="s">
        <Box fontSize="heading-m">No code yet</Box>
        <Box>
          Describe your agent in the chat or select a template to get started.
          Generated code will appear here.
        </Box>
      </SpaceBetween>
    </Box>
  );

  // Markdown components shared between messages and streaming content
  const markdownComponents = {
    code: ({ className, children }: any) => {
      const inline = !className;
      const lang = className?.replace('language-', '') || '';
      if (lang === 'agent-config') {
        return null;
      }
      if (lang === 'python-deploy' || lang === 'python') {
        // Show code inline in chat (visible while streaming), canvas gets populated on completion
        return (
          <pre
            style={{
              backgroundColor: '#1e1e1e',
              padding: '12px',
              borderRadius: '6px',
              overflow: 'auto',
              maxWidth: '100%',
              fontFamily: "'Fira Code', 'Consolas', monospace",
              fontSize: '0.85em',
              color: '#d4d4d4',
            }}
          >
            <code>{children}</code>
          </pre>
        );
      }
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
      <ul style={{ marginLeft: '20px', marginTop: '8px', marginBottom: '8px' }}>
        {children}
      </ul>
    ),
    ol: ({ children }: any) => (
      <ol style={{ marginLeft: '20px', marginTop: '8px', marginBottom: '8px' }}>
        {children}
      </ol>
    ),
    p: ({ children }: any) => (
      <p style={{ marginTop: '8px', marginBottom: '8px' }}>{children}</p>
    ),
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 60px)' }}>
      <div style={{ padding: '0 0 12px 0' }}>
        <Header
          variant="h1"
          description="Create new agents or modify existing ones through conversation with a Bedrock-powered assistant"
        >
          Agent Builder
        </Header>
      </div>

      <div style={{ display: 'flex', flex: 1, gap: '16px', minHeight: 0 }}>
        {/* Left panel — Chat */}
        <div style={{ flex: '0 0 45%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <Container
            fitHeight
            header={
              <Header
                variant="h3"
                description="Powered by Amazon Bedrock"
              >
                <SpaceBetween direction="horizontal" size="xs" alignItems="center">
                  <span>Agent Configuration Assistant</span>
                  {loading && <Badge color="blue">Streaming</Badge>}
                </SpaceBetween>
              </Header>
            }
          >
            <div
              role="region"
              aria-label="Agent Builder Chat"
              style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 220px)' }}
            >
              {chatError && (
                <Alert type="error" dismissible onDismiss={() => setChatError('')}>
                  {chatError}
                </Alert>
              )}

              <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', paddingBottom: '16px' }}>
                <SpaceBetween size="m">
                  {messages.length === 0 && !streamingContent ? (
                    <Box textAlign="center" padding={{ vertical: 'xxl' }} color="text-body-secondary">
                      <SpaceBetween size="s">
                        <Box fontSize="heading-l">What do you want to build?</Box>
                        <Box>
                          Describe your agent or start with a template from the right panel.
                        </Box>
                        <Box fontSize="body-s">
                          Powered by Amazon Bedrock &mdash; your responses come from a real LLM, not
                          canned text.
                        </Box>
                      </SpaceBetween>
                    </Box>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      {messages.map((message, index) => (
                        <div
                          key={index}
                          style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}
                        >
                          {message.type === 'assistant' && (
                            <Avatar
                              ariaLabel="Agent Configuration Assistant"
                              tooltipText="Agent Configuration Assistant"
                              iconName="gen-ai"
                              color="gen-ai"
                            />
                          )}
                          <div style={{ flex: 1 }}>
                            <ChatBubble
                              type={message.type === 'user' ? 'outgoing' : 'incoming'}
                              ariaLabel={`${message.type === 'user' ? 'You' : 'Assistant'} message`}
                              avatar={message.type === 'user' ? <div /> : undefined}
                            >
                              <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                components={markdownComponents}
                              >
                                {message.content}
                              </ReactMarkdown>
                            </ChatBubble>
                          </div>
                        </div>
                      ))}

                      {/* Streaming content - shown while the assistant is generating */}
                      {streamingContent && (
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                          <Avatar
                            ariaLabel="Agent Configuration Assistant"
                            tooltipText="Agent Configuration Assistant"
                            iconName="gen-ai"
                            color="gen-ai"
                            loading={true}
                          />
                          <div style={{ flex: 1 }}>
                            <ChatBubble type="incoming" ariaLabel="Assistant streaming response" avatar={<div />}>
                              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                                {streamingContent}
                              </ReactMarkdown>
                            </ChatBubble>
                          </div>
                        </div>
                      )}

                      {/* Loading indicator before streaming starts */}
                      {loading && !streamingContent && (
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                          <Avatar
                            ariaLabel="Agent Configuration Assistant"
                            tooltipText="Agent Configuration Assistant"
                            iconName="gen-ai"
                            color="gen-ai"
                            loading={true}
                          />
                          <Box color="text-body-secondary">Thinking...</Box>
                        </div>
                      )}
                    </div>
                  )}
                </SpaceBetween>
                <div ref={chatEndRef} />
              </div>

              <PromptInput
                value={prompt}
                onChange={({ detail }) => setPrompt(detail.value)}
                onAction={handleSendMessage}
                placeholder="Describe your agent..."
                actionButtonAriaLabel="Send message"
                actionButtonIconName="send"
                disabled={loading}
              />
            </div>
          </Container>
        </div>

        {/* Right panel — Code Canvas / Templates / Runtime Agents */}
        <div style={{ flex: '1 1 55%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <Container
            fitHeight
            header={
              <Header variant="h3">
                {activeTabId === 'code' ? canvas?.agentName || 'Code' : 'Browse'}
              </Header>
            }
          >
            <div style={{ height: 'calc(100vh - 220px)', display: 'flex', flexDirection: 'column' }}>
              <Tabs
                activeTabId={activeTabId}
                onChange={({ detail }) => setActiveTabId(detail.activeTabId)}
                tabs={[
                  {
                    id: 'templates',
                    label: 'Create New',
                    content: templatesContent,
                  },
                  {
                    id: 'code',
                    label: `Code${canvas ? '' : ''}`,
                    content: codeCanvasContent,
                    disabled: !canvas,
                  },
                  {
                    id: 'runtimes',
                    label: `Runtime Agents${agents.length > 0 ? ` (${agents.length})` : ''}`,
                    content: runtimeAgentsContent,
                  },
                ]}
              />
            </div>
          </Container>
        </div>
      </div>
    </div>
  );
}
