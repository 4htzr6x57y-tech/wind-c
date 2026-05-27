# AI ENTRYPOINT

This project requires WATCHTOWER before code, UI, or schema edits.

## Required Gate

1. Read `bridge-context.json`, beginning with `canonical_current_state`, and locate `ai_boot_protocol`; complete its `read_order`, including `current_human_directive` and `recovery_checkpoint`, before declaring an intended action.
2. Open `watchtower.html` and run `window.WATCHTOWER.run()` before editing.
3. Run `window.WATCHTOWER.checkRequest("request text", result)` and read `editBudget` and `forbiddenSurfaceMap`.
4. After editing, run `window.WATCHTOWER.runAndRender()` and record the session log.
5. Update BRIDGE with `update_watchtower_gate(...)` and mark the corresponding validation check.
6. When asked to participate in AI reading validation, answer all fixed questions in `agent_responses[].reading_answers`; after multiple responses, run `evaluate_consensus(...)`.
7. Intentional disagreement tests must use `run_disagreement_detection_test(...)` and be recorded in `consensus_test_log`; do not add test agents to production `agent_responses`.
8. `current_truth_snapshot` is the single latest compressed truth entry; regenerate it with `freeze_current_truth_snapshot(...)` only after production consensus changes.
9. Store only reusable decisions, insights, questions, answers, proposals, warnings, wishes, or complaints in `semantic_packets`; keep confidence and friction scores as `0.0` to `1.0` floats and avoid copying ordinary chat history.
10. Promote reusable packets to `memory_graph_lite.nodes` with `promote_semantic_packet_to_memory_node(...)`; preserve `source_packet_id`, and specify the node type when the packet meaning is not unambiguous.
11. Treat graph relations as untrusted until processed through `propose_memory_edge(...)`, `validate_memory_edge(...)`, and `add_validated_memory_edge(...)`; store a rationale for every relation.
12. Include `context_basis` in every new Boot response and record it with `record_ai_boot_response(...)`; do not treat boot completion or freshness warning as a new consensus vote.
13. Only Human or CODEX may update `canonical_current_state` using `update_canonical_current_state(...)`; AI participants may propose a refresh but must not write the pointer directly.
14. When `canonical_current_state` exists, `bridge_save(...)` preserves the canonical generation time; authoritative changes require an explicit pointer update rather than an automatic freshness rewrite.
15. Use `save_recovery_checkpoint(...)` only for a safe manually chosen resume point; for `in_progress` or `blocked` work, put the one next action to perform in `pending_actions[0]`.
16. Validate a saved checkpoint with `validate_recovery_checkpoint(...)` before resuming; use `generate_recovery_handoff(...)` to obtain the compact restart brief.
17. Read `current_human_directive` as the single current Human instruction. `broadcast_human_directive(...)` creates a Semantic Packet and manual distribution text only; it does not contact an AI automatically.
18. When a browser runtime is unavailable, use `run_bridge_core_diagnostics(context)` for a read-only BRIDGE health summary; it is not a replacement for browser Watchtower where that gate is available.
19. For compact before/after review without a browser, use `analyze_bridge_diff(beforeText, afterText, options)`; treat its `risky` result as a stop signal until the reported reason is resolved.
20. Use `generate_wtc_report(context, diffResult?)` when another AI needs a short immediate instruction from WT Core health plus optional diff risk; the report is informational only and does not update context.
21. Use `generate_ai_resume_packet(context, target_agent?)` as the shortest restart entry for an incoming AI; it must preserve `pending_actions[0]` as the next action and prohibit editing whenever WT Core is not healthy.
22. Use `record_ai_friction(context, feedback, boot_id)` for reusable `wish` or `complaint` feedback. An AI limited to proposals may leave friction feedback, but may not use it to edit other state.

In v1.5, `canonical_current_state` is the first authority pointer, `current_human_directive` is the current manual broadcast instruction, `recovery_checkpoint` is a manually saved safe resume point, and `handoff` remains the longer compact coordination surface. `generate_ai_resume_packet(...)` is the shorter read-only restart entry; AI friction is retained as Semantic Packet feedback rather than a new large schema. A frozen `current_truth_snapshot` represents the consensus that produced it; it is evidence, not the current-state pointer.

## v1.1 Freshness Rule

`BRIDGE v1.1` is the recorded version-bumped migration from the frozen v1.0 contract. A Boot result of `fresh` permits normal work; `completed_with_warning` permits reading and proposals only until Human or CODEX confirms; `reject` permits no participation. Read full logs only for audit or debugging.

## v1.2 Recovery Rule

`BRIDGE v1.2` adds a single `recovery_checkpoint` for interrupted work. It is not automatic saving and it does not rewrite `canonical_current_state`, `current_truth_snapshot`, `consensus_state`, or `agent_responses`. The checkpoint records the access mode that existed at save time as `full_access`, `read_propose_only`, or `no_access`.

## v1.5 Mission Control Rule

`BRIDGE v1.3` added a Human Router support surface in `bridge.html`. `BRIDGE v1.4` added AI Resume Packet generation. `BRIDGE v1.5` adds a read-only recent AI Friction view. Freshness colors are views derived from `ai_boot_log`; they do not initiate polling or communication. A Human Directive is persisted as `current_human_directive`, represented as a Semantic Packet, and shown in Handoff for manual delivery.

`run_bridge_core_diagnostics(context)` is the non-browser WT Core surface: it reads canonical freshness, latest Boot results, recovery validity, and the latest Packet without mutating context or invoking browser/cache/network behavior.

`analyze_bridge_diff(beforeText, afterText, options)` is the non-browser WTc Diff Analyzer surface: it compares source or context text, flags protected-field and public-API risks, and recommends follow-up checks without modifying either input or the saved context.

`generate_wtc_report(context, diffResult?)` is the WTc short-report surface: it renders health, optional diff risk, and the next action as compact text without writing to Handoff, consensus, or the saved context.

`generate_ai_resume_packet(context, target_agent?)` is the read-only 30-second restart surface: it uses current canonical state, WT Core health, Human Directive, and Recovery Checkpoint to produce the next action and access mode without reading or updating long audit logs.

`record_ai_friction(context, feedback, boot_id)` stores `wish` or `complaint` feedback as a Semantic Packet. It uses propose authorization so a warning/stale AI can report reusable friction without gaining edit authority; Handoff and Mission Control can display the stored feedback later.

Do not treat work as complete while `watchtower_gate.status` is `pending` or `failed`.

## If WATCHTOWER Cannot Run

Set `watchtower_gate.status` to `blocked`, state the exact reason, and record fallback checks:

- Confirm the changed application is registered in `WATCHTOWER_CONFIG.expectedIds` and `apps`.
- Run the changed application's exported diagnostics API, when available.
- Run syntax and focused API regression checks for changed files.

`blocked` is a visible exception record, not a successful WT run.
