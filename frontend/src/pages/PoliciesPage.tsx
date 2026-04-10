import { useState } from 'react';
import Header from '@cloudscape-design/components/header';
import Container from '@cloudscape-design/components/container';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Box from '@cloudscape-design/components/box';
import ColumnLayout from '@cloudscape-design/components/column-layout';
import Badge from '@cloudscape-design/components/badge';
import Alert from '@cloudscape-design/components/alert';
import Button from '@cloudscape-design/components/button';

export default function PoliciesPage() {
  const [johnResult, setJohnResult] = useState<any>(null);
  const [janeResult, setJaneResult] = useState<any>(null);

  const callGateway = async (persona: string, toolName: string, args: Record<string, string>) => {
    const setter = persona === 'john' ? setJohnResult : setJaneResult;
    setter(null);
    try {
      const res = await fetch('/management/api/gateway/call-tool', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ persona, tool_name: toolName, arguments: args }),
      });
      setter(await res.json());
    } catch (e: any) {
      setter({ status: 'error', message: e.message });
    }
  };

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

      <Container header={<Header variant="h2">Try It — Live Policy Enforcement</Header>}>
        <SpaceBetween size="m">
          <Box variant="p">
            Test Cedar policy enforcement in real-time. These buttons call the enterprise gateway with different user identities.
            Cedar evaluates the policy and permits or denies the tool call.
          </Box>
          <ColumnLayout columns={2}>
            <Container header={<Header variant="h3">John — Tier 1 Moderator</Header>}>
              <SpaceBetween size="s">
                <Button onClick={() => callGateway('john', 'SlackIntegration___post_message', {channel: '#trust-safety', message: 'Flagged user U-11111'})}>
                  Post to Slack ✅
                </Button>
                <Button onClick={() => callGateway('john', 'JiraIntegration___create_ticket', {summary: 'Suspend user U-11111 for harassment'})}>
                  Create Jira Ticket ❌
                </Button>
                {johnResult && (
                  <Alert type={johnResult.status === 'allowed' ? 'success' : 'error'}>
                    <strong>{johnResult.status === 'allowed' ? 'PERMITTED' : 'DENIED'}</strong>: {johnResult.message || JSON.stringify(johnResult.result?.content?.[0]?.text || johnResult.result)}
                  </Alert>
                )}
              </SpaceBetween>
            </Container>
            <Container header={<Header variant="h3">Jane — Tier 2 Moderator</Header>}>
              <SpaceBetween size="s">
                <Button onClick={() => callGateway('jane', 'SlackIntegration___post_message', {channel: '#trust-safety', message: 'Flagged user U-11111'})}>
                  Post to Slack ✅
                </Button>
                <Button onClick={() => callGateway('jane', 'JiraIntegration___create_ticket', {summary: 'Suspend user U-11111 for harassment'})}>
                  Create Jira Ticket ✅
                </Button>
                {janeResult && (
                  <Alert type={janeResult.status === 'allowed' ? 'success' : 'error'}>
                    <strong>{janeResult.status === 'allowed' ? 'PERMITTED' : 'DENIED'}</strong>: {janeResult.message || JSON.stringify(janeResult.result?.content?.[0]?.text || janeResult.result)}
                  </Alert>
                )}
              </SpaceBetween>
            </Container>
          </ColumnLayout>
        </SpaceBetween>
      </Container>
    </SpaceBetween>
  );
}
