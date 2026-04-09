import Header from '@cloudscape-design/components/header';
import Container from '@cloudscape-design/components/container';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Box from '@cloudscape-design/components/box';
import ColumnLayout from '@cloudscape-design/components/column-layout';
import Badge from '@cloudscape-design/components/badge';
import Alert from '@cloudscape-design/components/alert';

export default function PoliciesPage() {
  return (
    <SpaceBetween size="l">
      <Header
        variant="h1"
        description="Cedar-based policies controlling per-user agent behavior (Act 6)"
      >
        Policy Governance
      </Header>

      <Alert type="info" header="How Policy Governance Works">
        IAM gets the agent into the room. Cedar controls what each person does inside it.
        Same agent, same IAM role, same tools — but Cedar enforces role-based behavior at
        the tool level.
      </Alert>

      <ColumnLayout columns={2}>
        <Container
          header={
            <Header variant="h2" info={<Badge color="green">permit</Badge>}>
              Jane — Tier 2 Moderator
            </Header>
          }
        >
          <SpaceBetween size="m">
            <Box variant="code">
              <pre
                style={{
                  margin: 0,
                  whiteSpace: 'pre-wrap',
                  fontFamily: 'monospace',
                  fontSize: '0.9em',
                  lineHeight: 1.5,
                }}
              >
                {`permit(
  principal == User::"jane",
  action == Action::"SuspendAccount",
  resource
);`}
              </pre>
            </Box>
            <Box variant="p">
              Jane asks: &quot;Suspend user 12345 for harassment&quot;
            </Box>
            <Alert type="success">
              Agent suspends the account successfully and notifies the team via Slack.
            </Alert>
          </SpaceBetween>
        </Container>

        <Container
          header={
            <Header variant="h2" info={<Badge color="red">forbid</Badge>}>
              John — Tier 1 Moderator
            </Header>
          }
        >
          <SpaceBetween size="m">
            <Box variant="code">
              <pre
                style={{
                  margin: 0,
                  whiteSpace: 'pre-wrap',
                  fontFamily: 'monospace',
                  fontSize: '0.9em',
                  lineHeight: 1.5,
                }}
              >
                {`forbid(
  principal == User::"john",
  action == Action::"SuspendAccount",
  resource
);`}
              </pre>
            </Box>
            <Box variant="p">
              John asks: &quot;Suspend user 12345 for harassment&quot;
            </Box>
            <Alert type="error">
              Agent responds: &quot;I don&apos;t have permission to suspend accounts. I&apos;ve flagged
              this for a Tier 2 moderator and notified the team via Slack.&quot;
            </Alert>
          </SpaceBetween>
        </Container>
      </ColumnLayout>

      <Container header={<Header variant="h2">Authorization Flow</Header>}>
        <ColumnLayout columns={4} variant="text-grid">
          <div>
            <Box variant="awsui-key-label">1. User Request</Box>
            <Box variant="p" color="text-body-secondary">
              User sends a moderation request through the chat interface, identified as
              either John or Jane.
            </Box>
          </div>
          <div>
            <Box variant="awsui-key-label">2. Agent Processes</Box>
            <Box variant="p" color="text-body-secondary">
              Agent determines which tool to call (e.g., account_suspension) and
              checks Cedar policies before execution.
            </Box>
          </div>
          <div>
            <Box variant="awsui-key-label">3. Cedar Evaluates</Box>
            <Box variant="p" color="text-body-secondary">
              Cedar policy engine evaluates the principal + action + resource
              combination and returns permit or forbid.
            </Box>
          </div>
          <div>
            <Box variant="awsui-key-label">4. Decision Logged</Box>
            <Box variant="p" color="text-body-secondary">
              Both permit and forbid decisions are logged to CloudWatch for
              complete audit trail.
            </Box>
          </div>
        </ColumnLayout>
      </Container>

      <Container header={<Header variant="h2">Try It</Header>}>
        <SpaceBetween size="s">
          <Box variant="p">
            Use the <strong>Chat</strong> page with the persona toggle to test policy governance:
          </Box>
          <Box variant="p">
            1. Toggle to <strong>John</strong> (Tier 1) and ask to suspend a user — the agent will refuse
          </Box>
          <Box variant="p">
            2. Toggle to <strong>Jane</strong> (Tier 2) and ask the same — the agent will execute the suspension
          </Box>
          <Box variant="p">
            3. Check CloudWatch for both authorization decisions logged side-by-side
          </Box>
        </SpaceBetween>
      </Container>
    </SpaceBetween>
  );
}
