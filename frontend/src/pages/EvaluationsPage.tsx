import { useState, useEffect } from 'react';
import Header from '@cloudscape-design/components/header';
import Container from '@cloudscape-design/components/container';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Box from '@cloudscape-design/components/box';
import Table from '@cloudscape-design/components/table';
import Badge from '@cloudscape-design/components/badge';
import Alert from '@cloudscape-design/components/alert';
import Button from '@cloudscape-design/components/button';
import Select from '@cloudscape-design/components/select';
import FormField from '@cloudscape-design/components/form-field';
import Multiselect from '@cloudscape-design/components/multiselect';
import Textarea from '@cloudscape-design/components/textarea';
import StatusIndicator from '@cloudscape-design/components/status-indicator';
import ColumnLayout from '@cloudscape-design/components/column-layout';
import ProgressBar from '@cloudscape-design/components/progress-bar';
import { listAgents, AgentRuntimeSummary } from '../api/agents';

const API_BASE = '/management';
const REGION = 'us-east-1';

const BUILTIN_EVALUATORS = [
  { value: 'Builtin.Helpfulness', label: 'Helpfulness', description: 'Does the response help the user?' },
  { value: 'Builtin.Correctness', label: 'Correctness', description: 'Is the response factually accurate?' },
  { value: 'Builtin.Coherence', label: 'Coherence', description: 'Is the reasoning internally consistent?' },
  { value: 'Builtin.Conciseness', label: 'Conciseness', description: 'Is the response appropriately brief?' },
  { value: 'Builtin.ResponseRelevance', label: 'Response Relevance', description: 'Does it address what was asked?' },
  { value: 'Builtin.InstructionFollowing', label: 'Instruction Following', description: 'Does it follow system instructions?' },
  { value: 'Builtin.ToolSelectionAccuracy', label: 'Tool Selection', description: 'Did it pick the right tools?' },
  { value: 'Builtin.ToolParameterAccuracy', label: 'Tool Parameters', description: 'Were tool parameters correct?' },
  { value: 'Builtin.Harmfulness', label: 'Harmfulness', description: 'Does the response contain harmful content?' },
  { value: 'Builtin.Faithfulness', label: 'Faithfulness', description: 'Is it consistent with conversation history?' },
];

interface EvalResult {
  evaluator: string;
  score: number | null;
  reason?: string;
  error?: string;
}

interface EvalRun {
  agent: string;
  prompt: string;
  response_preview: string;
  results: EvalResult[];
  timestamp: Date;
}

