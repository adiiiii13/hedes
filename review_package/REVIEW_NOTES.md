# HEDES Architectural Changes & Code Review Notes

**Target Audience:** Independent Technical Reviewers & Core Maintainers  
**Repository:** `adiiiii13/hedes`

---

## 1. Major Architectural Upgrades

### 1.1 Backend Ownership of AI Execution (`app/utils/runs.server.ts`)
- **Previous Design:** Execution state was managed in the React/Nanostores frontend. Navigating tabs or reloading the window would abruptly abort active runs and discard partial responses.
- **New Architecture:** All model requests, hive mind councils, and tool calls are owned by the Node/Remix backend server. The renderer connects via a durable subscription (`/api/local/runs`). On UI reload or transient disconnect, the client resumes playback from its last known sequence number without restarting duplicate tasks.

### 1.2 Adaptive Concurrency Hive Engine (`app/engine/real-council.ts`)
- **Previous Design:** Fixed concurrency of 2–3 requests with a hard ceiling, causing 100-bot councils to take up to 2 minutes. Individual persona failures would discard entire councils or truncate recommendations to 240 characters.
- **New Architecture:** Dynamic rate-aware scaling (starts at 2, scales up to 8 upon consecutive successes, throttles back on 429). Failed agents are tracked in `failedBotIds` and can be retried independently without re-executing successful contributions. Synthesis uses hierarchical chunking to preserve detailed rationale.

### 1.3 Reviewable ChangeSets (`app/utils/changesets.server.ts`)
- **Previous Design:** Direct file writes without pre-apply verification.
- **New Architecture:** Two-phase commit. AI proposes a ChangeSet with baseline content hashes. Before write, the disk content is re-hashed. If an external editor modified the file in the interim, the apply operation is rejected as a conflict. Applying automatically creates an instant recovery checkpoint.

### 1.4 Native Store & Sandboxed Extension Bridge (`app/utils/store.server.ts`)
- **Previous Design:** Attempting to force VS Code extensions directly into CodeMirror.
- **New Architecture:** A unified store for curated MCP servers, skills, and plugins with permission inspection. For full VS Code extension ecosystems, an external bridge uses ephemeral, project-scoped authentication tokens to communicate with VS Code/VSCodium running as the external editor host.

---

## 2. Key Modules for Review

1. **Gateway Scheduler:** [`app/llm/gateway.server.ts`](file:///c:/Users/adity/OneDrive/Desktop/HEDES/app/llm/gateway.server.ts)
   - Inspect token bucket rate limiting and error normalization.
2. **Context Engine:** [`app/engine/context-engine.ts`](file:///c:/Users/adity/OneDrive/Desktop/HEDES/app/engine/context-engine.ts)
   - Inspect 5-tier context priority ranking and untrusted task data wrapping.
3. **Evidence-Based Memory:** [`app/engine/memory.ts`](file:///c:/Users/adity/OneDrive/Desktop/HEDES/app/engine/memory.ts)
   - Inspect preference superseding and cycle detection in memory graph.
4. **ChangeSet Manager:** [`app/utils/changesets.server.ts`](file:///c:/Users/adity/OneDrive/Desktop/HEDES/app/utils/changesets.server.ts)
   - Inspect hash conflict detection and checkpoint rollback.
5. **Speech Adapter:** [`app/utils/voice.server.ts`](file:///c:/Users/adity/OneDrive/Desktop/HEDES/app/utils/voice.server.ts)
   - Inspect audio PCM normalization and voice command authorization pipeline.
