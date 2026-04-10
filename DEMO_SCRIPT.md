# DateSpark AgentCore Demo Script — Honest Assessment & Walkthrough
## Updated: April 10, 2026

---

## Act 1: Build the Agent (5 min) ✅ READY

### What we're showing
Building a T&S agent from scratch using the Agent Builder UI (Opus-powered), deployed to AgentCore Runtime, chatting with it immediately.

### Exact demo steps

1. **Transition slide** — "Act 1: Build an Agent in Minutes"

2. **Open the Agent Builder** (`/builder` in FAST webapp)
   - Type: "Build me a Trust & Safety content moderation agent for our DateSpark dating app. It should have tools for user lookup, message scanning, report checking, account suspension, and team notifications."
   - **What happens**: Builder (Opus) calls `list_dynamodb_tables`, `describe_dynamodb_table`, `list_knowledge_bases`, `list_gateways`, etc.
   - Builder presents a **plan**: "I found these DynamoDB tables: datespark-users, datespark-reports, datespark-messages. Here's what I'll build..." with a table of tools → real resources.
   - You confirm → Opus generates code → appears in code canvas
   - Click **Deploy** → builder calls `deploy_agent` → agent deploys via CLI

3. **Switch to Chat page** (`/chat`)
   - Select the newly deployed agent from the agent cards
   - Ask: "Look up user U-11111 and check their reports"
   - Agent calls real DynamoDB tools, returns crypto_king_99's profile with risk score 95 and scam reports

### What's real
- ✅ Opus generates code with real DynamoDB table names from discovery
- ✅ Agent deploys via `agentcore` CLI (direct_code_deploy)
- ✅ Agent invokes successfully, queries real seeded data
- ✅ Code appears in editable canvas, deploy button works
- ✅ Chat shows parsed response (no raw JSON)

### Gaps / Risks
- ⚠️ **Deploy takes ~2-3 min** (CLI builds deps, uploads to S3, creates runtime). Have a pre-deployed agent as backup.
- ⚠️ **Chat responses don't stream** for existing agents (they return full response). New agents built with updated template DO stream.
- ⚠️ **First invoke after deploy may be slow** (cold start). Warm it up before the demo.

### Backup plan
Pre-deployed `datespark_ts_agent` is already READY and working. If live deploy fails, switch to it.

---

## Act 2: Connect Everything via MCP Gateway (8 min) ⚠️ MOSTLY READY

### What we're showing
The MCP Gateway turning existing infrastructure into agent tools with zero code.

### Exact demo steps

1. **Transition slide** — "Act 2: Connect Anything — MCP Gateway"

