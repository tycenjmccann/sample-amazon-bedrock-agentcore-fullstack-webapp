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


# ---------------------------------------------------------------------------
# MCP Gateway Tools
# ---------------------------------------------------------------------------

@tool
def create_gateway(name: str, description: str = ""):
    """Create a new MCP Gateway on AgentCore. Gateways let agents connect to external tools and APIs with zero code.
    
    Args:
        name: Name for the gateway (e.g. 'customer_data_gateway')
        description: What this gateway is for
    """
    import boto3
    client = boto3.client("bedrock-agentcore-control", region_name=REGION)
    try:
        response = client.create_gateway(
            name=name,
            description=description or f"MCP Gateway: {name}",
            protocolType="MCP",
            authorizerType="NONE",
        )
        response.pop("ResponseMetadata", None)
        for k in ("createdAt", "updatedAt"):
            if k in response and hasattr(response[k], "isoformat"):
                response[k] = response[k].isoformat()
        return json.dumps({
            "status": "success",
            "gateway_id": response.get("gatewayId"),
            "name": name,
            "message": f"Gateway '{name}' created. Use create_gateway_target to add tools to it.",
        })
    except Exception as e:
        return json.dumps({"status": "error", "error": str(e)})


@tool
def create_gateway_target(gateway_id: str, name: str, description: str, target_type: str = "lambda", lambda_arn: str = ""):
    """Add a tool target to an existing MCP Gateway. Each target becomes a tool the agent can call.
    
    Args:
        gateway_id: The gateway ID to add the target to
        name: Name for this tool target (e.g. 'order_lookup', 'send_notification')
        description: What this tool does
        target_type: Type of target - 'lambda' for Lambda functions
        lambda_arn: ARN of the Lambda function (required for lambda targets)
    """
    import boto3
    client = boto3.client("bedrock-agentcore-control", region_name=REGION)
    try:
        params = {
            "gatewayIdentifier": gateway_id,
            "name": name,
            "description": description or f"Tool target: {name}",
        }
        if target_type == "lambda" and lambda_arn:
            params["targetConfiguration"] = {
                "lambdaTarget": {"lambdaArn": lambda_arn}
            }
        response = client.create_gateway_target(**params)
        response.pop("ResponseMetadata", None)
        for k in ("createdAt", "updatedAt"):
            if k in response and hasattr(response[k], "isoformat"):
                response[k] = response[k].isoformat()
        return json.dumps({
            "status": "success",
            "target_id": response.get("targetId"),
            "name": name,
            "message": f"Tool target '{name}' added to gateway {gateway_id}.",
        })
    except Exception as e:
        return json.dumps({"status": "error", "error": str(e)})


@tool
def list_gateways():
    """List all MCP Gateways in the account."""
    import boto3
    client = boto3.client("bedrock-agentcore-control", region_name=REGION)
    try:
        response = client.list_gateways(maxResults=50)
        gateways = []
        for gw in response.get("items", []):
            gateways.append({
                "name": gw.get("name"),
                "id": gw.get("gatewayId"),
                "status": gw.get("status"),
                "protocol": gw.get("protocolType"),
            })
        return json.dumps({"gateways": gateways})
    except Exception as e:
        return json.dumps({"error": str(e)})


@tool
def list_gateway_targets(gateway_id: str):
    """List all tool targets for a specific gateway.
    
    Args:
        gateway_id: The gateway ID to list targets for
    """
    import boto3
    client = boto3.client("bedrock-agentcore-control", region_name=REGION)
    try:
        response = client.list_gateway_targets(gatewayIdentifier=gateway_id, maxResults=50)
        targets = []
        for t in response.get("items", []):
            targets.append({
                "name": t.get("name"),
                "id": t.get("targetId"),
                "status": t.get("status"),
                "description": t.get("description", ""),
            })
        return json.dumps({"targets": targets})
    except Exception as e:
        return json.dumps({"error": str(e)})


# ---------------------------------------------------------------------------
# Memory Tools
# ---------------------------------------------------------------------------

