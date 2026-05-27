# BRIDGE

Start here:
- AI_ENTRYPOINT.md
- bridge-context-lite.json

Authoritative state:
- bridge-context-final.json

---

# WATCHTOWER

`watchtower.html` is self-contained. For moving Watchtower into another project, the only required file is `watchtower.html`.

This README and `WATCHTOWER.md` are optional discovery notes for humans or AI agents; they are not required for Watchtower to run.

Before editing this project, read `AI_ENTRYPOINT.md`, open `watchtower.html`, and run Watchtower. Work is not complete while BRIDGE `watchtower_gate.status` is `pending` or `failed`.

## For AI Agents

1. Open `watchtower.html` in a browser.
2. Run `window.WATCHTOWER.run()` before editing.
3. Use `window.WATCHTOWER.checkRequest("request text", result)` before editing.
4. Read `result.aiBrief`, `result.workbench`, `result.editBudget`, and `result.forbiddenSurfaceMap`.
5. Do not change the human-facing buttons unless the user explicitly asks.
6. Do not change the compact summary cards unless the user explicitly asks.
7. After edits, run `window.WATCHTOWER.runAndRender()` and inspect the new result.
8. After work, call `window.WATCHTOWER.recordSessionLog({ intent, outcome, detail, signatureBefore, signatureAfter, filesChanged })`.
9. Update BRIDGE `watchtower_gate` and its validation checklist status. If WT cannot run, record `blocked` and the required fallback checks from `AI_ENTRYPOINT.md`.
10. During BRIDGE reading validation, answer the fixed questions in `agent_responses` and evaluate `consensus_state` only from structured answers.
11. Store intentional divergence trials in `consensus_test_log`; production `consensus_state` remains reserved for real agent responses.
12. Read `current_truth_snapshot` first for the latest compact state; use `agent_responses` and `consensus_test_log` only when detail or audit evidence is needed.
13. Read the latest `semantic_packets` after the snapshot for decisions or warnings added since it was frozen; store only reusable knowledge with `confidence` as a `0.0` to `1.0` float.
14. Use `memory_graph_lite.nodes` to follow promoted knowledge back to `source_packet_id`; add graph edges only for meaningful, verified relationships.
15. Create trusted graph relations through edge proposals: record a rationale, validate or reject it, then add only validated relationships to `memory_graph_lite.edges`.
16. For each new AI participant, follow `ai_boot_protocol.read_order` and store its required response with `record_ai_boot_response(...)`; boot completion is distinct from `agent_responses` consensus evaluation.
17. Store a manually selected safe resume point with `save_recovery_checkpoint(...)`; put the single next action first in `pending_actions`.

## BRIDGE v1.5 Mission Control

`bridge.html` provides a lightweight Mission Control surface for the Human Router. It reads `bridge-context.json` as the canonical context and keeps AI communication manual. v1.4 added a read-only AI Resume Packet output, and v1.5 adds a lightweight view of saved AI friction feedback, without automatically migrating an existing stored v1.3 context.

- The dashboard shows `canonical_current_state`, WATCHTOWER status, the latest Semantic Packet, and `recovery_checkpoint` in one view.
- AI freshness is derived from the latest `ai_boot_log` record for GPT, Claude, Grok, and Gemini and is displayed as `fresh`, `warning`, or `stale`.
- `Broadcast送信 (手動)` saves one `current_human_directive`, creates a decision Semantic Packet, and produces text for manual distribution.
- Handoff Markdown includes `Current Human Directive` so each AI receives the same current instruction.
- v1.3 does not call AI APIs, send network messages to agents, or enable Roundtable behavior.

### WT Core (Non-Browser Diagnostics)

`BRIDGE.run_bridge_core_diagnostics(context)` is a read-only, lightweight health summary for agents without a browser runtime. It inspects only the supplied context, reports canonical freshness, current recovery validity, the latest Semantic Packet, and the latest Boot result per agent. It reads formal `boot_status` records while accepting the existing `status` field for backward compatibility, without migrating stored logs. It is separate from `AppDiagnostics.runDiagnostics()` and does not fetch, render, cache, or alter the context.

### WTc Diff Analyzer

`BRIDGE.analyze_bridge_diff(beforeText, afterText, options)` is a read-only, non-browser diff health summary. Pass `{ surface: 'bridge.js', kind: 'javascript' }` for source text or `{ surface: 'bridge-context.json', kind: 'json' }` for context JSON. It reports changed function candidates, public API exports, constants, top-level schema fields, affected areas, risk reasons, and recommended checks. The analyzer does not modify either input or update BRIDGE context.

High risk includes protected evidence changes (`current_truth_snapshot`, `consensus_state`, or `agent_responses`), a stale canonical pointer, removed public APIs, or an invalid recovery checkpoint. Medium risk includes packets, boot logs, directives, handoff behavior, and Mission Control surfaces. Documentation or display-only changes remain low risk unless they touch the Mission Control surface.

### WTc Short Report

`BRIDGE.generate_wtc_report(context, diffResult?)` combines WT Core health and an optional WTc Diff Analyzer result into a short AI-readable text report. It states whether work may continue, what context is current, which change area is risky, and what check or action should happen next. It is read-only and does not update Handoff, consensus, or any stored context.

### AI Resume Packet

