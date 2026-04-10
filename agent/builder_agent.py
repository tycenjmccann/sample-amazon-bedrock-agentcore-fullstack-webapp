"""
Agent Builder Agent — a Strands agent that designs, generates, and deploys other agents.
Uses AgentCore Memory to remember past conversations and agent designs.
"""

import json
import os
import subprocess
import tempfile

from strands import Agent, tool
from strands.models import BedrockModel
from bedrock_agentcore.runtime import BedrockAgentCoreApp
from bedrock_agentcore.memory.integrations.strands.config import AgentCoreMemoryConfig
from bedrock_agentcore.memory.integrations.strands.session_manager import AgentCoreMemorySessionManager

REGION = os.environ.get("AWS_REGION", os.environ.get("AWS_DEFAULT_REGION", "us-east-1"))
MEMORY_ID = os.environ.get("BUILDER_MEMORY_ID", "agent_builder_memory-LSRj7D98ST")

app = BedrockAgentCoreApp()


@tool
def deploy_agent(agent_name: str, agent_code: str, requirements: str = "", description: str = ""):
    """Deploy a Strands agent to AgentCore Runtime using the agentcore CLI.
    
    Args:
        agent_name: Name for the agent (snake_case, letters/numbers/underscores only, must start with a letter, max 48 chars)
        agent_code: Complete Python source code for the agent (must use BedrockAgentCoreApp pattern)
        requirements: Contents of requirements.txt (one package per line). Always include: strands-agents, strands-agents-tools, bedrock-agentcore, bedrock-agentcore-starter-toolkit, boto3
        description: Short description of what the agent does
    """
    import re
    safe_name = re.sub(r"[^a-zA-Z0-9_]", "_", agent_name.strip())
    safe_name = re.sub(r"_+", "_", safe_name).strip("_")[:48]
    if not safe_name or not safe_name[0].isalpha():
        safe_name = "agent_" + safe_name

    if not requirements.strip():
        requirements = "strands-agents\nstrands-agents-tools\nbedrock-agentcore\nbedrock-agentcore-starter-toolkit\nboto3\n"

    with tempfile.TemporaryDirectory() as tmpdir:
        # Write agent code
        agent_file = os.path.join(tmpdir, "strands_agent.py")
        with open(agent_file, "w") as f:
            f.write(agent_code)

        # Write requirements
        req_file = os.path.join(tmpdir, "requirements.txt")
        with open(req_file, "w") as f:
            f.write(requirements)

        # Configure
        configure_cmd = [
            "agentcore", "configure",
            "-e", agent_file,
            "-n", safe_name,
            "-rf", req_file,
            "--disable-memory",
            "--disable-otel",
            "--region", REGION,
            "--non-interactive",
        ]
        result = subprocess.run(configure_cmd, capture_output=True, text=True, cwd=tmpdir, timeout=30)
        if result.returncode != 0:
            return json.dumps({"status": "error", "step": "configure", "error": result.stderr or result.stdout})

        # Deploy
        deploy_cmd = [
            "agentcore", "deploy",
            "-a", safe_name,
        ]
        result = subprocess.run(deploy_cmd, capture_output=True, text=True, cwd=tmpdir, timeout=300)
        if result.returncode != 0:
            return json.dumps({"status": "error", "step": "deploy", "error": result.stderr or result.stdout})

        # Get the runtime ID from deploy output
        import re as _re
        runtime_id_match = _re.search(r'agent[_\-]?runtime[_\-]?id[:\s]+(\S+)', result.stdout, _re.IGNORECASE)
        runtime_id = runtime_id_match.group(1) if runtime_id_match else safe_name

        endpoint = f"https://bedrock-agentcore.{REGION}.amazonaws.com/runtimes/{{arn}}/invocations?qualifier=DEFAULT"
        invoke_snippet = (
            f"import boto3, json\n"
            f"client = boto3.client('bedrock-agentcore', region_name='{REGION}')\n"
            f"control = boto3.client('bedrock-agentcore-control', region_name='{REGION}')\n"
            f"agent = control.get_agent_runtime(agentRuntimeId='{runtime_id}')\n"
            f"response = client.invoke_agent_runtime(\n"
            f"    agentRuntimeArn=agent['agentRuntimeArn'],\n"
            f"    qualifier='DEFAULT',\n"
            f"    contentType='application/json',\n"
            f"    accept='application/json',\n"
            f"    payload=json.dumps({{'prompt': 'Hello!'}}).encode('utf-8'),\n"
            f")\n"
            f"print(response['response'].read().decode('utf-8'))"
        )

        return json.dumps({
            "status": "deploying",
            "agent_name": safe_name,
            "runtime_id": runtime_id,
            "description": description,
            "endpoint": endpoint,
            "invoke_snippet": invoke_snippet,
            "message": f"Agent '{safe_name}' is being deployed to AgentCore Runtime via the agentcore CLI.",
            "deploy_output": result.stdout[-500:] if result.stdout else "",
        })