@tool
def create_memory_store(name: str, description: str = ""):
    """Create a new AgentCore Memory store. Memory lets agents remember context across sessions.
    
    Args:
        name: Name for the memory store (e.g. 'customer_prefs_memory')
        description: What this memory store is for
    """
    import boto3
    client = boto3.client("bedrock-agentcore-control", region_name=REGION)
    try:
        response = client.create_memory(
            name=name,
            description=description or f"Memory store: {name}",
        )
        response.pop("ResponseMetadata", None)
        for k in ("createdAt", "updatedAt"):
            if k in response and hasattr(response[k], "isoformat"):
                response[k] = response[k].isoformat()
        mem_id = response.get("id") or response.get("memoryId")
        return json.dumps({
            "status": "creating",
            "memory_id": mem_id,
            "name": name,
            "message": f"Memory store '{name}' is being created (ID: {mem_id}). It takes ~2 minutes to become ACTIVE. Use check_memory_status to monitor.",
        })
    except Exception as e:
        return json.dumps({"status": "error", "error": str(e)})


@tool
def list_memory_stores():
    """List all AgentCore Memory stores in the account."""
    import boto3
    client = boto3.client("bedrock-agentcore-control", region_name=REGION)
    try:
        response = client.list_memories(maxResults=50)
        memories = []
        for m in response.get("memories", []):
            memories.append({
                "name": m.get("name", ""),
                "id": m.get("id"),
                "status": m.get("status"),
            })
        return json.dumps({"memories": memories})
    except Exception as e:
        return json.dumps({"error": str(e)})


@tool
def check_memory_status(memory_id: str):
    """Check the status of a memory store.
    
    Args:
        memory_id: The memory store ID to check
    """
    import boto3
    client = boto3.client("bedrock-agentcore-control", region_name=REGION)
    try:
        response = client.get_memory(memoryId=memory_id)
        response.pop("ResponseMetadata", None)
        return json.dumps({
            "name": response.get("name", ""),
            "id": response.get("id") or response.get("memoryId"),
            "status": response.get("status"),
        })
    except Exception as e:
        return json.dumps({"error": str(e)})


@tool
def attach_memory_to_agent(memory_id: str, agent_runtime_id: str):
    """Attach a memory store to an agent by setting the BEDROCK_AGENTCORE_MEMORY_ID environment variable.
    
    Args:
        memory_id: The memory store ID to attach
        agent_runtime_id: The agent runtime ID to attach it to
    """
    import boto3
    client = boto3.client("bedrock-agentcore-control", region_name=REGION)
    try:
        current = client.get_agent_runtime(agentRuntimeId=agent_runtime_id)
        env = current.get("environmentVariables", {})
        env["BEDROCK_AGENTCORE_MEMORY_ID"] = memory_id
        client.update_agent_runtime(
            agentRuntimeId=agent_runtime_id,
            agentRuntimeArtifact=current["agentRuntimeArtifact"],
            roleArn=current["roleArn"],
            networkConfiguration=current["networkConfiguration"],
            environmentVariables=env,
        )
        return json.dumps({
            "status": "success",
            "message": f"Memory store {memory_id} attached to agent {agent_runtime_id}. The agent will redeploy with memory enabled.",
        })
    except Exception as e:
        return json.dumps({"status": "error", "error": str(e)})


model = BedrockModel(model_id="us.anthropic.claude-sonnet-4-20250514-v1:0")

# ---------------------------------------------------------------------------
# AWS Infrastructure Discovery Tools
# ---------------------------------------------------------------------------

@tool
def list_dynamodb_tables():
    """List all DynamoDB tables in the account. Use this to discover what data sources are available for agents."""
    import boto3
    client = boto3.client("dynamodb", region_name=REGION)
    try:
        tables = client.list_tables().get("TableNames", [])
        result = []
        for t in tables:
            desc = client.describe_table(TableName=t)["Table"]
            keys = [{"name": k["AttributeName"], "type": k["KeyType"]} for k in desc.get("KeySchema", [])]
            result.append({"name": t, "keys": keys, "itemCount": desc.get("ItemCount", 0)})
        return json.dumps({"tables": result})
    except Exception as e:
        return json.dumps({"error": str(e)})


