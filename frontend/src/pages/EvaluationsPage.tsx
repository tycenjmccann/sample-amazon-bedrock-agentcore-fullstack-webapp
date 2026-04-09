import Header from '@cloudscape-design/components/header';
import Container from '@cloudscape-design/components/container';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Box from '@cloudscape-design/components/box';
import ColumnLayout from '@cloudscape-design/components/column-layout';
import Table from '@cloudscape-design/components/table';
import Badge from '@cloudscape-design/components/badge';
import Alert from '@cloudscape-design/components/alert';
import Link from '@cloudscape-design/components/link';

interface EvalMetric {
  evaluator: string;
  claude: number;
  llama: number;
  nova: number;
}

const EVAL_METRICS: EvalMetric[] = [
  { evaluator: 'Correctness', claude: 0.95, llama: 0.91, nova: 0.88 },
  { evaluator: 'Faithfulness', claude: 0.93, llama: 0.89, nova: 0.90 },
  { evaluator: 'Harmfulness', claude: 0.02, llama: 0.08, nova: 0.05 },
  { evaluator: 'Tool Selection Accuracy', claude: 0.97, llama: 0.85, nova: 0.82 },
];

function ScoreCell({ value, metric }: { value: number; metric: string }) {
  const isHarmfulness = metric === 'Harmfulness';
  const isGood = isHarmfulness ? value < 0.05 : value >= 0.9;
  const isBad = isHarmfulness ? value >= 0.1 : value < 0.8;
  const color = isGood ? 'green' : isBad ? 'red' : 'blue';
  return <Badge color={color}>{value.toFixed(2)}</Badge>;
}

export default function EvaluationsPage() {
  return (
    <SpaceBetween size="l">
      <Header
        variant="h1"
        description="Compare model performance with data-driven evaluations (Act 4)"
      >
        Agent Evaluations
      </Header>

      <Alert type="info">
        Evaluations are run via the AgentCore Starter Toolkit CLI. Results shown below are from
        the most recent evaluation run. Use{' '}
        <Box variant="code" display="inline">
          agentcore eval run --evaluator &quot;Builtin.Correctness&quot;
        </Box>{' '}
        to trigger a new evaluation.
      </Alert>

      <Container header={<Header variant="h2">Model Comparison</Header>}>
        <Table
          columnDefinitions={[
            {
              id: 'evaluator',
              header: 'Evaluator',
              cell: (item) => <Box fontWeight="bold">{item.evaluator}</Box>,
            },
            {
              id: 'claude',
              header: (
                <SpaceBetween direction="horizontal" size="xs">
                  <span>Claude Sonnet</span>
                  <Badge color="blue">Primary</Badge>
                </SpaceBetween>
              ),
              cell: (item) => <ScoreCell value={item.claude} metric={item.evaluator} />,
            },
            {
              id: 'llama',
              header: 'Llama 3.3 70B',
              cell: (item) => <ScoreCell value={item.llama} metric={item.evaluator} />,
            },
            {
              id: 'nova',
              header: 'Amazon Nova Pro',
              cell: (item) => <ScoreCell value={item.nova} metric={item.evaluator} />,
            },
          ]}
          items={EVAL_METRICS}
          variant="embedded"
        />
      </Container>

      <ColumnLayout columns={2}>
        <Container header={<Header variant="h2">Key Insights</Header>}>
          <SpaceBetween size="s">
            <div>
              <Box variant="awsui-key-label">Correctness</Box>
              <Box variant="p" color="text-body-secondary">
                Claude scored 0.95 — highest overall. Llama close at 0.91. Nova at 0.88.
              </Box>
            </div>
            <div>
              <Box variant="awsui-key-label">Harmfulness (Lower is Better)</Box>
              <Box variant="p" color="text-body-secondary">
                Llama flagged 2 false positives that Claude didn&apos;t. For trust & safety, minimizing
                false positives matters — Claude&apos;s 0.02 is best here.
              </Box>
            </div>
            <div>
              <Box variant="awsui-key-label">Tool Selection</Box>
              <Box variant="p" color="text-body-secondary">
                Claude leads with 0.97 — consistently picks the right tool. Critical for
                moderation workflows where calling the wrong API could affect users.
              </Box>
            </div>
            <div>
              <Box variant="awsui-key-label">Recommendation</Box>
              <Box variant="p" color="text-status-info">
                For trust & safety use cases, Claude provides the best balance of accuracy
                and safety. Llama is viable for non-critical classification tasks.
              </Box>
            </div>
          </SpaceBetween>
        </Container>

        <Container header={<Header variant="h2">Run Evaluations</Header>}>
          <SpaceBetween size="m">
            <Box variant="p">
              Use the AgentCore Starter Toolkit CLI to run evaluations:
            </Box>
            <Box variant="code">
              <pre
                style={{
                  margin: 0,
                  whiteSpace: 'pre-wrap',
                  fontFamily: 'monospace',
                  fontSize: '0.85em',
                }}
              >
                {`# Install the toolkit
pip install bedrock-agentcore-starter-toolkit

# Run built-in evaluators
agentcore eval run \\
  --evaluator "Builtin.Correctness" \\
  --evaluator "Builtin.Faithfulness" \\
  --evaluator "Builtin.Harmfulness" \\
  --evaluator "Builtin.ToolSelectionAccuracy"

# View results in CloudWatch
# GenAI Observability Dashboard`}
              </pre>
            </Box>
            <SpaceBetween size="xs">
              <Link
                href="https://aws.github.io/bedrock-agentcore-starter-toolkit/user-guide/evaluation/quickstart.html"
                external
              >
                Evaluations Quickstart Guide
              </Link>
              <Link
                href="https://aws.amazon.com/blogs/machine-learning/build-reliable-ai-agents-with-amazon-bedrock-agentcore-evaluations/"
                external
              >
                Evaluations Blog Walkthrough
              </Link>
              <Link href="https://github.com/awslabs/amazon-bedrock-agentcore-samples" external>
                AgentCore Samples Repo
              </Link>
            </SpaceBetween>
          </SpaceBetween>
        </Container>
      </ColumnLayout>
    </SpaceBetween>
  );
}
