from strands import Agent, tool
from strands_tools import calculator
import json
from bedrock_agentcore.runtime import BedrockAgentCoreApp
from strands.models import BedrockModel

# Create the AgentCore app
app = BedrockAgentCoreApp()


# Trust & Safety Tools
@tool
def user_lookup(user_id: str):
    """Look up a user profile by user ID. Returns user details including account status, history, and risk score."""
    users = {
        "12345": {
            "user_id": "12345",
            "username": "flagged_user_42",
            "email": "user42@example.com",
            "account_status": "active",
            "join_date": "2024-03-15",
            "content_flags": 3,
            "risk_score": 72,
            "previous_violations": [
                {"type": "harassment", "date": "2025-11-20", "action": "warning"},
                {"type": "spam", "date": "2025-09-05", "action": "content_removed"},
            ],
            "preferences": {"notification_method": "email"},
        },
        "67890": {
            "user_id": "67890",
            "username": "new_reporter",
            "email": "reporter@example.com",
            "account_status": "active",
            "join_date": "2025-01-10",
            "content_flags": 0,
            "risk_score": 5,
            "previous_violations": [],
            "preferences": {"notification_method": "in_app"},
        },
    }
    user = users.get(user_id)
    if user:
        return json.dumps(user, indent=2)
    return f"User {user_id} not found in the system."


@tool
def content_flag(content_id: str, reason: str, severity: str = "medium"):
    """Flag a piece of content for review. Severity can be 'low', 'medium', 'high', or 'critical'.

    Args:
        content_id: The ID of the content to flag.
        reason: The reason for flagging the content.
        severity: The severity level - low, medium, high, or critical.
    """
    return json.dumps(
        {
            "status": "flagged",
            "content_id": content_id,
            "reason": reason,
            "severity": severity,
            "flag_id": f"FLAG-{content_id}-001",
            "timestamp": "2026-04-09T22:00:00Z",
            "message": f"Content {content_id} has been flagged as {severity} severity for: {reason}",
        },
        indent=2,
    )


@tool
def account_suspension(user_id: str, reason: str, duration_days: int = 7):
    """Suspend a user account for a specified duration.

    Args:
        user_id: The ID of the user to suspend.
        reason: The reason for suspension.
        duration_days: Number of days to suspend the account.
    """
    return json.dumps(
        {
            "status": "suspended",
            "user_id": user_id,
            "reason": reason,
            "duration_days": duration_days,
            "suspension_id": f"SUSP-{user_id}-001",
            "timestamp": "2026-04-09T22:00:00Z",
            "message": f"Account {user_id} suspended for {duration_days} days: {reason}",
        },
        indent=2,
    )


@tool
def slack_notification(channel: str, message: str, urgency: str = "normal"):
    """Send a notification to a Slack channel about a moderation action.

    Args:
        channel: The Slack channel to notify (e.g., #trust-safety, #moderation-alerts).
        message: The notification message.
        urgency: The urgency level - normal or high.
    """
    return json.dumps(
        {
            "status": "sent",
            "channel": channel,
            "message": message,
            "urgency": urgency,
            "timestamp": "2026-04-09T22:00:00Z",
            "notification_id": f"SLACK-{hash(message) % 10000:04d}",
        },
        indent=2,
    )


@tool
def safety_metrics(metric_type: str = "overview"):
    """Get trust and safety metrics. Types: 'overview', 'daily', 'weekly'.

    Args:
        metric_type: The type of metrics to retrieve - overview, daily, or weekly.
    """
    metrics = {
        "overview": {
            "total_reports_today": 142,
            "resolved_today": 98,
            "pending_review": 44,
            "false_positive_rate": 0.12,
            "average_resolution_time_minutes": 23,
            "escalation_rate": 0.08,
            "top_categories": [
                {"category": "harassment", "count": 45},
                {"category": "spam", "count": 38},
                {"category": "hate_speech", "count": 22},
                {"category": "misinformation", "count": 19},
                {"category": "inappropriate_content", "count": 18},
            ],
        },
        "daily": {
            "date": "2026-04-09",
            "reports_received": 142,
            "auto_actioned": 67,
            "human_reviewed": 75,
            "accounts_suspended": 12,
            "content_removed": 89,
            "warnings_issued": 31,
        },
        "weekly": {
            "week": "2026-W15",
            "total_reports": 987,
            "resolution_rate": 0.94,
            "average_response_time_minutes": 18,
            "repeat_offender_rate": 0.15,
        },
    }
    return json.dumps(metrics.get(metric_type, metrics["overview"]), indent=2)


model_id = "global.anthropic.claude-haiku-4-5-20251001-v1:0"
model = BedrockModel(
    model_id=model_id,
)

SYSTEM_PROMPT = """You are a Trust & Safety content moderation agent for a large online platform.
Your role is to help moderators investigate reports, review user profiles, flag content,
take enforcement actions, and keep the team informed.

You have access to the following tools:
- user_lookup: Look up user profiles and their violation history
- content_flag: Flag content for review with severity levels
- account_suspension: Suspend user accounts when necessary
- slack_notification: Notify the moderation team via Slack
- safety_metrics: View trust and safety metrics and statistics
- calculator: Perform calculations

When handling moderation requests:
1. Always look up the user profile first to understand their history
2. Consider the severity of the violation and the user's track record
3. Apply proportional enforcement (warning -> content removal -> suspension)
4. Notify the team of significant actions via Slack
5. Be thorough but fair in your assessments

Remember: You are helping human moderators, not replacing them. For edge cases,
recommend escalation to a senior moderator."""

agent = Agent(
    model=model,
    tools=[user_lookup, content_flag, account_suspension, slack_notification, safety_metrics, calculator],
    system_prompt=SYSTEM_PROMPT,
    callback_handler=None,
)


@app.entrypoint
async def agent_invocation(payload):
    """
    Invoke the agent with a payload

    IMPORTANT: Payload structure varies depending on invocation method:
    - Direct invocation (Python SDK, Console, agentcore CLI): {"prompt": "..."}
    - AWS SDK invocation (JS/Java/etc via InvokeAgentRuntimeCommand): {"input": {"prompt": "..."}}

    The AWS SDK automatically wraps payloads in an "input" field as part of the API contract.
    This function handles both formats for maximum compatibility.
    """
    # Handle both dict and string payloads
    if isinstance(payload, str):
        payload = json.loads(payload)

    # Extract the prompt from the payload
    user_input = None
    if isinstance(payload, dict):
        if "input" in payload and isinstance(payload["input"], dict):
            user_input = payload["input"].get("prompt")
        else:
            user_input = payload.get("prompt")

    if not user_input:
        raise ValueError(
            f"No prompt found in payload. Expected {{'prompt': '...'}} or {{'input': {{'prompt': '...'}}}}. Received: {payload}"
        )

    stream = agent.stream_async(user_input)
    async for event in stream:
        if event.get("event", {}).get("contentBlockDelta", {}).get("delta", {}).get("text"):
            text = event.get("event", {}).get("contentBlockDelta", {}).get("delta", {}).get("text")
            print(text)
            yield text


if __name__ == "__main__":
    app.run()