@tool
def describe_dynamodb_table(table_name: str):
    """Get detailed info about a DynamoDB table including its schema, item count, and sample data.
    
    Args:
        table_name: Name of the DynamoDB table to describe
    """
    import boto3
    client = boto3.client("dynamodb", region_name=REGION)
    try:
        desc = client.describe_table(TableName=table_name)["Table"]
        keys = [{"name": k["AttributeName"], "type": k["KeyType"]} for k in desc.get("KeySchema", [])]
        attrs = [{"name": a["AttributeName"], "type": a["AttributeType"]} for a in desc.get("AttributeDefinitions", [])]
        # Get a sample item
        scan = client.scan(TableName=table_name, Limit=2)
        sample = scan.get("Items", [])
        # Simplify DynamoDB format for readability
        def simplify(item):
            out = {}
            for k, v in item.items():
                for typ, val in v.items():
                    out[k] = val
            return out
        sample_simplified = [simplify(i) for i in sample]
        return json.dumps({
            "name": table_name,
            "keys": keys,
            "attributes": attrs,
            "itemCount": desc.get("ItemCount", 0),
            "sampleItems": sample_simplified,
        })
    except Exception as e:
        return json.dumps({"error": str(e)})


@tool
def list_lambda_functions():
    """List all Lambda functions in the account. Useful for finding existing functions to connect as MCP gateway targets."""
    import boto3
    client = boto3.client("lambda", region_name=REGION)
    try:
        funcs = client.list_functions(MaxItems=50).get("Functions", [])
        result = [{"name": f["FunctionName"], "runtime": f.get("Runtime", ""), "description": f.get("Description", "")} for f in funcs]
        return json.dumps({"functions": result})
    except Exception as e:
        return json.dumps({"error": str(e)})


@tool
def list_s3_buckets():
    """List S3 buckets in the account. Useful for finding data sources for agents."""
    import boto3
    client = boto3.client("s3", region_name=REGION)
    try:
        buckets = client.list_buckets().get("Buckets", [])
        result = [{"name": b["Name"]} for b in buckets[:20]]
        return json.dumps({"buckets": result})
    except Exception as e:
        return json.dumps({"error": str(e)})

SYSTEM_PROMPT = """You are the AgentCore Builder — an AI assistant that helps users create, configure, and deploy AI agents, MCP gateways, and memory stores on Amazon Bedrock AgentCore.

You have MEMORY of past conversations. If a user references a previous agent, gateway, or memory store, use your memory to recall the details.

You can:
- Create and deploy agents with custom tools and system prompts
- Set up MCP gateways to connect agents to external APIs and services
- Configure memory stores so agents remember context across sessions
- Wire everything together: attach gateways and memory to agents
- Discover AWS infrastructure (DynamoDB tables, Lambda functions, S3 buckets) to connect agents to real data

When helping users:
1. Ask clarifying questions to understand their use case
2. Generate complete, working Python agent code using the Strands SDK
3. Use your tools to create and configure resources
4. After creating resources, offer to connect them (e.g., attach memory to an agent)

CODE GENERATION RULES:
- Always use `from strands import Agent, tool` for imports
- Always use `from strands.models import BedrockModel` for the model
- Always use `from bedrock_agentcore.runtime import BedrockAgentCoreApp` for the runtime
- Default model: `us.anthropic.claude-sonnet-4-20250514-v1:0`
- Tools should be decorated with `@tool` and MUST have docstrings with Args sections
- Tool functions should return JSON strings using `json.dumps()`
- Include `callback_handler=None` in the Agent constructor

AGENT NAMING RULES:
- Must match: [a-zA-Z][a-zA-Z0-9_]{0,47}
- Use snake_case (e.g. "trust_safety_agent", "dating_app_moderator")
- Never use dashes, spaces, or special characters

When showing code, use ```python-deploy code blocks so the UI can display it in the code canvas and offer a deploy button.

When the user confirms they want to deploy, include a special marker:
```agent-config
{"agent_name": "<snake_case_name>", "description": "<description>"}
```

Then call the deploy_agent tool with the same code.

For complex setups, work step by step: create the agent first, then the gateway, then memory, then wire them together."""


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
        tools=[
            # Agent tools
            deploy_agent, list_deployed_agents, check_agent_status,
            # Gateway tools
            create_gateway, create_gateway_target, list_gateways, list_gateway_targets,
            # Memory tools
            create_memory_store, list_memory_stores, check_memory_status, attach_memory_to_agent,
            # AWS infra discovery
            list_dynamodb_tables, describe_dynamodb_table, list_lambda_functions, list_s3_buckets,
        ],
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