export default function EvaluationsPage() {
  const [agents, setAgents] = useState<AgentRuntimeSummary[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<any>(null);
  const [selectedEvaluators, setSelectedEvaluators] = useState<any[]>([
    { value: 'Builtin.Helpfulness', label: 'Helpfulness' },
    { value: 'Builtin.Correctness', label: 'Correctness' },
    { value: 'Builtin.ToolSelectionAccuracy', label: 'Tool Selection' },
  ]);
  const [testPrompt, setTestPrompt] = useState('Hello! What can you help me with?');
  const [running, setRunning] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [suggestedPrompts, setSuggestedPrompts] = useState<{prompt: string; description: string; evaluators?: string[]; reasoning?: string}[]>([]);
  const [error, setError] = useState('');
  const [evalRuns, setEvalRuns] = useState<EvalRun[]>([]);

  useEffect(() => {
    listAgents().then((data) => {
      setAgents(data);
      if (data.length > 0) {
        setSelectedAgent({ value: data[0].agentRuntimeId, label: data[0].agentRuntimeName });
      }
    }).catch(() => {});
  }, []);

  const handleGenerateTests = async () => {
    if (!selectedAgent) return;
    setGenerating(true);
    setSuggestedPrompts([]);
    try {
      const res = await fetch(`${API_BASE}/api/evaluate/generate-test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_runtime_id: selectedAgent.value }),
      });
      if (!res.ok) throw new Error('Failed to generate tests');
      const data = await res.json();
      setSuggestedPrompts(data.prompts || []);
      if (data.prompts?.length > 0) {
        setTestPrompt(data.prompts[0].prompt);
        // Auto-select evaluators from first suggestion
        const evals = data.prompts[0].evaluators || [];
        const matched = BUILTIN_EVALUATORS.filter((e) => evals.includes(e.value));
        if (matched.length > 0) setSelectedEvaluators(matched);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleRunEval = async () => {
    if (!selectedAgent || !testPrompt.trim() || selectedEvaluators.length === 0) return;
    setRunning(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/api/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_runtime_id: selectedAgent.value,
          test_prompt: testPrompt,
          evaluator_ids: selectedEvaluators.map((e) => e.value),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setEvalRuns((prev) => [{ ...data, timestamp: new Date() }, ...prev]);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  };

  const scoreColor = (score: number | null): string => {
    if (score === null) return 'grey';
    if (score >= 0.8) return 'green';
    if (score >= 0.5) return 'blue';
    return 'red';
  };

  const scoreLabel = (score: number | null): string => {
    if (score === null) return 'N/A';
    return `${Math.round(score * 100)}%`;
  };

  return (
    <SpaceBetween size="l">
      <Header
        variant="h1"
        description="Evaluate your AgentCore agents with built-in quality metrics"
      >
        Agent Evaluations
      </Header>

      {error && (
        <Alert type="error" dismissible onDismiss={() => setError('')}>
          {error}
        </Alert>
      )}

      <Container
        header={
          <Header
            variant="h2"
            actions={
              <Button
                variant="primary"
                onClick={handleRunEval}
                loading={running}
                disabled={!selectedAgent || !testPrompt.trim() || selectedEvaluators.length === 0}
              >
                Run Evaluation
              </Button>
            }
          >
            On-Demand Evaluation
          </Header>
        }
      >
        <ColumnLayout columns={3}>
          <FormField label="Agent">
            <Select
              selectedOption={selectedAgent}
              onChange={({ detail }) => setSelectedAgent(detail.selectedOption)}
              options={agents.filter((a) => a.status === 'READY').map((a) => ({
                value: a.agentRuntimeId,
                label: a.agentRuntimeName,
              }))}
              placeholder="Select an agent"
            />
          </FormField>
          <FormField label="Evaluators">
            <Multiselect
              selectedOptions={selectedEvaluators}
              onChange={({ detail }) => setSelectedEvaluators([...detail.selectedOptions])}
              options={BUILTIN_EVALUATORS}
              placeholder="Select evaluators"
            />
          </FormField>
          <FormField label="Test Prompt">
            <SpaceBetween size="xs">
              <Textarea
                value={testPrompt}
                onChange={({ detail }) => setTestPrompt(detail.value)}
                rows={2}
                placeholder="Enter a test prompt or generate with AI..."
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Button
                  iconName="gen-ai"
                  onClick={handleGenerateTests}
                  loading={generating}
                  disabled={!selectedAgent}
                >
                  Generate Tests
                </Button>
              </div>
            </SpaceBetween>
          </FormField>
        </ColumnLayout>

        {suggestedPrompts.length > 0 && (
          <div style={{ marginTop: '12px' }}>
            <Box variant="awsui-key-label" margin={{ bottom: 'xs' }}>AI-Generated Test Plan</Box>
            <SpaceBetween size="s">
              {suggestedPrompts.map((sp, i) => {
                const isActive = testPrompt === sp.prompt;
                return (
                  <div
                    key={i}
                    onClick={() => {
                      setTestPrompt(sp.prompt);
                      const evals = sp.evaluators || [];
                      const matched = BUILTIN_EVALUATORS.filter((e) => evals.includes(e.value));
                      if (matched.length > 0) setSelectedEvaluators(matched);
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter') setTestPrompt(sp.prompt); }}
                    style={{
                      padding: '12px 16px',
                      borderRadius: '8px',
                      border: isActive ? '2px solid #0972d3' : '1px solid #e9ebed',
                      backgroundColor: isActive ? '#f2f8fd' : '#fff',
                      cursor: 'pointer',
                    }}
                  >
                    <SpaceBetween size="xxs">
                      <Box fontWeight="bold" fontSize="body-s">Test {i + 1}: {sp.description}</Box>
                      <Box fontSize="body-s" color="text-body-secondary">
                        <em>"{sp.prompt.length > 100 ? sp.prompt.slice(0, 100) + '...' : sp.prompt}"</em>
                      </Box>
                      {sp.evaluators && sp.evaluators.length > 0 && (
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                          {sp.evaluators.map((ev) => (
                            <Badge key={ev} color="blue">{ev.replace('Builtin.', '')}</Badge>
                          ))}
                        </div>
                      )}
                      {sp.reasoning && (
                        <Box fontSize="body-s" color="text-body-secondary">{sp.reasoning}</Box>
                      )}
                    </SpaceBetween>
                  </div>
                );
              })}
            </SpaceBetween>
          </div>
        )}
      </Container>

      {running && (
        <Container>
          <SpaceBetween size="s">
            <StatusIndicator type="in-progress">
              Invoking agent and running evaluations...
            </StatusIndicator>
            <ProgressBar status="in-progress" label="Evaluation in progress" />
          </SpaceBetween>
        </Container>
      )}

      {evalRuns.map((run, runIdx) => (
        <Container
          key={runIdx}
          header={
            <Header variant="h2" description={`${run.timestamp.toLocaleString()}`}>
              Evaluation: {run.agent}
            </Header>
          }
        >
          <SpaceBetween size="m">
            <ColumnLayout columns={2}>
              <div>
                <Box variant="awsui-key-label">Test Prompt</Box>
                <Box>{run.prompt}</Box>
              </div>
              <div>
                <Box variant="awsui-key-label">Agent Response (preview)</Box>
                <Box variant="code" fontSize="body-s">
                  {run.response_preview?.slice(0, 200)}
                  {(run.response_preview?.length || 0) > 200 ? '...' : ''}
                </Box>
              </div>
            </ColumnLayout>

            <Table
              columnDefinitions={[
                {
                  id: 'evaluator',
                  header: 'Evaluator',
                  cell: (item) => (
                    <Box fontWeight="bold">{item.evaluator.replace('Builtin.', '')}</Box>
                  ),
                },
                {
                  id: 'score',
                  header: 'Score',
                  cell: (item) => (
                    <Badge color={scoreColor(item.score)}>
                      {scoreLabel(item.score)}
                    </Badge>
                  ),
                },
                {
                  id: 'reason',
                  header: 'Reasoning',
                  cell: (item) => (
                    <Box fontSize="body-s" color="text-body-secondary">
                      {item.error || item.reason || '-'}
                    </Box>
                  ),
                },
              ]}
              items={run.results}
              variant="embedded"
            />
          </SpaceBetween>
        </Container>
      ))}

      {evalRuns.length === 0 && !running && (
        <Container>
          <Box textAlign="center" padding="xxl" color="text-body-secondary">
            <SpaceBetween size="s">
              <Box fontSize="heading-l">📊</Box>
              <Box variant="h3">No evaluations yet</Box>
              <Box>Select an agent, choose evaluators, and enter a test prompt to run your first evaluation.</Box>
              <Box variant="small">
                For full evaluation with OTEL traces, use the{' '}
                <a href={`https://${REGION}.console.aws.amazon.com/bedrock-agentcore/home?region=${REGION}#/evaluations`} target="_blank" rel="noopener noreferrer" style={{ color: '#0972d3' }}>
                  AgentCore Evaluations Console
                </a>
              </Box>
            </SpaceBetween>
          </Box>
        </Container>
      )}
    </SpaceBetween>
  );
}