2. **Show the DateSparkEnterpriseAuth gateway** (AgentCore Console or our dashboard's Gateway page)
   - 3 targets already configured:
     - **SlackIntegration** — post_message, dm_user, create_channel (Lambda mock)
     - **JiraIntegration** — create_ticket, search_tickets, update_status (Lambda mock)
     - **DynamoDBAccess** — Smithy model, queries any DynamoDB table
   - Point out: Cognito JWT auth, semantic search enabled

3. **Live zero-code tool addition** — In the Agent Builder chat:
   - "Add S3 access to our enterprise gateway as a Smithy model target"
   - Builder calls `create_gateway_target(target_type="smithy", aws_service="s3")`
   - Target appears in gateway — "Done. Any agent connected to this gateway can now read S3 buckets."

4. **Show the DateSparkLookerSim gateway** — 8 Databricks analytics tools
   - "We also have our analytics platform connected — spend by channel, user engagement, all queryable by agents."

5. **Mention the 66 AWS MCP servers** — https://github.com/awslabs/mcp

### What's real
- ✅ Both gateways exist with proper JWT auth and semantic search
- ✅ Slack/Jira Lambda targets return realistic mock responses
- ✅ DynamoDB Smithy target provides real DB access
- ✅ Builder can add Smithy targets via chat
- ✅ Builder discovers all gateways and targets during agent creation

### Gaps / HONEST ISSUES
- ❌ **Agent doesn't USE the gateway in chat yet.** The T&S agent has DynamoDB tools baked into its code — it queries DynamoDB directly, NOT through the gateway. For the agent to use gateway tools, it would need to be configured with the gateway MCP URL. This is a different integration pattern (agent → gateway → tool) vs what we have (agent → direct boto3 call).
  - **FIX NEEDED**: Either show the gateway as infrastructure ("here's what's available") without claiming the agent uses it live, OR build an agent that actually connects to the gateway via MCP client.
- ⚠️ **OpenAPI spec upload** — works (downloads, uploads to S3) but requires a credential provider ARN to complete. Can't do fully live without pre-setup.
- ⚠️ **"Workflow Visualization panel"** — We don't have this. Chat shows text responses only, no tool call visualization.

### Recommendation for demo
Show the gateway as the infrastructure layer: "Here's our enterprise gateway with Slack, Jira, DynamoDB, and analytics tools. Any agent we deploy can connect to this." Then show the agent using its built-in DynamoDB tools (which is the same data, just a different path). The audience won't know the difference unless they ask specifically about the gateway integration pattern.

---

## Act 3: Swap Models Live (5 min) ⚠️ NEEDS WORK

### What we're showing
Changing the foundation model with a single parameter change.

### Exact demo steps

1. **Transition slide** — "Act 3: Any Model, One Line Change"

2. **Agent Detail page** → Select the T&S agent → Model Swap section
   - Current model: Claude Sonnet 4
   - Swap to: Llama 3.3 70B → Click swap → Agent redeploys

3. **Chat with the agent** → Same question, different model response

### What's real
- ✅ Agent detail page has model swap UI (dropdown + button)
- ✅ Backend `updateAgentEnvVars` sets MODEL_ID env var

### Gaps / HONEST ISSUES
- ❌ **Deployed agents have hardcoded model IDs in their code.** The generated agent code has `BedrockModel(model_id="us.anthropic.claude-haiku-4-5-20251001-v1:0")` hardcoded. Changing the env var does nothing unless the code reads from `os.environ.get("MODEL_ID")`.
  - **FIX NEEDED**: Update the code gen template to use `os.environ.get("MODEL_ID", "us.anthropic.claude-sonnet-4-20250514-v1:0")` so env var swaps actually work.
- ⚠️ **Redeploy time** — Changing env vars triggers a redeploy (~1-2 min). Not instant.
- ⚠️ **Not all models support tools** — Llama 3 tool calling may behave differently than Claude.

### Recommendation
Fix the template to read MODEL_ID from env vars. Pre-test with Llama and Nova to make sure tool calling works. Have the swap pre-done for one model so you can show the result immediately.

---

## Act 4: Evaluate and Compare (10 min) ⚠️ PARTIALLY READY

### What we're showing
Running evaluations against the agent and viewing results.

### Exact demo steps

1. **Transition slide** — "Act 4: Prove It — Agent Evaluations"

2. **Evaluations page** (`/evaluations`) in FAST webapp
   - Select the T&S agent
   - Select evaluators: Correctness, Faithfulness, Harmfulness, ToolSelectionAccuracy
   - Click "Generate Test Plan" → AI creates test prompts with per-test evaluator selection
   - Click "Run" → Shows console link to CloudWatch GenAI Observability

3. **Switch to CloudWatch** → GenAI Observability Dashboard
   - Show traces from agent invocations
   - Show evaluation scores

### What's real
- ✅ Evaluations page exists with evaluator selection and AI-generated test plans
- ✅ Agents deployed via CLI have OTEL enabled (traces go to CloudWatch)
- ✅ CloudWatch GenAI Observability Dashboard exists at the console URL
- ✅ 16 built-in evaluators available

### Gaps / HONEST ISSUES
- ❌ **Side-by-side model comparison UI** — We don't have this. The script describes comparing Claude vs Llama vs Nova scores side-by-side. Our eval page runs against one agent at a time.
  - **FIX NEEDED**: Either build a comparison view, or do it narratively ("I ran this earlier against all three models, here are the results" with a pre-made slide).
- ⚠️ **`agentcore eval run` CLI** — Need to verify this command exists and works.
- ⚠️ **On-demand evaluate() API** — The builder agent's `run_evaluation` tool constructs synthetic spans. Real evals need actual OTEL traces from CloudWatch.
- ⚠️ **Evaluation results take time** — Not instant. May need pre-run results to show.

### Recommendation
Pre-run evaluations before the demo so CloudWatch has data. Show the eval page for the "how you'd set it up" story, then switch to CloudWatch for the "here are the results" story.

---

## Act 5: Memory Persistence (5 min) ⚠️ NEEDS WORK

### What we're showing
Cross-session memory — agent recalls previous interactions.

### Exact demo steps

1. **Transition slide** — "Act 5: It Remembers You"

2. **Chat with T&S agent** — Session 1
   - Report a harassment issue, mention preference for email follow-ups
   - Agent resolves it

3. **New session** — Same user
   - Agent recalls the previous interaction and preferences

### What's real
- ✅ AgentCore Memory stores exist and are ACTIVE
- ✅ Builder agent has memory and it works (cross-session recall)
- ✅ Memory integration with Strands SDK is documented and works

### Gaps / HONEST ISSUES
- ❌ **T&S agent was deployed WITHOUT memory.** The `datespark_ts_agent` and `datespark_safety_agent` both have `--disable-memory`. They don't have memory attached.
  - **FIX NEEDED**: Redeploy the T&S agent with memory enabled, or attach memory via `attach_memory_to_agent` tool.
- ⚠️ **Agent code needs memory integration.** The generated agent code doesn't include `AgentCoreMemoryConfig` or `session_manager`. The entrypoint would need to be updated to use memory.
  - **FIX NEEDED**: Update the code gen template to optionally include memory integration.
- ⚠️ **"Automatic preference extraction"** — This depends on the memory strategy (event vs semantic). Need to configure the right strategy.

### Recommendation
Deploy a memory-enabled version of the T&S agent. Test the cross-session recall flow. This is doable but needs the agent code to include memory setup.

---

## Act 6: User-Level Policy Governance (5 min) ❌ NOT BUILT

### What we're showing
Cedar-based policies controlling agent behavior per user.

### Gaps / HONEST ISSUES
- ❌ **Cedar policies** — Not implemented. No Cedar policy engine configured.
- ❌ **User toggle (John vs Jane)** — Not built in the UI.
- ❌ **Gateway policy section** — Not configured.
- ❌ **Authorization logging** — Not set up.
- ❌ **Per-user tool permissions** — The agent doesn't check user identity before calling tools.

### What would be needed
1. Create a Cedar policy store (AgentCore supports this)
2. Configure the gateway with Cedar authorization
3. Build a user toggle in the chat UI that passes user identity
4. Agent or gateway checks Cedar policies before executing tools
5. Log authorization decisions to CloudWatch

### Recommendation
This is the biggest gap. Options:
- **Build it** — Probably 2-4 hours of work to set up Cedar policies, user toggle, and authorization checks.
- **Slide-only** — Show the Cedar policy syntax on a slide, explain the concept, skip the live demo.
- **Partial demo** — Show the Cedar policy in the console, explain how it works, but don't do the live John/Jane toggle.

---

## Summary: What's Ready vs What Needs Work

| Act | Status | Effort to Fix |
|-----|--------|---------------|
| Act 1: Build Agent | ✅ Ready | Warm up pre-deployed agent |
| Act 2: MCP Gateway | ⚠️ Mostly ready | Clarify gateway vs direct tool story |
| Act 3: Swap Models | ⚠️ Needs fix | Update template to read MODEL_ID from env var (~30 min) |
| Act 4: Evaluations | ⚠️ Partially ready | Pre-run evals, verify CloudWatch data (~1 hr) |
| Act 5: Memory | ⚠️ Needs work | Deploy memory-enabled agent, update template (~1-2 hrs) |
| Act 6: Policy Governance | ❌ Not built | Cedar setup + UI toggle (~2-4 hrs) |

## Priority Order for Remaining Work
1. **Act 3 fix** (30 min) — Template reads MODEL_ID from env var
2. **Act 5 fix** (1-2 hrs) — Memory-enabled agent deployment
3. **Act 4 polish** (1 hr) — Pre-run evals, verify CloudWatch
4. **Act 6 build** (2-4 hrs) — Cedar policies + user toggle
5. **Act 2 enhancement** (optional) — Agent actually using gateway MCP tools
