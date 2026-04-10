"""
AgentCore Operations Dashboard — Backend API

Lightweight FastAPI backend that proxies AWS AgentCore management APIs.
The frontend calls these endpoints; this backend calls AWS with IAM credentials.
"""

import json
import logging
import os
import re
from typing import List, Optional

import boto3
from botocore.exceptions import ClientError
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

logger = logging.getLogger(__name__)

app = FastAPI(title="AgentCore Operations API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

REGION = os.environ.get("AWS_REGION", os.environ.get("AWS_DEFAULT_REGION", "us-east-1"))


def get_control_client():
    return boto3.client("bedrock-agentcore-control", region_name=REGION)


def get_memory_client():
    return boto3.client("bedrock-agentcore", region_name=REGION)


# ---------------------------------------------------------------------------
# Agent Runtimes
# ---------------------------------------------------------------------------

@app.get("/api/agents")
def list_agents(max_results: int = Query(default=50, le=100)):
    """List all AgentCore runtimes in the account."""
    try:
        client = get_control_client()
        response = client.list_agent_runtimes(maxResults=max_results)
        runtimes = response.get("agentRuntimes", [])
        # Convert datetime objects to ISO strings for JSON serialization
        for rt in runtimes:
            if "lastUpdatedAt" in rt:
                rt["lastUpdatedAt"] = rt["lastUpdatedAt"].isoformat()
        return {"agentRuntimes": runtimes}
    except ClientError as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/agents/{agent_runtime_id}")
def get_agent(agent_runtime_id: str):
    """Get full details for a specific agent runtime."""
    try:
        client = get_control_client()
        response = client.get_agent_runtime(agentRuntimeId=agent_runtime_id)
        # Remove ResponseMetadata
        response.pop("ResponseMetadata", None)
        # Convert datetimes
        for key in ("createdAt", "lastUpdatedAt"):
            if key in response and hasattr(response[key], "isoformat"):
                response[key] = response[key].isoformat()
        return response
    except ClientError as e:
        if e.response["Error"]["Code"] == "ResourceNotFoundException":
            raise HTTPException(status_code=404, detail="Agent runtime not found")
        raise HTTPException(status_code=500, detail=str(e))


class UpdateAgentEnvVars(BaseModel):
    environmentVariables: dict


@app.put("/api/agents/{agent_runtime_id}/env")
def update_agent_env(agent_runtime_id: str, body: UpdateAgentEnvVars):
    """Update environment variables for an agent runtime (e.g., swap model_id)."""
    try:
        client = get_control_client()
        # First get current runtime to preserve required fields
        current = client.get_agent_runtime(agentRuntimeId=agent_runtime_id)
        current.pop("ResponseMetadata", None)

        response = client.update_agent_runtime(
            agentRuntimeId=agent_runtime_id,
            agentRuntimeArtifact=current["agentRuntimeArtifact"],
            roleArn=current["roleArn"],
            networkConfiguration=current["networkConfiguration"],
            environmentVariables=body.environmentVariables,
        )
        response.pop("ResponseMetadata", None)
        for key in ("createdAt", "lastUpdatedAt"):
            if key in response and hasattr(response[key], "isoformat"):
                response[key] = response[key].isoformat()
        return response
    except ClientError as e:
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# Gateways
# ---------------------------------------------------------------------------

@app.get("/api/gateways")
def list_gateways(max_results: int = Query(default=50, le=1000)):
    """List all gateways."""
    try:
        client = get_control_client()
        response = client.list_gateways(maxResults=max_results)
        items = response.get("items", [])
        for item in items:
            for key in ("createdAt", "updatedAt"):
                if key in item and hasattr(item[key], "isoformat"):
                    item[key] = item[key].isoformat()
        return {"gateways": items}
    except ClientError as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/gateways/{gateway_id}")
def get_gateway(gateway_id: str):
    """Get details of a specific gateway."""
    try:
        client = get_control_client()
        response = client.get_gateway(gatewayIdentifier=gateway_id)
        response.pop("ResponseMetadata", None)
        for key in ("createdAt", "updatedAt"):
            if key in response and hasattr(response[key], "isoformat"):
                response[key] = response[key].isoformat()
        return response
    except ClientError as e:
        if e.response["Error"]["Code"] == "ResourceNotFoundException":
            raise HTTPException(status_code=404, detail="Gateway not found")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/gateways/{gateway_id}/targets")
def list_gateway_targets(gateway_id: str, max_results: int = Query(default=50, le=1000)):
    """List tool targets for a gateway."""
    try:
        client = get_control_client()
        response = client.list_gateway_targets(
            gatewayIdentifier=gateway_id, maxResults=max_results
        )
        items = response.get("items", [])
        for item in items:
            for key in ("createdAt", "updatedAt"):
                if key in item and hasattr(item[key], "isoformat"):
                    item[key] = item[key].isoformat()
        return {"targets": items}
    except ClientError as e:
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# Memory
# ---------------------------------------------------------------------------

@app.get("/api/memory")
def list_memories(max_results: int = Query(default=50, le=100)):
    """List all memory stores."""
    try:
        client = get_control_client()
        response = client.list_memories(maxResults=max_results)
        items = response.get("memories", [])
        for item in items:
            for key in ("createdAt", "updatedAt"):
                if key in item and hasattr(item[key], "isoformat"):
                    item[key] = item[key].isoformat()
        return {"memories": items}
    except ClientError as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/memory/{memory_id}")
def get_memory(memory_id: str):
    """Get details of a specific memory store."""
    try:
        client = get_control_client()
        response = client.get_memory(memoryId=memory_id)
        response.pop("ResponseMetadata", None)
        for key in ("createdAt", "updatedAt"):
            if key in response and hasattr(response[key], "isoformat"):
                response[key] = response[key].isoformat()
        return response
    except ClientError as e:
        if e.response["Error"]["Code"] == "ResourceNotFoundException":
            raise HTTPException(status_code=404, detail="Memory store not found")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/memory/{memory_id}/records")
def list_memory_records(memory_id: str, namespace: Optional[str] = None):
    """Retrieve memory records from a memory store."""
    try:
        client = get_memory_client()
        params = {"memoryId": memory_id}
        if namespace:
            params["namespace"] = namespace
        response = client.list_memory_records(**params)
        response.pop("ResponseMetadata", None)
        return response
    except ClientError as e:
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# Policies
# ---------------------------------------------------------------------------

@app.get("/api/policies/{policy_engine_id}")
def list_policies(policy_engine_id: str, max_results: int = Query(default=50, le=100)):
    """List policies for a policy engine."""
    try:
        client = get_control_client()
        response = client.list_policies(
            policyEngineId=policy_engine_id, maxResults=max_results
        )
        items = response.get("policies", [])
        for item in items:
            for key in ("createdAt", "updatedAt"):
                if key in item and hasattr(item[key], "isoformat"):
                    item[key] = item[key].isoformat()
        return {"policies": items}
    except ClientError as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/policies/{policy_engine_id}/{policy_id}")
def get_policy(policy_engine_id: str, policy_id: str):
    """Get a specific policy."""
    try:
        client = get_control_client()
        response = client.get_policy(
            policyEngineId=policy_engine_id, policyId=policy_id
        )
        response.pop("ResponseMetadata", None)
        for key in ("createdAt", "updatedAt"):
            if key in response and hasattr(response[key], "isoformat"):
                response[key] = response[key].isoformat()
        return response
    except ClientError as e:
        if e.response["Error"]["Code"] == "ResourceNotFoundException":
            raise HTTPException(status_code=404, detail="Policy not found")
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# Agent Runtime Invocation
# ---------------------------------------------------------------------------

class InvokeAgentRequest(BaseModel):
    prompt: str


def get_runtime_client():
    return boto3.client("bedrock-agentcore", region_name=REGION)


@app.post("/api/agents/{agent_runtime_id}/invoke")
async def invoke_agent(agent_runtime_id: str, body: InvokeAgentRequest):
    """Invoke a deployed AgentCore agent runtime and stream the response."""
    from fastapi.responses import StreamingResponse

    try:
        # Look up the agent to get its ARN
        control = get_control_client()
        agent = control.get_agent_runtime(agentRuntimeId=agent_runtime_id)
        arn = agent["agentRuntimeArn"]

        runtime = get_runtime_client()
        response = runtime.invoke_agent_runtime(
            agentRuntimeArn=arn,
            qualifier="DEFAULT",
            contentType="application/json",
            accept="application/json",
            payload=json.dumps({"prompt": body.prompt}).encode("utf-8"),
        )

        def generate():
            stream = response.get("response")
            if stream is None:
                yield "data: No response\n\n"
                return

            # Stream line-by-line using raw urllib3 stream for true real-time delivery
            if hasattr(stream, "_raw_stream"):
                for line in stream._raw_stream:
                    text = line.decode("utf-8") if isinstance(line, bytes) else str(line)
                    text = text.strip()
                    if not text:
                        continue
                    if text.startswith("data: "):
                        # Forward SSE events directly
                        yield text + "\n\n"
                return

            # Fallback: read all at once (non-streaming agents)
            if hasattr(stream, "read"):
                data = stream.read()
                raw = data.decode("utf-8") if isinstance(data, bytes) else str(data)
            else:
                raw = str(stream)

            # Handle SSE format
            if raw.startswith("data: "):
                for line in raw.split("\n"):
                    line = line.strip()
                    if line.startswith("data: "):
                        payload = line[6:]
                        try:
                            text = json.loads(payload)
                            if isinstance(text, str):
                                yield f"data: {json.dumps(text)}\n\n"
                                continue
                        except (json.JSONDecodeError, TypeError):
                            pass
                        yield f"data: {json.dumps(payload)}\n\n"
                return

            # Handle single JSON blob responses (non-streaming agents)
            # Format: {"response": "{'role': 'assistant', 'content': [{'text': '...'}]}"}
            text = raw
            try:
                outer = json.loads(raw)
                if isinstance(outer, dict) and "response" in outer:
                    inner = outer["response"]
                    import ast
                    try:
                        parsed = ast.literal_eval(inner)
                        if isinstance(parsed, dict) and "content" in parsed:
                            for block in parsed["content"]:
                                if isinstance(block, dict) and "text" in block:
                                    text = block["text"]
                                    break
                    except (ValueError, SyntaxError):
                        text = inner
            except (json.JSONDecodeError, TypeError):
                pass

            yield f"data: {json.dumps(text)}\n\n"

        return StreamingResponse(generate(), media_type="text/event-stream")

    except ClientError as e:
        code = e.response["Error"]["Code"]
        if code == "ResourceNotFoundException":
            raise HTTPException(status_code=404, detail="Agent runtime not found")
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# Evaluations
# ---------------------------------------------------------------------------

@app.get("/api/evaluators")
def list_evaluators_endpoint():
    """List all available evaluators."""
    try:
        client = get_control_client()
        response = client.list_evaluators(maxResults=50)
        evals = response.get("evaluators", [])
        return {"evaluators": evals}
    except ClientError as e:
        raise HTTPException(status_code=500, detail=str(e))


class GenerateTestRequest(BaseModel):
    agent_runtime_id: str


@app.post("/api/evaluate/generate-test")
def generate_test_prompt(body: GenerateTestRequest):
    """Generate targeted test prompts based on the agent's actual tools and configuration."""
    try:
        control = get_control_client()
        agent = control.get_agent_runtime(agentRuntimeId=body.agent_runtime_id)
        agent.pop("ResponseMetadata", None)
        for k in ("createdAt", "lastUpdatedAt"):
            if k in agent and hasattr(agent[k], "isoformat"):
                agent[k] = agent[k].isoformat()

        # Try to get the agent's code to extract tools and system prompt
        agent_code_info = ""
        artifact = agent.get("agentRuntimeArtifact", {})
        code_config = artifact.get("codeConfiguration", {})
        s3_info = code_config.get("code", {}).get("s3", {})
        if s3_info.get("bucket") and s3_info.get("prefix"):
            try:
                s3 = boto3.client("s3", region_name=REGION)
                import zipfile, io
                obj = s3.get_object(Bucket=s3_info["bucket"], Key=s3_info["prefix"])
                zip_bytes = obj["Body"].read()
                with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
                    # Look for the agent entrypoint first
                    for name in ["strands_agent.py", "agent.py", "app.py"]:
                        if name in zf.namelist():
                            code = zf.read(name).decode("utf-8")
                            agent_code_info = code[:4000]
                            break
            except Exception:
                pass

        agent_context = json.dumps({
            "name": agent.get("agentRuntimeName"),
            "description": agent.get("description", ""),
            "environmentVariables": agent.get("environmentVariables", {}),
        }, indent=2)

        bedrock = boto3.client("bedrock-runtime", region_name=REGION)
        response = bedrock.converse(
            modelId=AGENT_BUILDER_MODEL_ID,
            messages=[{
                "role": "user",
                "content": [{"text": f"""You are creating evaluation test prompts for an AI agent. Here is the agent's configuration and source code:

AGENT CONFIG:
{agent_context}

AGENT SOURCE CODE (tools, system prompt, etc.):
{agent_code_info if agent_code_info else "Not available - generate tests based on the agent name and description."}

EVALUATOR LEVELS:
- TRACE level: Helpfulness, Correctness, Coherence, Conciseness, ResponseRelevance, InstructionFollowing, Harmfulness, Faithfulness — judge reads one request→response
- TOOL_CALL level: ToolSelectionAccuracy, ToolParameterAccuracy — judge checks if the right tool was called with correct parameters
- SESSION level: GoalSuccessRate — judge reads entire conversation to see if the user's goal was met

INSTRUCTIONS:
Generate exactly 3 test prompts. Each test should focus on a DIFFERENT aspect:

Test 1: TOOL USAGE — A prompt that requires the agent to select and use the correct tool(s) with proper parameters. Use real table names, field names, and sample IDs from the code.
Test 2: REASONING & ACCURACY — A prompt that requires the agent to retrieve data AND reason about it (assess risk, make a recommendation, identify patterns).
Test 3: MULTI-STEP WORKFLOW — A prompt that requires multiple tool calls in sequence to complete a complex task end-to-end.

For each test, write the "reasoning" as an OUTCOME-FOCUSED explanation:
- What capability this test measures in plain language
- How each selected evaluator contributes to measuring that capability
- Example: "Measures how well the agent can investigate a reported user by retrieving their profile and reports, then synthesizing findings into an actionable recommendation. ToolSelectionAccuracy checks it picks the right lookup tools, Correctness validates the data in its response matches what the tools returned, InstructionFollowing verifies it follows the progressive enforcement policy."

Return ONLY a JSON array:
[{{"prompt": "...", "description": "Brief title", "evaluators": ["Builtin.X", "Builtin.Y"], "reasoning": "Outcome-focused explanation..."}}]"""}],
            }],
            inferenceConfig={"maxTokens": 1200},
        )
        text = response["output"]["message"]["content"][0]["text"]
        import re
        match = re.search(r'\[[\s\S]*\]', text)
        if match:
            prompts = json.loads(match.group())
            return {"prompts": prompts}
        return {"prompts": [{"prompt": "Hello! What can you help me with?", "description": "Basic capability check"}]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class RunEvalRequest(BaseModel):
    agent_runtime_id: str
    test_prompt: str
    evaluator_ids: list


@app.post("/api/evaluate")
def run_evaluation_endpoint(body: RunEvalRequest):
    """Run on-demand evaluation on a deployed agent using real OTEL traces."""
    import uuid
    import time

    try:
        control = get_control_client()
        runtime = get_runtime_client()

        # Get agent ARN
        agent = control.get_agent_runtime(agentRuntimeId=body.agent_runtime_id)
        arn = agent["agentRuntimeArn"]
        session_id = f"eval_{uuid.uuid4().hex}{uuid.uuid4().hex[:8]}"

        # Invoke the agent (generates real OTEL traces)
        response = runtime.invoke_agent_runtime(
            agentRuntimeArn=arn, qualifier="DEFAULT",
            contentType="application/json", accept="application/json",
            runtimeSessionId=session_id,
            payload=json.dumps({"prompt": body.test_prompt}).encode("utf-8"),
        )
        resp_body = response.get("response")
        agent_response = ""
        if resp_body and hasattr(resp_body, "read"):
            data = resp_body.read()
            agent_response = data.decode("utf-8") if isinstance(data, bytes) else str(data)

        # Wait for OTEL spans to propagate
        time.sleep(20)

        # Use the starter toolkit's EvaluationProcessor (same as CLI)
        from bedrock_agentcore_starter_toolkit.operations.evaluation.data_plane_client import EvaluationDataPlaneClient
        from bedrock_agentcore_starter_toolkit.operations.evaluation.on_demand_processor import EvaluationProcessor

        eval_dp = EvaluationDataPlaneClient(region_name=REGION)
        processor = EvaluationProcessor(data_plane_client=eval_dp)

        eval_results = processor.evaluate_session(
            session_id=session_id,
            evaluators=body.evaluator_ids[:5],
            agent_id=body.agent_runtime_id,
            region=REGION,
        )

        results = []
        for r in eval_results.results:
            results.append({
                "evaluator": r.evaluator_id,
                "score": r.value,
                "label": r.label,
                "reason": r.explanation,
                "error": r.error,
            })

        return {
            "status": "complete",
            "agent": body.agent_runtime_id,
            "prompt": body.test_prompt,
            "response_preview": agent_response[:500],
            "results": results,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

@app.get("/api/health")
def health_check():
    return {"status": "ok", "region": REGION}


# ---------------------------------------------------------------------------
# Gateway Tool Call (with Cedar policy enforcement via persona)
# ---------------------------------------------------------------------------

GW_URL = os.environ.get("GATEWAY_URL", "https://datesparkenterpriseauth-zdgw5arcdt.gateway.bedrock-agentcore.us-east-1.amazonaws.com/mcp")
COGNITO_POOL_ID = os.environ.get("COGNITO_POOL_ID", "us-east-1_xcXG2z25u")
COGNITO_CLIENT_ID = os.environ.get("COGNITO_CLIENT_ID", "4rs4s2a0f619fs6qkai6rngtn8")
PERSONA_PASSWORDS = {
    "john": os.environ.get("JOHN_PASSWORD", "DateSparkJohn2026!"),
    "jane": os.environ.get("JANE_PASSWORD", "DateSparkJane2026!"),
}

def _get_gateway_token(persona: str) -> str:
    """Get a Cognito token for the given persona (john or jane)."""
    import hmac, hashlib, base64
    cognito = boto3.client("cognito-idp", region_name=REGION)
    secret = cognito.describe_user_pool_client(
        UserPoolId=COGNITO_POOL_ID, ClientId=COGNITO_CLIENT_ID
    )["UserPoolClient"]["ClientSecret"]
    msg = persona + COGNITO_CLIENT_ID
    secret_hash = base64.b64encode(hmac.new(secret.encode(), msg.encode(), hashlib.sha256).digest()).decode()
    resp = cognito.initiate_auth(
        ClientId=COGNITO_CLIENT_ID, AuthFlow="USER_PASSWORD_AUTH",
        AuthParameters={"USERNAME": persona, "PASSWORD": PERSONA_PASSWORDS[persona], "SECRET_HASH": secret_hash},
    )
    return resp["AuthenticationResult"]["AccessToken"]


class GatewayToolCallRequest(BaseModel):
    persona: str
    tool_name: str
    arguments: dict = {}


@app.post("/api/gateway/call-tool")
def gateway_call_tool(body: GatewayToolCallRequest):
    """Call a gateway tool as a specific persona. Cedar policies enforce permissions."""
    import httpx
    if body.persona not in PERSONA_PASSWORDS:
        raise HTTPException(status_code=400, detail=f"Unknown persona: {body.persona}")
    try:
        token = _get_gateway_token(body.persona)
        resp = httpx.post(GW_URL, headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json={"jsonrpc": "2.0", "id": 1, "method": "tools/call",
                  "params": {"name": body.tool_name, "arguments": body.arguments}}, timeout=30)
        result = resp.json()
        error = result.get("error")
        if error and "policy enforcement" in str(error.get("message", "")).lower():
            return {"status": "denied", "persona": body.persona, "tool": body.tool_name,
                    "message": f"Access denied by Cedar policy. {body.persona.title()} does not have permission to use {body.tool_name}."}
        return {"status": "allowed", "persona": body.persona, "tool": body.tool_name, "result": result.get("result")}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ---------------------------------------------------------------------------
# Agent Builder — Bedrock-powered agent configuration assistant
# ---------------------------------------------------------------------------

AGENT_BUILDER_MODEL_ID = os.environ.get(
    "AGENT_BUILDER_MODEL_ID", "us.anthropic.claude-sonnet-4-20250514-v1:0"
)

AGENT_BUILDER_SYSTEM_PROMPT = """You are an Agent Configuration Assistant for Amazon Bedrock AgentCore.
Your job is to help users create and configure AI agents using the Strands Agents SDK.

When a user describes an agent they want to build, you should:
1. Understand their requirements (purpose, tools needed, model choice)
2. Generate a complete, working Python agent file using the Strands SDK
3. Provide the configuration as a ready-to-deploy code block
4. Explain what each part does

IMPORTANT CODE GENERATION RULES:
- Always use `from strands import Agent, tool` for imports
- Always use `from strands.models import BedrockModel` for the model
- Always use `from bedrock_agentcore.runtime import BedrockAgentCoreApp` for the runtime
- Default model: `us.anthropic.claude-sonnet-4-20250514-v1:0` unless user specifies otherwise
- Available alternative models: `us.meta.llama3-3-70b-instruct-v1:0`, `us.amazon.nova-pro-v1:0`
- Tools should be defined as functions decorated with `@tool`
- Each tool function MUST have a docstring explaining what it does
- Tool functions should return JSON strings using `json.dumps()`
- The agent entrypoint should use `@app.entrypoint` decorator
- Include `callback_handler=None` in the Agent constructor

When the user confirms they want to deploy, include a special marker in your response:
```agent-config
{"agent_name": "<name>", "description": "<description>"}
```

AGENT NAMING RULES (strict):
- agent_name must match: [a-zA-Z][a-zA-Z0-9_]{0,47}
- Must start with a letter, only letters/numbers/underscores, max 48 chars
- Use snake_case (e.g. "trust_safety_agent", "dating_app_moderator")
- Never use dashes, spaces, or special characters in agent_name

Followed by the complete agent code in a Python code block marked with:
```python-deploy
<complete agent code here>
```

This signals the system to offer a deploy button to the user.

If the user asks to modify an existing agent, ask what changes they want and generate
the updated configuration.

Be concise but thorough. Use markdown formatting for readability."""


def get_bedrock_client():
    return boto3.client("bedrock-runtime", region_name=REGION)


class ChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str


class AgentBuilderChatRequest(BaseModel):
    messages: List[ChatMessage]
    template_context: Optional[str] = None


@app.post("/api/agent-builder/chat")
async def agent_builder_chat(body: AgentBuilderChatRequest):
    """Chat with the Agent Configuration Assistant using Bedrock Converse API with streaming."""
    try:
        client = get_bedrock_client()

        # Build the messages for the Converse API
        converse_messages = []
        for msg in body.messages:
            converse_messages.append({
                "role": msg.role,
                "content": [{"text": msg.content}],
            })

        # If there's template context, prepend it to the system prompt
        system_prompt = AGENT_BUILDER_SYSTEM_PROMPT
        if body.template_context:
            system_prompt += f"\n\nThe user selected the following template as a starting point:\n{body.template_context}"

        response = client.converse_stream(
            modelId=AGENT_BUILDER_MODEL_ID,
            system=[{"text": system_prompt}],
            messages=converse_messages,
            inferenceConfig={
                "maxTokens": 4096,
                "temperature": 0.7,
            },
        )

        def generate():
            stream = response.get("stream", [])
            for event in stream:
                if "contentBlockDelta" in event:
                    delta = event["contentBlockDelta"].get("delta", {})
                    text = delta.get("text", "")
                    if text:
                        yield f"data: {json.dumps({'type': 'text', 'content': text})}\n\n"
                elif "messageStop" in event:
                    yield f"data: {json.dumps({'type': 'done'})}\n\n"

        return StreamingResponse(
            generate(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )
    except ClientError as e:
        error_code = e.response["Error"]["Code"]
        error_message = e.response["Error"]["Message"]
        logger.error(f"Bedrock Converse error: {error_code} - {error_message}")
        raise HTTPException(
            status_code=500,
            detail=f"Bedrock error: {error_message}",
        )
    except Exception as e:
        logger.error(f"Agent builder chat error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8081)
