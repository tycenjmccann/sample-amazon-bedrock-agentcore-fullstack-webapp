import { useState, useEffect, useRef } from 'react';
import Container from '@cloudscape-design/components/container';
import Header from '@cloudscape-design/components/header';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Box from '@cloudscape-design/components/box';
import StatusIndicator from '@cloudscape-design/components/status-indicator';
import Alert from '@cloudscape-design/components/alert';
import Badge from '@cloudscape-design/components/badge';
import Grid from '@cloudscape-design/components/grid';
import Tabs from '@cloudscape-design/components/tabs';
import Button from '@cloudscape-design/components/button';
import PromptInput from '@cloudscape-design/components/prompt-input';
import TextFilter from '@cloudscape-design/components/text-filter';
import ChatBubble from '@cloudscape-design/chat-components/chat-bubble';
import Avatar from '@cloudscape-design/chat-components/avatar';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { listAgents, AgentRuntimeSummary } from '../api/agents';
import '../markdown.css';

// Agent templates inspired by Claude's Quickstart
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
}

export default function AgentsListPage() {
  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);

  // Right panel state
  const [activeTabId, setActiveTabId] = useState('templates');
  const [agents, setAgents] = useState<AgentRuntimeSummary[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [agentsError, setAgentsError] = useState('');
  const [filterText, setFilterText] = useState('');
  const [selectedAgent, setSelectedAgent] = useState<AgentRuntimeSummary | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
    } else {
      const toolsList = template.tools ? template.tools.join(', ') : 'standard tools';
      setPrompt(
        `Create a new ${template.name} agent. ${template.description} It should include tools: ${toolsList}.`,
      );
    }
  };

  const handleAgentSelect = (agent: AgentRuntimeSummary) => {
    setSelectedAgent(agent);
    setPrompt(
      `I want to modify agent "${agent.agentRuntimeName}" (ID: ${agent.agentRuntimeId}). It's currently in ${agent.status} status. What changes would you like to make?`,
    );
  };

  const handleSendMessage = async () => {
    if (!prompt.trim()) return;

    const userMessage: ChatMessage = {
      type: 'user',
      content: prompt,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setLoading(true);
    const currentPrompt = prompt;
    setPrompt('');

    // Simulate agent configuration assistant response
    await new Promise((resolve) => setTimeout(resolve, 1200));

    let response = '';

    if (currentPrompt.toLowerCase().includes('blank') || currentPrompt.toLowerCase().includes('scratch')) {
      response = `I'll help you create a new agent from scratch. Here's what we need to configure:

**1. Agent Name & Description**
What should we call this agent and what will it do?

**2. Foundation Model**
Which model should power it? Options include:
- \`us.anthropic.claude-sonnet-4-20250514\` (Claude Sonnet — recommended)
- \`us.meta.llama3-3-70b-instruct-v1:0\` (Llama 3.3 70B)
- \`us.amazon.nova-pro-v1:0\` (Amazon Nova Pro)

**3. Tools**
What tools does this agent need? (e.g., web search, database queries, API calls)

**4. System Prompt**
What instructions should guide the agent's behavior?

Let's start with the name and description. What would you like to call your agent?`;
    } else if (currentPrompt.toLowerCase().includes('modify') || currentPrompt.toLowerCase().includes('changes')) {
      const agentName = selectedAgent?.agentRuntimeName || 'the selected agent';
      response = `I can help you modify **${agentName}**. Here are the things we can configure:

| Configuration | Description |
|---|---|
| **Model** | Change the foundation model |
| **Tools** | Add or remove MCP tools |
| **System Prompt** | Update the agent's instructions |
| **Memory** | Enable/disable cross-session memory |
| **Environment Variables** | Set runtime configuration |
| **Network** | Update network configuration |

What would you like to change?`;
    } else if (currentPrompt.toLowerCase().includes('trust') || currentPrompt.toLowerCase().includes('safety')) {
      response = `Great choice! I'll set up a **Trust & Safety Agent** for content moderation. Here's the configuration:

\`\`\`python
from strands import Agent
from strands.models import BedrockModel

model = BedrockModel(
    model_id="us.anthropic.claude-sonnet-4-20250514",
    region_name="us-west-2"
)

agent = Agent(
    model=model,
    system_prompt="""You are a trust and safety content 
    moderation agent...""",
    tools=[user_lookup, content_flag, 
           account_suspension, slack_notification, 
           safety_metrics]
)
\`\`\`

**Tools included:**
- \`user_lookup\` — Look up user profiles and history
- \`content_flag\` — Flag content for review
- \`account_suspension\` — Suspend accounts
- \`slack_notification\` — Send team notifications
- \`safety_metrics\` — View safety dashboards

Ready to deploy? I can generate the deployment command:
\`\`\`bash
agentcore deploy --name trust-safety-agent
\`\`\`

Would you like to customize any of these settings before deploying?`;
    } else if (currentPrompt.toLowerCase().includes('support')) {
      response = `I'll configure a **Support Agent** that handles customer questions. Here's the setup:

\`\`\`python
agent = Agent(
    model=BedrockModel(model_id="us.anthropic.claude-sonnet-4-20250514"),
    system_prompt="You are a helpful customer support agent...",
    tools=[knowledge_search, ticket_create, escalation]
)
\`\`\`

**Tools:**
- \`knowledge_search\` — Search your docs and knowledge base
- \`ticket_create\` — Create support tickets
- \`escalation\` — Escalate to human agents

Want to connect it to your knowledge base first, or deploy with defaults?`;
    } else {
      response = `I understand you want to work on: "${currentPrompt.slice(0, 100)}"

I can help you with:
1. **Create a new agent** — Describe what you need and I'll generate the configuration
2. **Modify an existing agent** — Select one from the "Runtime Agents" tab on the right
3. **Choose a template** — Browse templates in the "Create New" tab for a quick start

What would you like to do?`;
    }

    setMessages((prev) => [
      ...prev,
      { type: 'assistant', content: response, timestamp: new Date() },
    ]);
    setLoading(false);
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

  return (
    <SpaceBetween size="l">
      <Header
        variant="h1"
        description="Create new agents or modify existing ones through conversation"
      >
        Agent Builder
      </Header>

      <Grid gridDefinition={[{ colspan: 7 }, { colspan: 5 }]}>
        {/* Left panel — Chat with Agent Configuration Agent */}
        <Container
          fitHeight
          header={
            <Header
              variant="h3"
              description="Describe your agent or ask to modify an existing one"
            >
              <SpaceBetween direction="horizontal" size="xs" alignItems="center">
                <span>Agent Configuration Assistant</span>
                {loading && <Badge color="blue">Thinking</Badge>}
              </SpaceBetween>
            </Header>
          }
        >
          <div
            role="region"
            aria-label="Agent Builder Chat"
            style={{ display: 'flex', flexDirection: 'column', minHeight: '500px' }}
          >
            <div style={{ flex: 1, overflowY: 'auto', maxHeight: '500px', paddingBottom: '16px' }}>
              <SpaceBetween size="m">
                {messages.length === 0 ? (
                  <Box textAlign="center" padding={{ vertical: 'xxl' }} color="text-body-secondary">
                    <SpaceBetween size="s">
                      <Box fontSize="heading-l">What do you want to build?</Box>
                      <Box>
                        Describe your agent or start with a template from the right panel.
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
                              }}
                            >
                              {message.content}
                            </ReactMarkdown>
                          </ChatBubble>
                        </div>
                      </div>
                    ))}

                    {loading && (
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

        {/* Right panel — Templates / Runtime Agents tabs */}
        <Container
          fitHeight
          header={
            <Header variant="h3">
              Browse
            </Header>
          }
        >
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
                id: 'runtimes',
                label: `Runtime Agents${agents.length > 0 ? ` (${agents.length})` : ''}`,
                content: runtimeAgentsContent,
              },
            ]}
          />
        </Container>
      </Grid>
    </SpaceBetween>
  );
}
