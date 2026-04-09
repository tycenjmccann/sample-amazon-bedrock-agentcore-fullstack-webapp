# Testing the AgentCore Operations Dashboard Frontend

## Local Dev Setup

1. Install frontend dependencies:
   ```bash
   cd frontend && npm install
   ```

2. Start the Vite dev server in local dev mode:
   ```bash
   VITE_LOCAL_DEV=true npx vite --port 5173
   ```
   **Important**: Do NOT use `npm run dev:local` or `vite --mode local` — Vite reserves the `local` mode name (conflicts with `.env.local`). Instead, set `VITE_LOCAL_DEV=true` as an environment variable directly.

3. (Optional) Start the management API backend:
   ```bash
   cd backend && source venv/bin/activate && python app.py
   ```
   This requires AWS credentials configured. Without it, API-dependent pages (Dashboard, Agents, Gateways, Memory) show error/empty states — this is expected and handled gracefully.

## What Local Dev Mode Does

- Bypasses Cognito authentication (sets user to `local-dev@example.com`)
- Shows "AgentCore Operations (Local Dev)" in the top nav bar
- Hides the agent selector dropdown on the Chat page
- Agent list API calls are skipped on the Chat page

## Pages and What to Test

| Page | Route | API-dependent? | Key elements |
|------|-------|---------------|-------------|
| Dashboard | `/` | Yes (agents, gateways, memory) | Resource Overview counters, Demo Guide (Acts 1-6), View Agents/Open Chat buttons |
| Agents List | `/agents` | Yes (agents) | Table with 7 columns, filter input, Refresh button |
| Agent Detail | `/agents/:id` | Yes (agent detail) | 6 tabs: Overview, Runtime & Model, Auth, MCP Gateway, Memory, Policies |
| Chat | `/chat` | Partial (agent list in prod mode) | Persona toggle (John/Jane), support prompts, prompt input |
| Evaluations | `/evaluations` | No (static) | Model comparison table with color-coded badges, Key Insights, Run Evaluations CLI |
| Gateways | `/gateways` | Yes (gateways) | Info alert, gateway list or empty state |
| Memory | `/memory` | Yes (memories) | How Memory Works, Memory Strategies, Memory Stores table |
| Policies | `/policies` | No (static) | Cedar policies for Jane (permit) and John (forbid), Authorization Flow |

## Key Test Patterns

- **Persona toggle**: On `/chat`, toggle between John (Tier 1, blue badge) and Jane (Tier 2, green badge). Verify the placeholder text updates to match the active persona.
- **Support prompts**: Click a support prompt button — it should populate the input field and hide the prompt buttons.
- **Navigation**: Click every side nav link and verify each page renders without React errors.
- **Error handling**: Without the management backend, API-dependent pages should show dismissible error alerts and empty states — never crash.

## Devin Secrets Needed

- **AWS credentials** (for management API backend): `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_DEFAULT_REGION` — needed only if testing with live AWS AgentCore APIs.

## Known Issues

- `auth.ts` has pre-existing TypeScript errors related to `import.meta.env` types — these are not caused by the dashboard changes.
- The `calculator` tool from `strands_tools` is still imported in `strands_agent.py` alongside the new trust-and-safety tools.