`BRIDGE.generate_ai_resume_packet(context, target_agent?)` generates a compact read-only restart packet for an incoming AI. It always reflects canonical state, WATCHTOWER Gate, WT Core health, the current Human Directive, and the recovery checkpoint. `recovery_checkpoint.pending_actions[0]` becomes `next_single_action`; when core health is stale or warning, the Gate is not passed, or saved access is restricted, the packet reduces access and explicitly states that editing is forbidden. Routine resume packets do not require reading `agent_responses`, `consensus_test_log`, or `change_log`.

### AI Friction / Complaints

`semantic_packets` accepts `wish` and `complaint` with optional `category`, `severity`, `friction_score`, and `suggested_fix` fields. `BRIDGE.record_ai_friction(context, feedback, boot_id)` is the dedicated entrypoint: a warning/stale participant with propose access may record reusable friction feedback, while normal packet edits remain gated. `friction_score` must be `null` or between `0.0` and `1.0`; `severity`, when present, is `low`, `medium`, or `high`.

Handoff includes the latest five feedback packets, and Mission Control shows the latest three as a read-only "AIの声" view. This feature does not rewrite consensus, frozen truth, or existing stored packets.

## BRIDGE v1.3 Distribution

- `bridge-context.json` is the working canonical context with experiment history.
- `bridge-context.sample.json` is the compact onboarding example for a new AI participant, including an empty directive slot.
- In the boot protocol, `handoff` is the compact handoff surface; it is not a second storage schema.
- `current_truth_snapshot` is frozen consensus evidence. Use later `handoff` and `semantic_packets` to understand progress after the freeze.

## BRIDGE v1.1 Current-State Authority

`BRIDGE v1.0` was frozen. `BRIDGE v1.1` is the explicit version-bumped migration that adds `canonical_current_state` and Boot freshness validation to prevent adoption of stale context.

- Read `canonical_current_state` first. It points to the authoritative current surfaces and does not replace the frozen snapshot.
- Only Human or CODEX may call `update_canonical_current_state(...)`; each update records a Semantic Packet and Change Log entry.
- With a canonical pointer present, `bridge_save(...)` preserves `generated_at`; authoritative changes must refresh the pointer explicitly before saving.
- Every new AI Boot response must include `context_basis`; `validate_context_freshness(...)` determines access before editing.
- A `completed_with_warning` boot permits reading and proposals only. A `reject` boot cannot participate.
- Do not add fields, APIs, or workflow surfaces merely for convenience.
- Non-breaking clarification, sample updates, diagnostics, and operational evidence may be recorded without expanding the schema.
- Treat `bridge-context.sample.json` as the minimum complete onboarding shape for v1.3.

## BRIDGE v1.2 Recovery Checkpoint

`BRIDGE v1.2` adds one manually saved `recovery_checkpoint` so an interrupted AI session can restart from its last safe working point.

- `canonical_current_state` identifies the authoritative present state; `recovery_checkpoint` identifies where interrupted work may resume.
- `current_truth_snapshot` remains frozen consensus evidence and is not rewritten by recovery saving.
- Only Human or CODEX may save a checkpoint; it is validated against the canonical pointer before reuse.
- `access_mode_at_save` records whether the save occurred under `full_access`, `read_propose_only`, or `no_access`.
- When `work_status` is `in_progress` or `blocked`, `pending_actions[0]` must be the single next action to perform.
- v1.2 defines the checkpoint contract only. It does not implement automatic or timed saving.
- The BRIDGE page prefers a fresh `bridge-context.json` read and refreshes its service worker; cached historical context must not silently become a resume point.

## Token Budget Audit

Read only as deeply as the task requires:

| Read Scope | Use Case |
| --- | --- |
| `canonical_current_state` | Confirm which surfaces are current before trusting any older context |
| `canonical_current_state` + `watchtower_gate` | Confirm current safety gate state |
| + latest `semantic_packets` + `handoff` | Normal boot and routine task selection |
| + `recovery_checkpoint` | Resume interrupted work from the last validated safe action |
| + `current_truth_snapshot` | Inspect the frozen agreed baseline |
| + validated `memory_graph_lite.edges` | Design reasoning and trusted relationships |
| + `agent_responses` / `consensus_test_log` / `change_log` | Audit, disagreement analysis, or debugging only |

The normal AI Boot Protocol begins with the canonical pointer and current WT state, then consults full logs only when needed.

## Human Buttons

- `診断する`
- `診断結果を承認`
- `AIに続きを頼む`
- `今の状態を基準にする`

These labels and their order are part of the Watchtower human UI contract.
The compact summary cards are also fixed by `HUMAN_SUMMARY_CARD_CONTRACT`.

## Stable AI Surfaces

- `#watchtower-json`
- `window.WATCHTOWER.run()`
- `window.WATCHTOWER.runAndRender()`
- `window.WATCHTOWER.checkRequest(intent, result)`
- `window.WATCHTOWER.recordSessionLog(entry)`
- `window.WATCHTOWER.assessBridgeLiveContext(displayedContext, canonicalContext)`
- `window.WATCHTOWER.readSessionLogSummary()`
- `result.editBudget`
- `result.forbiddenSurfaceMap`
- `result.actionPacket`
- `result.handoffPacket.sessionLog`
- `result.machineReadable`