@tool
def list_deployed_agents():
    """List all agent runtimes currently deployed in AgentCore."""
    import boto3
    client = boto3.client("bedrock-agentcore-control", region_name=REGION)
    response = client.list_agent_runtimes(maxResults=50)
    agents = []
    for a in response.get("agentRuntimes", []):
        agents.append({
            "name": a.get("agentRuntimeName"),
            "id": a.get("agentRuntimeId"),
            "status": a.get("status"),
        })
    return json.dumps({"agents": agents})


@tool
def check_agent_status(agent_runtime_id: str):
    """Check the current status of a deployed agent runtime.
    
    Args:
        agent_runtime_id: The agent runtime ID to check (e.g. 'my_agent-abc123')
    """
    import boto3
    client = boto3.client("bedrock-agentcore-control", region_name=REGION)
    try:
        agent = client.get_agent_runtime(agentRuntimeId=agent_runtime_id)
        return json.dumps({
            "name": agent.get("agentRuntimeName"),
            "id": agent.get("agentRuntimeId"),
            "status": agent.get("status"),
            "failureReason": agent.get("failureReason", ""),
        })
    except Exception as e:
        return json.dumps({"error": str(e)})


model = BedrockModel(model_id="us.anthropic.claude-sonnet-4-20250514-v1:0")

SYSTEM_PROMPT = """You are an Agent Builder — an AI assistant that helps users design, build, and deploy AI agents to Amazon Bedrock AgentCore.

You have MEMORY of past conversations. If a user references a previous agent or conversation, use your memory to recall the details.

When a user describes an agent they want:
1. Understand their requirements (purpose, tools, model)
2. Generate complete, working Python agent code using the Strands SDK
3. When they confirm, use the deploy_agent tool to deploy it

CODE GENERATION RULES:
- Always use `from strands import Agent, tool` for imports
- Always use `from strands.models import BedrockModel` for the model
- Always use `from bedrock_agentcore.runtime import BedrockAgentCoreApp` for the runtime
- Default model: `us.anthropic.claude-sonnet-4-20250514-v1:0`
- Tools should be decorated with `@tool` and MUST have docstrings with Args sections
- Tool functions should return JSON strings using `json.dumps()`
- The agent entrypoint should use `@app.entrypoint` decorator
- Include `callback_handler=None` in the Agent constructor
- The entrypoint function should be `async` and use `agent.stream_async()`

AGENT NAMING RULES:
- Must match: [a-zA-Z][a-zA-Z0-9_]{0,47}
- Use snake_case (e.g. "trust_safety_agent", "dating_app_moderator")
- Never use dashes, spaces, or special characters

When showing code, use ```python-deploy code blocks so the UI can display it in the code canvas and offer a deploy button.

When the user confirms they want to deploy, include a special marker in your response:
```agent-config
{"agent_name": "<snake_case_name>", "description": "<description>"}
```

Followed by the complete agent code in:
```python-deploy
<complete agent code here>
```

Then call the deploy_agent tool with the same code.

You have these tools:
- deploy_agent: Deploy an agent to AgentCore (takes agent_name, agent_code, requirements, description)
- list_deployed_agents: List all deployed agents
- check_agent_status: Check if a specific agent is READY

Always show the generated code FIRST, then ask if the user wants to deploy. When they confirm, call deploy_agent."""


@app.entrypoint
async def agent_invocation(payload):
    prompt = payload.get("prompt", "")
    session_id = payload.get("session_id", "default")

    # Set up memory
    memory_config = AgentCoreMemoryConfig(
        memory_id=MEMORY_ID,
        session_id=session_id,
        actor_id="builder_user",
    )
    session_manager = AgentCoreMemorySessionManager(memory_config, REGION)

    agent = Agent(
        model=model,
        tools=[deploy_agent, list_deployed_agents, check_agent_status],
        system_prompt=SYSTEM_PROMPT,
        session_manager=session_manager,
        callback_handler=None,
    )

    stream = agent.stream_async(prompt)
    async for event in stream:
        if event.get("event", {}).get("contentBlockDelta", {}).get("delta", {}).get("text"):
            text = event["event"]["contentBlockDelta"]["delta"]["text"]
            yield text


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8082"))
    app.run(port=port)
