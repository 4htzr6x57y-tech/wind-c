(function (global) {
  'use strict';

  const BRIDGE_VERSION = '1.5';
  const REQUIRED_FIELDS = ['bridge_version', 'task_frame', 'handoff'];
  const NODE_TYPES = ['Goal', 'Decision', 'Constraint', 'Risk', 'Shortcut'];
  const EDGE_RELATIONS = ['supports', 'conflicts', 'depends_on', 'derived_from', 'mitigates'];
  const PACKET_TYPES = ['decision', 'proposal', 'question', 'answer', 'insight', 'warning', 'wish', 'complaint'];
  const FRICTION_PACKET_TYPES = ['wish', 'complaint'];
  const FRICTION_SEVERITIES = ['low', 'medium', 'high'];
  const FAILURE_TYPES = ['wt_failed', 'stale_context', 'invalid_recovery', 'bad_diff', 'edit_blocked', 'other'];
  const FAILURE_SEVERITIES = ['low', 'medium', 'high', 'critical'];
  const FAILURE_STATUSES = ['open', 'mitigated', 'resolved'];
  const VALIDATION_STATUSES = ['pending', 'pass', 'fail', 'partial'];
  const WATCHTOWER_GATE_STATUSES = ['pending', 'passed', 'blocked', 'failed'];
  const RECOVERY_WORK_STATUSES = ['idle', 'in_progress', 'blocked', 'completed'];
  const RECOVERY_ACCESS_MODES = ['full_access', 'read_propose_only', 'no_access'];
  const MISSION_CONTROL_AGENTS = ['GPT', 'Claude', 'Grok', 'Gemini'];
  const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };
  const CONSENSUS_TOPICS = [
    { key: 'primary_goal', label: '主目的' },
    { key: 'current_phase', label: '現在のフェーズ' },
    { key: 'watchtower_gate_mandatory', label: 'WT Gateの必須性' },
    { key: 'open_questions', label: '未決事項' },
    { key: 'codex_next_action', label: 'CODEXの次アクション' }
  ];
  let lastPersistedContext = null;

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function now() {
    return new Date().toISOString();
  }

  function uuid() {
    if (global.crypto && typeof global.crypto.randomUUID === 'function') {
      return global.crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (char) {
      const value = Math.random() * 16 | 0;
      return (char === 'x' ? value : (value & 0x3 | 0x8)).toString(16);
    });
  }

  function validationResult(context) {
    const missing_fields = REQUIRED_FIELDS.filter(function (key) {
      return !context || !Object.prototype.hasOwnProperty.call(context, key);
    });
    return {
      ok: missing_fields.length === 0,
      missing_fields: missing_fields,
      error: missing_fields.length ? 'Missing required fields: ' + missing_fields.join(', ') : ''
    };
  }

  function assertValid(context) {
    const result = validationResult(context);
    if (!result.ok) {
      const error = new Error(result.error);
      error.missing_fields = result.missing_fields;
      throw error;
    }
    return context;
  }

  function createWatchtowerGate() {
    return {
      required_before_edit: true,
      status: 'pending',
      last_checked_at: '',
      checked_by: '',
      signature: '',
      intent: '',
      result_summary: '',
      blocked_reason: '',
      fallback_checks: []
    };
  }

  function createWatchtowerValidationChecks() {
    return [
      {
        check_id: 'vc-wt-gate',
        label: 'WT実行または代替ゲート完了',
        description: '編集前後にWATCHTOWERを実行する。実行不能時は理由と代替チェックをwatchtower_gateへ記録する',
        status: 'pending',
        tested_by: '',
        tested_at: '',
        notes: ''
      },
      {
        check_id: 'vc-wt-registration',
        label: '変更対象がWT監視登録済み',
        description: '変更対象アプリがWATCHTOWERの監視対象であり、診断APIを公開していることを確認する',
        status: 'pending',
        tested_by: '',
        tested_at: '',
        notes: ''
      },
      {
        check_id: 'vc-reading-questions',
        label: '共通読解質問セットが定義済み',
        description: '全AIへ同じ5問を提示できる構造がbridge-context.jsonに含まれていることを確認する',
        status: 'pending',
        tested_by: '',
        tested_at: '',
        notes: ''
      },
      {
        check_id: 'vc-consensus-coverage',
        label: '複数AI回答による認識同期検証',
        description: '2つ以上のagent_responsesを収集し、evaluate_consensus()で一致と不一致を評価する',
        status: 'pending',
        tested_by: '',
        tested_at: '',
        notes: ''
      },
      {
        check_id: 'vc-disagreement-detection',
        label: '意図的認識ズレの検出',
        description: '本番consensusを変更せず、単一項目のテストズレをactive_disagreementsとして検出できることを確認する',
        status: 'pending',
        tested_by: '',
        tested_at: '',
        notes: ''
      },
      {
        check_id: 'vc-current-truth-snapshot',
        label: 'Current Truth Snapshot凍結',
        description: '本番consensusのshared_understandingから現在地圧縮snapshotを生成し、testログを混入させないことを確認する',
        status: 'pending',
        tested_by: '',
        tested_at: '',
        notes: ''
      },
      {
        check_id: 'vc-semantic-packet',
        label: 'Semantic Packet保存と引き継ぎ',
        description: '重要な決定・知見・注意事項をsemantic_packetsへ保存し、Handoffで最新情報を参照できることを確認する',
        status: 'pending',
        tested_by: '',
        tested_at: '',
        notes: ''
      },
      {
        check_id: 'vc-packet-memory-link',
        label: 'PacketからMemory Graphへの昇格',
        description: 'Semantic Packet由来のノードがsource_packet_idを保持し、元Packetを書き換えずに追跡できることを確認する',
        status: 'pending',
        tested_by: '',
        tested_at: '',
        notes: ''
      },
      {
        check_id: 'vc-memory-edge-validation',
        label: 'Memory Graph edge検証フロー',
        description: '関係性の理由を提案として記録し、検証済みproposalからのみ正式edgeを追加できることを確認する',
        status: 'pending',
        tested_by: '',
        tested_at: '',
        notes: ''
      },
      {
        check_id: 'vc-ai-boot-protocol',
        label: 'AI Boot Protocol参加完了',
        description: '新しいAIが定義済みの読解順序を確認し、必須応答を返して参加完了を構造化できることを確認する',
        status: 'pending',
        tested_by: '',
        tested_at: '',
        notes: ''
      },
      {
        check_id: 'vc-canonical-freshness',
        label: 'Canonical Current State freshness検証',
        description: 'Boot responseのcontext_basisをcanonical_current_stateと照合し、古いcontextでの編集着手を防止する',
        status: 'pending',
        tested_by: '',
        tested_at: '',
        notes: ''
      },
      {
        check_id: 'vc-recovery-checkpoint',
        label: 'Recovery Checkpoint保存と復旧',
        description: 'canonical_current_stateと一致する安全な再開地点を1件保存し、次の単一アクションを復旧AIへ渡せることを確認する',
        status: 'pending',
        tested_by: '',
        tested_at: '',
        notes: ''
      }
    ];
  }

  function createReadingVerificationQuestions() {
    return [
      { question_id: 'rq-001', prompt: 'このプロジェクトの主目的は？', answer_key: 'primary_goal' },
      { question_id: 'rq-002', prompt: '今のフェーズは？', answer_key: 'current_phase' },
      { question_id: 'rq-003', prompt: 'WT Gate は mandatory？', answer_key: 'watchtower_gate_mandatory' },
      { question_id: 'rq-004', prompt: '未決事項は？', answer_key: 'open_questions' },
      { question_id: 'rq-005', prompt: '今 CODEX がやるべき事は？', answer_key: 'codex_next_action' }
    ];
  }

  function createConsensusState() {
    return {
      agreement_level: 0.0,
      shared_understanding: [],
      active_disagreements: [],
      last_consensus_check: ''
    };
  }

  function createConsensusTestLog() {
    return [];
  }

  function createCurrentTruthSnapshot() {
    return null;
  }

  function createAiBootProtocol() {
    return {
      protocol_id: 'ai-boot-v1',
      protocol_version: '1.5',
      read_order: [
      'canonical_current_state',
      'watchtower_gate',
      'current_human_directive',
      'semantic_packets',
        'handoff',
        'recovery_checkpoint',
        'current_truth_snapshot',
        'memory_graph_lite.edges',
        'agent_responses / consensus_test_log only if needed'
      ],
      required_response_fields: [
        'confirm_current_goal',
        'confirm_phase',
        'confirm_open_risks',
        'declare_intended_action',
        'whether_wt_required',
        'context_basis'
      ],
      participation_rule: 'Participation completes only after the AI confirms every read_order entry and returns all required response fields.',
      boot_responses: []
    };
  }

  function createCanonicalCurrentState() {
    return null;
  }

  function createRecoveryCheckpoint() {
    return null;
  }

  function createHumanDirective() {
    return {
      directive_id: '',
      issued_at: '',
      issued_by: 'Human',
      content: '',
      target_agents: MISSION_CONTROL_AGENTS.slice(),
      delivery_mode: 'manual_broadcast',
      source_packet_id: ''
    };
  }

  function ensureStructures(context) {
    context.semantic_packets = Array.isArray(context.semantic_packets) ? context.semantic_packets : [];
    context.failure_log = Array.isArray(context.failure_log) ? context.failure_log : [];
    context.agent_responses = Array.isArray(context.agent_responses) ? context.agent_responses : [];
    context.validation_checklist = Array.isArray(context.validation_checklist) ? context.validation_checklist : [];
    context.change_log = Array.isArray(context.change_log) ? context.change_log : [];
    context.reading_verification_questions = Array.isArray(context.reading_verification_questions)
      ? context.reading_verification_questions : createReadingVerificationQuestions();
    context.consensus_state = context.consensus_state || createConsensusState();
    context.consensus_state.shared_understanding = Array.isArray(context.consensus_state.shared_understanding)
      ? context.consensus_state.shared_understanding : [];
    context.consensus_state.active_disagreements = Array.isArray(context.consensus_state.active_disagreements)
      ? context.consensus_state.active_disagreements : [];
    context.consensus_test_log = Array.isArray(context.consensus_test_log)
      ? context.consensus_test_log : createConsensusTestLog();
    context.current_truth_snapshot = context.current_truth_snapshot || createCurrentTruthSnapshot();
    context.canonical_current_state = context.canonical_current_state || createCanonicalCurrentState();
    context.recovery_checkpoint = context.recovery_checkpoint || createRecoveryCheckpoint();
    context.current_human_directive = context.current_human_directive || createHumanDirective();
    context.current_human_directive.target_agents = Array.isArray(context.current_human_directive.target_agents)
      ? context.current_human_directive.target_agents.map(String) : MISSION_CONTROL_AGENTS.slice();
    context.ai_boot_protocol = context.ai_boot_protocol || createAiBootProtocol();
    context.ai_boot_protocol.read_order = Array.isArray(context.ai_boot_protocol.read_order)
      ? context.ai_boot_protocol.read_order : createAiBootProtocol().read_order;
    if (!context.ai_boot_protocol.read_order.includes('current_human_directive')) {
      context.ai_boot_protocol.read_order.splice(2, 0, 'current_human_directive');
    }
    context.ai_boot_protocol.required_response_fields = Array.isArray(context.ai_boot_protocol.required_response_fields)
      ? context.ai_boot_protocol.required_response_fields : createAiBootProtocol().required_response_fields;
    context.ai_boot_protocol.boot_responses = Array.isArray(context.ai_boot_protocol.boot_responses)
      ? context.ai_boot_protocol.boot_responses : [];
    context.ai_boot_log = Array.isArray(context.ai_boot_log) ? context.ai_boot_log : [];
    context.watchtower_gate = context.watchtower_gate || createWatchtowerGate();
    context.watchtower_gate.fallback_checks = Array.isArray(context.watchtower_gate.fallback_checks)
      ? context.watchtower_gate.fallback_checks : [];
    createWatchtowerValidationChecks().forEach(function (requiredCheck) {
      if (!context.validation_checklist.some(function (check) { return check.check_id === requiredCheck.check_id; })) {
        context.validation_checklist.push(requiredCheck);
      }
    });
    context.memory_graph_lite = context.memory_graph_lite || { nodes: [], edge_proposals: [], edges: [] };
    context.memory_graph_lite.nodes = Array.isArray(context.memory_graph_lite.nodes) ? context.memory_graph_lite.nodes : [];
    context.memory_graph_lite.edge_proposals = Array.isArray(context.memory_graph_lite.edge_proposals) ? context.memory_graph_lite.edge_proposals : [];
    context.memory_graph_lite.edges = Array.isArray(context.memory_graph_lite.edges) ? context.memory_graph_lite.edges : [];
    return context;
  }

  function bridge_init(project_name, human_intent, session_mode) {
    const context = {
      bridge_version: BRIDGE_VERSION,
      generated_at: now(),
      project: {
        name: String(project_name || 'BRIDGE'),
        purpose: 'AI conversation, context sharing, and multi-AI coordination protocol',
        design_rule: 'AI-readable structure first, human UI later'
      },
      task_frame: {
        task_id: uuid(),
        status: 'active',
        session_mode: String(session_mode || ''),
        human_intent: String(human_intent || ''),
        goal: { primary: '', secondary: [] },
        constraints: [],
        priorities: [],
        stage: ''
      },
      semantic_packets: [],
      failure_log: [],
      agent_responses: [],
      reading_verification_questions: createReadingVerificationQuestions(),
      consensus_state: createConsensusState(),
      consensus_test_log: createConsensusTestLog(),
      current_truth_snapshot: createCurrentTruthSnapshot(),
      canonical_current_state: createCanonicalCurrentState(),
      recovery_checkpoint: createRecoveryCheckpoint(),
      current_human_directive: createHumanDirective(),
      ai_boot_protocol: createAiBootProtocol(),
      ai_boot_log: [],
      validation_checklist: createWatchtowerValidationChecks(),
      change_log: [],
      watchtower_gate: createWatchtowerGate(),
      handoff: {
        generated_at: now(),
        from_agent: '',
        what_is_decided: [],
        what_is_open: [],
        recommended_next_actions: [],
        target_agents: []
      },
      memory_graph_lite: { nodes: [], edge_proposals: [], edges: [] },
      shortcuts: [],
      ai_profiles: [],
      roundtable_stub: {
        enabled: false,
        participants: [],
        agenda: [],
        status: 'not-started'
      }
    };
    lastPersistedContext = clone(context);
    return context;
  }

  async function bridge_load(filepath) {
    let jsonText;
    if (filepath && typeof filepath.text === 'function') {
      jsonText = await filepath.text();
    } else {
      const response = await fetch(String(filepath || './bridge-context.json'));
      if (!response.ok) throw new Error('Unable to load bridge context: HTTP ' + response.status);
      jsonText = await response.text();
    }
    const context = ensureStructures(assertValid(JSON.parse(jsonText)));
    lastPersistedContext = clone(context);
    return context;
  }

  function downloadJson(json, filename) {
    if (!global.document) return;
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
  }

  function safeTimestamp(value) {
    return value.replace(/[:.]/g, '-');
  }

  function bridge_save(context, filepath, options) {
    const saveOptions = options || {};
    const updated = ensureStructures(assertValid(clone(context)));
    const exportedAt = now();
    const savedAt = updated.canonical_current_state ? String(updated.generated_at || exportedAt) : exportedAt;
    const filename = String(filepath || 'bridge-context.json').split(/[\\/]/).pop() || 'bridge-context.json';
    const backupFilename = 'bridge-context.' + safeTimestamp(exportedAt) + '.bak.json';
    const backup = lastPersistedContext || clone(updated);
    updated.bridge_version = BRIDGE_VERSION;
    updated.generated_at = savedAt;
    const backupJson = JSON.stringify(backup, null, 2) + '\n';
    const json = JSON.stringify(updated, null, 2) + '\n';
    if (saveOptions.download !== false) {
      downloadJson(backupJson, backupFilename);
      downloadJson(json, filename);
    }
    lastPersistedContext = clone(updated);
    return { context: updated, filename: filename, backupFilename: backupFilename, json: json, backupJson: backupJson };
  }

  function add_semantic_packet(context, packet, boot_id) {
    const input = packet || {};
    authorize_ai_operation(context, boot_id, FRICTION_PACKET_TYPES.includes(input.type) ? 'propose' : 'edit');
    ensureStructures(assertValid(context));
    if (!PACKET_TYPES.includes(input.type)) throw new Error('Invalid semantic packet type: ' + input.type);
    if (!String(input.content || '').trim()) throw new Error('Semantic packet content is required');
    const confidence = Number(input.confidence);
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      throw new Error('confidence must be a float from 0.0 to 1.0');
    }
    const frictionScore = input.friction_score === undefined || input.friction_score === null
      ? null : Number(input.friction_score);
    if (frictionScore !== null && (!Number.isFinite(frictionScore) || frictionScore < 0 || frictionScore > 1)) {
      throw new Error('friction_score must be null or a float from 0.0 to 1.0');
    }
    const severity = String(input.severity || '');
    if (severity && !FRICTION_SEVERITIES.includes(severity)) {
      throw new Error('friction severity must be low, medium, or high');
    }
    const created = {
      packet_id: String(input.packet_id || 'sp-' + uuid()),
      created_at: now(),
      source_agent: String(input.source_agent || ''),
      type: input.type,
      content: String(input.content || ''),
      confidence: confidence,
      provenance: String(input.provenance || ''),
      tags: Array.isArray(input.tags) ? input.tags.map(String) : [],
      related_packets: Array.isArray(input.related_packets) ? input.related_packets.map(String) : [],
      category: String(input.category || ''),
      severity: severity,
      friction_score: frictionScore,
      suggested_fix: String(input.suggested_fix || '')
    };
    context.semantic_packets.push(created);
    return created;
  }

  function record_ai_friction(context, feedback, boot_id) {
    authorize_ai_operation(context, boot_id, 'propose');
    ensureStructures(assertValid(context));
    const input = feedback || {};
    const type = String(input.type || '');
    if (!FRICTION_PACKET_TYPES.includes(type)) {
      throw new Error('AI friction type must be wish or complaint');
    }
    if (!String(input.content || '').trim()) {
      throw new Error('AI friction content is required');
    }
    if (!String(input.source_agent || '').trim()) {
      throw new Error('AI friction source_agent is required');
    }
    return add_semantic_packet(context, {
      source_agent: input.source_agent,
      type: type,
      content: input.content,
      confidence: input.confidence === undefined ? 0.8 : input.confidence,
      provenance: input.provenance || 'AI friction feedback',
      tags: Array.isArray(input.tags) ? input.tags : ['ai-friction'],
      related_packets: Array.isArray(input.related_packets) ? input.related_packets : [],
      category: input.category || '',
      severity: input.severity || '',
      friction_score: input.friction_score,
      suggested_fix: input.suggested_fix || ''
    }, boot_id);
  }

  function record_failure(context, failure, boot_id) {
    authorize_ai_operation(context, boot_id, 'propose');
    ensureStructures(assertValid(context));
    const input = failure || {};
    const sourceAgent = String(input.source_agent || '').trim();
    const failureType = String(input.failure_type || '');
    const severity = String(input.severity || '');
    const summary = String(input.summary || '').trim();
    const detectedBy = String(input.detected_by || '').trim();
    const status = String(input.status || 'open');
    if (!sourceAgent) throw new Error('Failure source_agent is required');
    if (!FAILURE_TYPES.includes(failureType)) throw new Error('Invalid failure_type: ' + failureType);
    if (!FAILURE_SEVERITIES.includes(severity)) throw new Error('Invalid failure severity: ' + severity);
    if (!summary) throw new Error('Failure summary is required');
    if (!detectedBy) throw new Error('Failure detected_by is required');
    if (!FAILURE_STATUSES.includes(status)) throw new Error('Invalid failure status: ' + status);
    const created = {
      failure_id: String(input.failure_id || 'fl-' + uuid()),
      occurred_at: String(input.occurred_at || now()),
      source_agent: sourceAgent,
      failure_type: failureType,
      severity: severity,
      summary: summary,
      cause: String(input.cause || ''),
      detected_by: detectedBy,
      affected_surfaces: Array.isArray(input.affected_surfaces) ? input.affected_surfaces.map(String) : [],
      recovery_action: String(input.recovery_action || ''),
      prevention_rule: String(input.prevention_rule || ''),
      related_packet_id: String(input.related_packet_id || ''),
      related_checkpoint_id: String(input.related_checkpoint_id || ''),
      status: status
    };
    context.failure_log.push(created);
    return created;
  }

  function list_recent_failures(context, limit) {
    assertValid(context);
    const failures = Array.isArray(context.failure_log) ? context.failure_log : [];
    const parsedLimit = limit === undefined ? 5 : Number(limit);
    const safeLimit = Number.isFinite(parsedLimit) && parsedLimit >= 0 ? Math.floor(parsedLimit) : 5;
    return failures.slice().reverse().slice(0, safeLimit).map(function (entry) {
      return clone(entry);
    });
  }

  function readConfidence(value) {
    const confidence = Number(value);
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      throw new Error('confidence must be a float from 0.0 to 1.0');
    }
    return confidence;
  }

  function latestSemanticPacketId(context) {
    return context.semantic_packets.length ? context.semantic_packets[context.semantic_packets.length - 1].packet_id : '';
  }

  function authorize_ai_operation(context, boot_id, operation) {
    if (!boot_id) return true;
    ensureStructures(assertValid(context));
    const boot = context.ai_boot_log.find(function (entry) { return entry.boot_id === boot_id; });
    if (!boot) throw new Error('AI Boot log entry not found: ' + boot_id);
    if (boot.status === 'fresh') return true;
    if (boot.status === 'completed_with_warning' && operation === 'propose') return true;
    throw new Error('AI Boot access denied for ' + operation + ': ' + boot.status);
  }

  function add_agent_response(context, response, boot_id) {
    authorize_ai_operation(context, boot_id, 'edit');
    ensureStructures(assertValid(context));
    const input = response || {};
    const answers = input.reading_answers || {};
    const created = {
      response_id: String(input.response_id || uuid()),
      created_at: now(),
      agent: String(input.agent || ''),
      understood_goal: String(input.understood_goal || ''),
      understood_current_state: String(input.understood_current_state || ''),
      concerns: Array.isArray(input.concerns) ? input.concerns.map(String) : [],
      suggested_next_actions: Array.isArray(input.suggested_next_actions) ? input.suggested_next_actions.map(String) : [],
      confidence: readConfidence(input.confidence),
      reading_answers: {
        primary_goal: String(answers.primary_goal || input.understood_goal || ''),
        current_phase: String(answers.current_phase || ''),
        watchtower_gate_mandatory: answers.watchtower_gate_mandatory === true || answers.watchtower_gate_mandatory === false
          ? answers.watchtower_gate_mandatory : String(answers.watchtower_gate_mandatory || ''),
        open_questions: Array.isArray(answers.open_questions) ? answers.open_questions.map(String) : [],
        codex_next_action: String(answers.codex_next_action || '')
      }
    };
    context.agent_responses.push(created);
    return created;
  }

  function validate_context_freshness(context, boot_response) {
    ensureStructures(assertValid(context));
    const pointer = context.canonical_current_state;
    const basis = (boot_response || {}).context_basis;
    const mismatches = [];
    function mismatch(field, expected, seen, severity) {
      mismatches.push({ field: field, expected: String(expected || ''), seen: String(seen || ''), severity: severity });
    }
    if (!pointer) {
      mismatch('canonical_current_state', 'present', 'missing', 'critical');
    }
    if (!basis) {
      mismatch('context_basis', 'present', 'missing', 'critical');
    }
    if (pointer && pointer.bridge_version !== context.bridge_version) {
      mismatch('bridge_version', pointer.bridge_version, context.bridge_version, 'critical');
    }
    if (pointer && basis) {
      const requiredBasis = [
        'bridge_generated_at',
        'canonical_pointer_updated_at',
        'canonical_pointer_version_seen',
        'handoff_generated_at',
        'snapshot_id',
        'snapshot_frozen_at',
        'latest_semantic_packet_id_seen',
        'watchtower_gate_status_seen',
        'watchtower_gate_last_checked_at_seen'
      ];
      requiredBasis.forEach(function (field) {
        if (!Object.prototype.hasOwnProperty.call(basis, field)) {
          mismatch('context_basis.' + field, 'present', 'missing', 'critical');
        }
      });
      if (String(basis.bridge_generated_at || '') !== String(pointer.bridge_generated_at || '')) {
        mismatch('bridge_generated_at', pointer.bridge_generated_at, basis.bridge_generated_at, 'warning');
      }
      if (String(basis.canonical_pointer_updated_at || '') !== String(pointer.updated_at || '')) {
        mismatch('canonical_current_state.updated_at', pointer.updated_at, basis.canonical_pointer_updated_at, 'warning');
      }
      if (String(basis.canonical_pointer_version_seen || '') !== String(pointer.canonical_pointer_version || '')) {
        mismatch('canonical_current_state.canonical_pointer_version', pointer.canonical_pointer_version, basis.canonical_pointer_version_seen, 'warning');
      }
      if (String(basis.handoff_generated_at || '') !== String(pointer.latest_handoff_generated_at || '')) {
        mismatch('handoff.generated_at', pointer.latest_handoff_generated_at, basis.handoff_generated_at, 'warning');
      }
      if (String(basis.snapshot_id || '') !== String(pointer.latest_snapshot_id || '')) {
        mismatch('current_truth_snapshot.snapshot_id', pointer.latest_snapshot_id, basis.snapshot_id, 'warning');
      }
      if (String(basis.snapshot_frozen_at || '') !== String((context.current_truth_snapshot || {}).frozen_at || '')) {
        mismatch('current_truth_snapshot.frozen_at', (context.current_truth_snapshot || {}).frozen_at, basis.snapshot_frozen_at, 'warning');
      }
      if (String(basis.latest_semantic_packet_id_seen || '') !== String(pointer.latest_semantic_packet_id || '')) {
        mismatch('semantic_packets.latest_packet_id', pointer.latest_semantic_packet_id, basis.latest_semantic_packet_id_seen, 'warning');
      }
      if (String(basis.watchtower_gate_status_seen || '') !== String(pointer.watchtower_gate_current_status || '')) {
        mismatch('watchtower_gate.status', pointer.watchtower_gate_current_status, basis.watchtower_gate_status_seen,
          pointer.watchtower_gate_current_status === 'passed' ? 'critical' : 'warning');
      }
      if (String(basis.watchtower_gate_last_checked_at_seen || '') !== String(pointer.watchtower_gate_last_checked_at || '')) {
        mismatch('watchtower_gate.last_checked_at', pointer.watchtower_gate_last_checked_at, basis.watchtower_gate_last_checked_at_seen, 'warning');
      }
    }
    const severity = mismatches.some(function (entry) { return entry.severity === 'critical'; }) ? 'critical'
      : (mismatches.length ? 'warning' : 'none');
    return {
      status: severity === 'critical' ? 'mismatch' : (severity === 'warning' ? 'stale' : 'fresh'),
      checked_at: now(),
      mismatches: mismatches.map(function (entry) {
        return { field: entry.field, expected: entry.expected, seen: entry.seen };
      }),
      severity: severity,
      recommendation: severity === 'critical'
        ? 'Reject participation and obtain the current canonical context before any work.'
        : (severity === 'warning'
          ? 'Read the current canonical pointer and request Human or CODEX confirmation before editing.'
          : 'Context matches the canonical current state; normal work may proceed.')
    };
  }

  function record_ai_boot_response(context, response) {
    ensureStructures(assertValid(context));
    const input = response || {};
    const protocol = context.ai_boot_protocol;
    const confirmed = Array.isArray(input.read_confirmed) ? input.read_confirmed.map(String) : [];
    const missingReads = protocol.read_order.filter(function (entry) { return !confirmed.includes(entry); });
    const requiredIssues = [];
    protocol.required_response_fields.forEach(function (field) {
      if (field === 'confirm_open_risks') {
        if (!Array.isArray(input[field])) requiredIssues.push(field);
      } else if (field === 'whether_wt_required') {
        if (input[field] !== true && input[field] !== false) requiredIssues.push(field);
      } else if (field === 'context_basis') {
        if (!input[field] || typeof input[field] !== 'object') requiredIssues.push(field);
      } else if (!String(input[field] || '').trim()) {
        requiredIssues.push(field);
      }
    });
    const freshness = validate_context_freshness(context, input);
    if (missingReads.length) {
      freshness.mismatches.push({ field: 'read_confirmed', expected: protocol.read_order.join(' | '), seen: confirmed.join(' | ') });
      freshness.status = 'mismatch';
      freshness.severity = 'critical';
      freshness.recommendation = 'Reject participation until all boot read confirmations are complete.';
    }
    if (requiredIssues.length) {
      freshness.mismatches.push({ field: 'required_response_fields', expected: protocol.required_response_fields.join(' | '), seen: requiredIssues.join(' | ') + ' missing' });
      freshness.status = 'mismatch';
      freshness.severity = 'critical';
      freshness.recommendation = 'Reject participation until all required boot response fields are supplied.';
    }
    const status = freshness.severity === 'critical' ? 'reject'
      : (freshness.severity === 'warning' ? 'completed_with_warning' : 'fresh');
    const accessMode = status === 'fresh' ? 'full_access'
      : (status === 'completed_with_warning' ? 'read_and_propose_only' : 'no_access');
    const created = {
      boot_id: String(input.boot_id || 'boot-' + uuid()),
      completed_at: now(),
      agent: String(input.agent || ''),
      read_confirmed: confirmed,
      confirm_current_goal: String(input.confirm_current_goal || ''),
      confirm_phase: String(input.confirm_phase || ''),
      confirm_open_risks: Array.isArray(input.confirm_open_risks) ? input.confirm_open_risks.map(String) : [],
      declare_intended_action: String(input.declare_intended_action || ''),
      whether_wt_required: input.whether_wt_required,
      context_basis: input.context_basis || null,
      confidence: input.confidence === undefined ? 0 : readConfidence(input.confidence),
      freshness_result: freshness,
      status: status,
      access_mode: accessMode,
      allowed_operations: status === 'fresh'
        ? ['read', 'propose', 'edit']
        : (status === 'completed_with_warning' ? ['read', 'propose'] : [])
    };
    context.ai_boot_log.push(created);
    return created;
  }

  function normalizeConsensusValue(value) {
    if (Array.isArray(value)) {
      return value.map(function (entry) { return String(entry).trim(); }).filter(Boolean).sort().join(' | ').toLowerCase();
    }
    return String(value === undefined || value === null ? '' : value).trim().replace(/\s+/g, ' ').toLowerCase();
  }

  function displayConsensusValue(value) {
    return Array.isArray(value) ? value.join(' / ') : String(value === undefined || value === null ? '' : value);
  }

  function evaluate_consensus(context) {
    ensureStructures(assertValid(context));
    const responses = context.agent_responses;
    const shared = [];
    const disagreements = [];
    if (responses.length >= 2) {
      CONSENSUS_TOPICS.forEach(function (topic) {
        const entries = responses.map(function (response) {
          const value = response.reading_answers ? response.reading_answers[topic.key] : '';
          return { agent: response.agent, value: displayConsensusValue(value), normalized: normalizeConsensusValue(value) };
        });
        const filled = entries.filter(function (entry) { return entry.normalized !== ''; });
        const values = Array.from(new Set(filled.map(function (entry) { return entry.normalized; })));
        if (filled.length === responses.length && values.length === 1) {
          shared.push({ topic: topic.key, label: topic.label, value: filled[0].value, agents: entries.map(function (entry) { return entry.agent; }) });
        } else {
          disagreements.push({
            topic: topic.key,
            label: topic.label,
            responses: entries.map(function (entry) { return { agent: entry.agent, value: entry.value }; })
          });
        }
      });
    }
    context.consensus_state = {
      agreement_level: responses.length >= 2 ? Number((shared.length / CONSENSUS_TOPICS.length).toFixed(2)) : 0.0,
      shared_understanding: shared,
      active_disagreements: disagreements,
      last_consensus_check: now()
    };
    return context.consensus_state;
  }

  function run_disagreement_detection_test(context, response, expected_topic) {
    assertValid(context);
    const baselineConsensus = clone(context.consensus_state || createConsensusState());
    const baselineResponses = clone(Array.isArray(context.agent_responses) ? context.agent_responses : []);
    const working = ensureStructures(assertValid(clone(context)));
    const testResponse = Object.assign({}, response || {});
    testResponse.response_id = String(testResponse.response_id || 'test-divergent-' + uuid());
    const added = add_agent_response(working, testResponse);
    const observed = evaluate_consensus(working);
    const expectedTopic = String(expected_topic || 'watchtower_gate_mandatory');
    const expectedAgreement = Number(((CONSENSUS_TOPICS.length - 1) / CONSENSUS_TOPICS.length).toFixed(2));
    const detectedTopics = observed.active_disagreements.map(function (entry) { return entry.topic; });
    const passed = observed.agreement_level === expectedAgreement
      && observed.shared_understanding.length === CONSENSUS_TOPICS.length - 1
      && detectedTopics.length === 1
      && detectedTopics[0] === expectedTopic;
    return {
      test_id: 'dt-' + uuid(),
      run_at: now(),
      test_type: 'intentional-single-topic-divergence',
      isolated_from_production_consensus: true,
      test_response: added,
      expected: {
        agreement_level: expectedAgreement,
        disagreement_topic: expectedTopic,
        shared_understanding_count: CONSENSUS_TOPICS.length - 1
      },
      observed: {
        agreement_level: observed.agreement_level,
        shared_understanding: observed.shared_understanding,
        active_disagreements: observed.active_disagreements
      },
      baseline: {
        agents: baselineResponses.map(function (entry) { return entry.agent; }),
        agreement_level: baselineConsensus.agreement_level
      },
      passed: passed
    };
  }

  function freeze_current_truth_snapshot(context, boot_id) {
    authorize_ai_operation(context, boot_id, 'edit');
    ensureStructures(assertValid(context));
    const consensus = context.consensus_state || createConsensusState();
    if (!Array.isArray(consensus.shared_understanding) || consensus.shared_understanding.length === 0) {
      throw new Error('Cannot freeze current truth snapshot without shared consensus understanding');
    }
    const values = {};
    const validators = [];
    consensus.shared_understanding.forEach(function (entry) {
      values[entry.topic] = entry.value;
      (entry.agents || []).forEach(function (agent) {
        if (!validators.includes(agent)) validators.push(agent);
      });
    });
    context.current_truth_snapshot = {
      snapshot_id: 'cts-' + uuid(),
      frozen_at: now(),
      agreement_level: consensus.agreement_level,
      validated_by: validators,
      primary_goal: String(values.primary_goal || ''),
      current_phase: String(values.current_phase || ''),
      watchtower_gate_mandatory: normalizeConsensusValue(values.watchtower_gate_mandatory) === 'true',
      open_questions: values.open_questions
        ? String(values.open_questions).split(/\s*\/\s*/).filter(Boolean)
        : [],
      codex_next_action: String(values.codex_next_action || ''),
      source_consensus_check: String(consensus.last_consensus_check || ''),
      notes: 'Compressed from production consensus_state.shared_understanding only; consensus_test_log is excluded.'
    };
    return context.current_truth_snapshot;
  }

  function add_validation_check(context, check, boot_id) {
    authorize_ai_operation(context, boot_id, 'edit');
    ensureStructures(assertValid(context));
    const input = check || {};
    const status = input.status || 'pending';
    if (!VALIDATION_STATUSES.includes(status)) throw new Error('Invalid validation status: ' + status);
    const created = {
      check_id: uuid(),
      label: String(input.label || ''),
      description: String(input.description || ''),
      status: status,
      tested_by: String(input.tested_by || ''),
      tested_at: input.tested_at ? String(input.tested_at) : '',
      notes: String(input.notes || '')
    };
    context.validation_checklist.push(created);
    return created;
  }

  function update_validation_status(context, check_id, status, tested_by, notes, boot_id) {
    authorize_ai_operation(context, boot_id, 'edit');
    ensureStructures(assertValid(context));
    if (!VALIDATION_STATUSES.includes(status)) throw new Error('Invalid validation status: ' + status);
    const check = context.validation_checklist.find(function (entry) { return entry.check_id === check_id; });
    if (!check) throw new Error('Validation check not found: ' + check_id);
    check.status = status;
    check.tested_by = String(tested_by || '');
    check.tested_at = now();
    check.notes = String(notes || '');
    return check;
  }

  function add_change_log(context, change, boot_id) {
    authorize_ai_operation(context, boot_id, 'edit');
    ensureStructures(assertValid(context));
    const input = change || {};
    const created = {
      change_id: uuid(),
      changed_at: now(),
      changed_by: String(input.changed_by || ''),
      summary: String(input.summary || ''),
      reason: String(input.reason || ''),
      affected_fields: Array.isArray(input.affected_fields) ? input.affected_fields.map(String) : []
    };
    context.change_log.push(created);
    return created;
  }

  function update_canonical_current_state(context, pointer) {
    ensureStructures(assertValid(context));
    const input = pointer || {};
    const updatedBy = String(input.updated_by || '');
    if (!/(^|\/|\s)(Human|CODEX)(\s|\/|$)/.test(updatedBy)) {
      throw new Error('canonical_current_state may only be updated by Human or CODEX');
    }
    const packet = add_semantic_packet(context, {
      source_agent: updatedBy,
      type: 'decision',
      content: 'canonical pointer updated: current authoritative surfaces and WATCHTOWER Gate status were refreshed.',
      confidence: 1,
      provenance: 'update_canonical_current_state()',
      tags: ['canonical-pointer', 'freshness', 'v' + BRIDGE_VERSION],
      related_packets: []
    });
    const snapshot = context.current_truth_snapshot || {};
    const gate = context.watchtower_gate || createWatchtowerGate();
    context.canonical_current_state = {
      canonical_pointer_version: String(input.canonical_pointer_version || '1.0'),
      updated_at: String(input.updated_at || now()),
      updated_by: updatedBy,
      authority: 'manual-canonical-pointer',
      bridge_version: String(input.bridge_version || context.bridge_version),
      bridge_generated_at: String(input.bridge_generated_at || context.generated_at || ''),
      latest_snapshot_id: String(input.latest_snapshot_id || snapshot.snapshot_id || ''),
      latest_handoff_generated_at: String(input.latest_handoff_generated_at || (context.handoff || {}).generated_at || ''),
      latest_semantic_packet_id: packet.packet_id,
      watchtower_gate_current_status: String(input.watchtower_gate_current_status || gate.status || ''),
      watchtower_gate_last_checked_at: String(input.watchtower_gate_last_checked_at || gate.last_checked_at || ''),
      current_truth_priority: [
        'canonical_current_state',
        'watchtower_gate',
        'current_human_directive',
        'latest_semantic_packets',
        'handoff',
        'recovery_checkpoint',
        'current_truth_snapshot',
        'memory_graph_lite'
      ],
      notes: String(input.notes || '')
    };
    add_change_log(context, {
      changed_by: updatedBy,
      summary: 'canonical_current_state pointer updated',
      reason: String(input.reason || 'Refresh the authoritative current-state pointer for AI Boot freshness validation.'),
      affected_fields: ['canonical_current_state', 'semantic_packets', 'watchtower_gate']
    });
    return context.canonical_current_state;
  }

  function validate_recovery_checkpoint(context, checkpoint) {
    assertValid(context);
    const saved = checkpoint === undefined ? context.recovery_checkpoint : checkpoint;
    const pointer = context.canonical_current_state;
    const issues = [];
    function issue(field, expected, seen, severity) {
      issues.push({ field: field, expected: String(expected || ''), seen: String(seen || ''), severity: severity });
    }
    if (!saved) issue('recovery_checkpoint', 'present', 'missing', 'critical');
    if (!pointer) issue('canonical_current_state', 'present', 'missing', 'critical');
    if (saved) {
      if (!RECOVERY_WORK_STATUSES.includes(saved.work_status)) {
        issue('recovery_checkpoint.work_status', RECOVERY_WORK_STATUSES.join(' | '), saved.work_status, 'critical');
      }
      if (!RECOVERY_ACCESS_MODES.includes(saved.access_mode_at_save)) {
        issue('recovery_checkpoint.access_mode_at_save', RECOVERY_ACCESS_MODES.join(' | '), saved.access_mode_at_save, 'critical');
      }
      const pending = Array.isArray(saved.pending_actions) ? saved.pending_actions : [];
      if (!Array.isArray(saved.pending_actions)) {
        issue('recovery_checkpoint.pending_actions', 'array', 'missing', 'critical');
      } else if (['in_progress', 'blocked'].includes(saved.work_status) && !String(pending[0] || '').trim()) {
        issue('recovery_checkpoint.pending_actions[0]', 'next single action', 'missing', 'critical');
      }
    }
    if (saved && pointer) {
      if (String(saved.bridge_version || '') !== String(pointer.bridge_version || '')) {
        issue('recovery_checkpoint.bridge_version', pointer.bridge_version, saved.bridge_version, 'critical');
      }
      if (String(saved.canonical_pointer_updated_at || '') !== String(pointer.updated_at || '')) {
        issue('recovery_checkpoint.canonical_pointer_updated_at', pointer.updated_at, saved.canonical_pointer_updated_at, 'warning');
      }
      if (String(saved.handoff_generated_at || '') !== String(pointer.latest_handoff_generated_at || '')) {
        issue('recovery_checkpoint.handoff_generated_at', pointer.latest_handoff_generated_at, saved.handoff_generated_at, 'warning');
      }
    }
    const severity = issues.some(function (entry) { return entry.severity === 'critical'; }) ? 'critical'
      : (issues.length ? 'warning' : 'none');
    return {
      status: severity === 'critical' ? 'invalid' : (severity === 'warning' ? 'stale' : 'valid'),
      checked_at: now(),
      issues: issues.map(function (entry) {
        return { field: entry.field, expected: entry.expected, seen: entry.seen };
      }),
      severity: severity,
      recommendation: severity === 'critical'
        ? 'Do not resume work; create a valid checkpoint from the current canonical state.'
        : (severity === 'warning'
          ? 'Refresh the checkpoint from the current canonical state before editing.'
          : 'Resume from pending_actions[0] when work continues.')
    };
  }

  function save_recovery_checkpoint(context, checkpoint, boot_id) {
    authorize_ai_operation(context, boot_id, 'edit');
    ensureStructures(assertValid(context));
    const input = checkpoint || {};
    const savedBy = String(input.saved_by || '');
    if (!/(^|\/|\s)(Human|CODEX)(\s|\/|$)/.test(savedBy)) {
      throw new Error('recovery_checkpoint may only be saved by Human or CODEX');
    }
    if (!context.canonical_current_state) {
      throw new Error('Cannot save recovery checkpoint without canonical_current_state');
    }
    if (!RECOVERY_WORK_STATUSES.includes(input.work_status)) {
      throw new Error('Invalid recovery checkpoint work_status: ' + input.work_status);
    }
    if (!RECOVERY_ACCESS_MODES.includes(input.access_mode_at_save)) {
      throw new Error('Invalid recovery checkpoint access_mode_at_save: ' + input.access_mode_at_save);
    }
    const pending = Array.isArray(input.pending_actions) ? input.pending_actions.map(String) : [];
    if (['in_progress', 'blocked'].includes(input.work_status) && !String(pending[0] || '').trim()) {
      throw new Error('pending_actions[0] must contain the next single action while work is not completed');
    }
    const pointer = context.canonical_current_state;
    context.recovery_checkpoint = {
      checkpoint_id: String(input.checkpoint_id || 'rc-' + uuid()),
      saved_at: String(input.saved_at || now()),
      saved_by: savedBy,
      bridge_version: String(pointer.bridge_version || context.bridge_version),
      canonical_pointer_updated_at: String(pointer.updated_at || ''),
      work_status: input.work_status,
      access_mode_at_save: input.access_mode_at_save,
      active_task: String(input.active_task || ''),
      completed_actions: Array.isArray(input.completed_actions) ? input.completed_actions.map(String) : [],
      pending_actions: pending,
      blocking_issues: Array.isArray(input.blocking_issues) ? input.blocking_issues.map(String) : [],
      last_safe_operation: String(input.last_safe_operation || ''),
      handoff_generated_at: String(pointer.latest_handoff_generated_at || ''),
      notes: String(input.notes || '')
    };
    const validation = validate_recovery_checkpoint(context);
    if (validation.status !== 'valid') {
      context.recovery_checkpoint = null;
      throw new Error('Recovery checkpoint is not aligned with canonical current state');
    }
    add_change_log(context, {
      changed_by: savedBy,
      summary: 'recovery_checkpoint saved',
      reason: String(input.reason || 'Preserve the latest safe resumption point for interrupted AI work.'),
      affected_fields: ['recovery_checkpoint']
    }, boot_id);
    return context.recovery_checkpoint;
  }

  function generate_recovery_handoff(context) {
    ensureStructures(assertValid(context));
    const saved = context.recovery_checkpoint;
    const validation = validate_recovery_checkpoint(context);
    if (!saved) throw new Error('Recovery checkpoint not found');
    return [
      '# BRIDGE Recovery Handoff',
      '- checkpoint_id: ' + saved.checkpoint_id,
      '- saved_at: ' + saved.saved_at,
      '- saved_by: ' + saved.saved_by,
      '- work_status: ' + saved.work_status,
      '- access_mode_at_save: ' + saved.access_mode_at_save,
      '- active_task: ' + saved.active_task,
      '- last_safe_operation: ' + saved.last_safe_operation,
      '- next_single_action: ' + (saved.pending_actions[0] || 'none'),
      '- blocking_issues: ' + (saved.blocking_issues.join(' / ') || 'none'),
      '- checkpoint_validation: ' + validation.status + ' / ' + validation.severity
    ].join('\n');
  }

  function update_watchtower_gate(context, gate, boot_id) {
    authorize_ai_operation(context, boot_id, 'edit');
    ensureStructures(assertValid(context));
    const input = gate || {};
    const status = input.status || 'pending';
    if (!WATCHTOWER_GATE_STATUSES.includes(status)) throw new Error('Invalid WATCHTOWER Gate status: ' + status);
    context.watchtower_gate = {
      required_before_edit: input.required_before_edit !== false,
      status: status,
      last_checked_at: status === 'pending' ? '' : now(),
      checked_by: String(input.checked_by || ''),
      signature: String(input.signature || ''),
      intent: String(input.intent || ''),
      result_summary: String(input.result_summary || ''),
      blocked_reason: String(input.blocked_reason || ''),
      fallback_checks: Array.isArray(input.fallback_checks) ? input.fallback_checks.map(String) : []
    };
    return context.watchtower_gate;
  }

  function update_handoff(context, decided, open, next_actions, target_agents, boot_id) {
    authorize_ai_operation(context, boot_id, 'edit');
    assertValid(context);
    context.handoff = {
      generated_at: now(),
      from_agent: context.handoff.from_agent || '',
      what_is_decided: Array.isArray(decided) ? decided : [],
      what_is_open: Array.isArray(open) ? open : [],
      recommended_next_actions: Array.isArray(next_actions) ? next_actions : [],
      target_agents: Array.isArray(target_agents) ? target_agents : []
    };
    return context.handoff;
  }

  function latestAiFreshness(context, agents) {
    ensureStructures(assertValid(context));
    const knownAgents = Array.isArray(agents) && agents.length ? agents.map(String) : MISSION_CONTROL_AGENTS.slice();
    return knownAgents.map(function (agent) {
      const latest = context.ai_boot_log.slice().reverse().find(function (entry) {
        return String(entry.agent || '').toLowerCase() === agent.toLowerCase();
      });
      let status = 'stale';
      if (latest && latest.status === 'fresh') status = 'fresh';
      if (latest && (latest.status === 'completed_with_warning'
        || (latest.freshness_result || {}).status === 'stale')) status = 'warning';
      return {
        agent: agent,
        status: status,
        checked_at: latest ? String(latest.completed_at || latest.created_at || '') : '',
        detail: latest
          ? String(latest.status || 'unknown') + ' / ' + String(latest.access_mode || 'unknown')
          : 'boot record not found'
      };
    });
  }

  function get_mission_control_status(context) {
    ensureStructures(assertValid(context));
    const packets = context.semantic_packets || [];
    const recovery = context.recovery_checkpoint;
    return {
      canonical_current_state: context.canonical_current_state,
      watchtower_gate: context.watchtower_gate,
      latest_semantic_packet: packets.length ? packets[packets.length - 1] : null,
      recovery_checkpoint: recovery,
      recovery_validation: recovery ? validate_recovery_checkpoint(context, recovery) : null,
      ai_freshness: latestAiFreshness(context),
      current_human_directive: context.current_human_directive
    };
  }

  function run_bridge_core_diagnostics(context) {
    assertValid(context);
    const canonical = context.canonical_current_state;
    const packets = Array.isArray(context.semantic_packets) ? context.semantic_packets : [];
    const latestPacket = packets.length ? String(packets[packets.length - 1].packet_id || '') : '';
    const canonicalPacketMatches = !!canonical
      && String(canonical.latest_semantic_packet_id || '') === latestPacket;
    const canonicalStatus = canonical
      && String(canonical.bridge_generated_at || '') === String(context.generated_at || '')
      && canonicalPacketMatches
      ? 'fresh' : 'stale';
    const runtimeVersionMatches = String(context.bridge_version || '') === BRIDGE_VERSION;
    const gateStatus = String((context.watchtower_gate || {}).status || 'pending');
    const latestByAgent = {};
    (Array.isArray(context.ai_boot_log) ? context.ai_boot_log : []).forEach(function (entry) {
      const agent = String(entry.agent || '').trim();
      if (agent) latestByAgent[agent] = entry;
    });
    const agentStatus = {
      fresh_agents: [],
      warning_agents: [],
      stale_agents: [],
      reject_agents: []
    };
    const unknownAgents = [];
    Object.keys(latestByAgent).forEach(function (agent) {
      const boot = latestByAgent[agent];
      let status = String(boot.boot_status || boot.status || '');
      if (status === 'fresh' && boot.context_basis) {
        const currentFreshness = validate_context_freshness(clone(context), boot);
        if (currentFreshness.severity === 'critical') status = 'reject';
        else if (currentFreshness.severity === 'warning') status = 'completed_with_warning';
      }
      if (status === 'fresh') agentStatus.fresh_agents.push(agent);
      else if (status === 'completed_with_warning') agentStatus.warning_agents.push(agent);
      else if (status === 'stale') agentStatus.stale_agents.push(agent);
      else if (status === 'reject') agentStatus.reject_agents.push(agent);
      else unknownAgents.push(agent);
    });
    const recoveryValidation = context.recovery_checkpoint
      ? validate_recovery_checkpoint(clone(context), clone(context.recovery_checkpoint))
      : null;
    const recoveryStatus = recoveryValidation && recoveryValidation.status === 'valid' ? 'valid' : 'invalid';
    const latestHasCriticalSeverity = Object.keys(latestByAgent).some(function (agent) {
      return String(((latestByAgent[agent].freshness_result || {}).severity) || '') === 'critical';
    });
    const critical = latestHasCriticalSeverity
      || !!(recoveryValidation && recoveryValidation.severity === 'critical');
    const warnings = [];
    if (canonicalStatus === 'stale') warnings.push('正本の現在状態が見つからないか、生成日時が一致していません。正本を更新するまで編集を始めないでください。');
    if (canonical && !canonicalPacketMatches) warnings.push('canonical_current_state が最新 Semantic Packet を指していません。pointer='
      + String(canonical.latest_semantic_packet_id || 'none') + ', latest=' + (latestPacket || 'none') + '。正本ポインタを更新してください。');
    if (!runtimeVersionMatches) warnings.push('保存済み context は BRIDGE v' + String(context.bridge_version || 'unknown')
      + '、実行コードは v' + BRIDGE_VERSION + ' です。機能差を確認し、必要なら正本更新を行ってください。');
    if (gateStatus !== 'passed') warnings.push('WATCHTOWER Gate が passed ではありません。status=' + gateStatus + '。編集を始めないでください。');
    if (recoveryStatus === 'invalid') warnings.push('復旧チェックポイントが存在しないか、現在の正本に対して有効ではありません。');
    if (agentStatus.warning_agents.length) warnings.push('注意が必要なAI: ' + agentStatus.warning_agents.join(', ') + '。');
    if (agentStatus.stale_agents.length) warnings.push('古い状態で止まっているAI: ' + agentStatus.stale_agents.join(', ') + '。');
    if (agentStatus.reject_agents.length) warnings.push('参加が拒否されているAI: ' + agentStatus.reject_agents.join(', ') + '。');
    if (unknownAgents.length) warnings.push('状態を分類できないAI: ' + unknownAgents.join(', ') + '。');
    let bridgeStatus = 'healthy';
    if (canonicalStatus === 'stale' || !runtimeVersionMatches || gateStatus !== 'passed'
      || agentStatus.warning_agents.length || agentStatus.stale_agents.length || unknownAgents.length) {
      bridgeStatus = 'warning';
    }
    if (agentStatus.reject_agents.length || critical) bridgeStatus = 'failed';
    return {
      bridge_status: bridgeStatus,
      canonical: canonicalStatus,
      latest_semantic_packet: latestPacket,
      recovery_checkpoint: recoveryStatus,
      agent_status: agentStatus,
      warnings: warnings,
      recommendation: bridgeStatus === 'failed'
        ? '作業を止めてください。参加拒否または重大な文脈エラーを解消してから編集を再開してください。'
        : (bridgeStatus === 'warning'
          ? '注意事項を確認し、正本またはAIの文脈を更新してから編集してください。'
          : 'BRIDGE の基本状態は正常です。現在の人間指示と WT Gate を確認したうえで作業できます。')
    };
  }

  function uniqueStrings(values) {
    return values.filter(function (value, index, array) {
      return value && array.indexOf(value) === index;
    });
  }

  function sameSerializedValue(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
  }

  function extractFunctionBodies(text) {
    const functions = {};
    const matcher = /function\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/g;
    let match;
    while ((match = matcher.exec(text))) {
      let index = matcher.lastIndex;
      let depth = 1;
      let quote = '';
      let lineComment = false;
      let blockComment = false;
      let escaped = false;
      while (index < text.length && depth > 0) {
        const char = text[index];
        const next = text[index + 1];
        if (lineComment) {
          if (char === '\n') lineComment = false;
        } else if (blockComment) {
          if (char === '*' && next === '/') {
            blockComment = false;
            index += 1;
          }
        } else if (quote) {
          if (escaped) escaped = false;
          else if (char === '\\') escaped = true;
          else if (char === quote) quote = '';
        } else if (char === '"' || char === "'" || char === '`') {
          quote = char;
        } else if (char === '/' && next === '/') {
          lineComment = true;
          index += 1;
        } else if (char === '/' && next === '*') {
          blockComment = true;
          index += 1;
        } else if (char === '{') {
          depth += 1;
        } else if (char === '}') {
          depth -= 1;
        }
        index += 1;
      }
      functions[match[1]] = text.slice(match.index, index);
    }
    return functions;
  }

  function extractApiExports(text) {
    const section = /const\s+api\s*=\s*\{([\s\S]*?)\n\s*\};\s*\n\s*global\.BRIDGE/.exec(text);
    if (!section) return [];
    const entries = [];
    const matcher = /^\s*([A-Za-z_$][\w$]*)\s*:/gm;
    let match;
    while ((match = matcher.exec(section[1]))) entries.push(match[1]);
    return uniqueStrings(entries).sort();
  }

  function extractConstants(text) {
    const constants = {};
    const matcher = /\bconst\s+([A-Z][A-Z0-9_]*)\s*=\s*([^;]+);/g;
    let match;
    while ((match = matcher.exec(text))) constants[match[1]] = match[2].replace(/\s+/g, ' ').trim();
    return constants;
  }

  function stripDisplayOnlyChanges(text) {
    return String(text || '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n\r]*/g, '')
      .replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/g, 'TEXT')
      .replace(/\s+/g, '');
  }

  function analyze_bridge_diff(beforeText, afterText, options) {
    const before = String(beforeText == null ? '' : beforeText);
    const after = String(afterText == null ? '' : afterText);
    const input = options || {};
    const surface = String(input.surface || input.filename || input.file || 'unknown');
    const surfaceLower = surface.toLowerCase();
    const kind = String(input.kind || input.type || '').toLowerCase();
    const changed = before !== after;
    const changedFunctions = [];
    const changedApiExports = [];
    const changedConstants = [];
    const changedSchemaFields = [];
    const affectedAreas = [];
    const riskReasons = [];
    const recommendedChecks = [];
    let riskLevel = 'low';

    function affect(area) {
      affectedAreas.push(area);
    }
    function recommend(check) {
      recommendedChecks.push(check);
    }
    function risk(level, reason) {
      if (level === 'high' || (level === 'medium' && riskLevel === 'low')) riskLevel = level;
      riskReasons.push(reason);
    }
    function valuesChanged(beforeValue, afterValue) {
      return !sameSerializedValue(beforeValue, afterValue);
    }

    if (!changed) {
      return {
        diff_status: 'safe',
        changed_surfaces: [],
        changed_functions: [],
        changed_api_exports: [],
        changed_constants: [],
        changed_schema_fields: [],
        affected_areas: [],
        risk_level: 'low',
        risk_reasons: [],
        recommended_checks: [],
        summary: '差分はありません。'
      };
    }

    let beforeJson = null;
    let afterJson = null;
    let jsonParsed = false;
    const intendedJson = kind === 'json' || /\.json$/i.test(surface);
    if (intendedJson || (!kind && !/\.(?:js|html|md)$/i.test(surface))) {
      try {
        beforeJson = JSON.parse(before);
        afterJson = JSON.parse(after);
        jsonParsed = true;
      } catch (error) {
        if (intendedJson) {
          risk('high', '変更後の JSON を解析できません。');
          affect('schema');
          recommend('JSON の構文確認');
        }
      }
    }

    if (jsonParsed) {
      const topFields = uniqueStrings(Object.keys(beforeJson).concat(Object.keys(afterJson))).sort();
      topFields.forEach(function (field) {
        if (valuesChanged(beforeJson[field], afterJson[field])) changedSchemaFields.push(field);
      });
      const protectedFields = ['current_truth_snapshot', 'consensus_state', 'agent_responses'];
      protectedFields.forEach(function (field) {
        if (valuesChanged(beforeJson[field], afterJson[field])) {
          risk('high', field + ' が変更されています。凍結証跡または合意記録の変更を確認してください。');
          affect(field);
        }
      });
      if (valuesChanged(beforeJson.semantic_packets, afterJson.semantic_packets)) {
        const beforePackets = Array.isArray(beforeJson.semantic_packets) ? beforeJson.semantic_packets : [];
        const afterPackets = Array.isArray(afterJson.semantic_packets) ? afterJson.semantic_packets : [];
        const latest = afterPackets.length ? String(afterPackets[afterPackets.length - 1].packet_id || '不明') : 'なし';
        risk('medium', 'semantic_packets が変更されています（件数 ' + beforePackets.length + ' -> ' + afterPackets.length + '、最新 ' + latest + '）。');
        affect('handoff');
        recommend('Handoff 生成確認');
      }
      if (valuesChanged(beforeJson.current_human_directive, afterJson.current_human_directive)) {
        risk('medium', 'current_human_directive が変更されています。手動配布内容を確認してください。');
        affect('mission_control');
        recommend('Broadcast 生成確認');
      }
      if (valuesChanged(beforeJson.ai_boot_log, afterJson.ai_boot_log)) {
        const beforeBoots = Array.isArray(beforeJson.ai_boot_log) ? beforeJson.ai_boot_log.length : 0;
        const afterBoots = Array.isArray(afterJson.ai_boot_log) ? afterJson.ai_boot_log.length : 0;
        risk('medium', 'ai_boot_log が変更されています（件数 ' + beforeBoots + ' -> ' + afterBoots + '）。');
        affect('ai_boot_log');
      }
      if (valuesChanged(beforeJson.canonical_current_state, afterJson.canonical_current_state)) {
        risk('medium', 'canonical_current_state が変更されています。正本ポインタを確認してください。');
        affect('canonical_current_state');
      }
      if (afterJson.canonical_current_state
        && String(afterJson.canonical_current_state.bridge_generated_at || '') !== String(afterJson.generated_at || '')) {
        risk('high', 'canonical_current_state と generated_at が一致していません。');
        affect('canonical_current_state');
      }
      if (valuesChanged(beforeJson.recovery_checkpoint, afterJson.recovery_checkpoint)) {
        risk('medium', 'recovery_checkpoint が変更されています。再開地点を確認してください。');
        affect('recovery_checkpoint');
      }
      if (Object.prototype.hasOwnProperty.call(afterJson, 'recovery_checkpoint')
        || Object.prototype.hasOwnProperty.call(afterJson, 'canonical_current_state')) {
        try {
          const recovery = afterJson.recovery_checkpoint
            ? validate_recovery_checkpoint(clone(afterJson), clone(afterJson.recovery_checkpoint))
            : null;
          if (!recovery || recovery.status !== 'valid') {
            risk('high', '変更後の recovery_checkpoint が有効ではありません。');
            affect('recovery_checkpoint');
          }
        } catch (error) {
          risk('high', '変更後の recovery_checkpoint を検証できません。');
          affect('recovery_checkpoint');
        }
      }
      affect('wt_core');
      recommend('BRIDGE.run_bridge_core_diagnostics(context)');
    } else if (/\.js$/i.test(surface) || kind === 'javascript' || kind === 'js') {
      const beforeFunctions = extractFunctionBodies(before);
      const afterFunctions = extractFunctionBodies(after);
      uniqueStrings(Object.keys(beforeFunctions).concat(Object.keys(afterFunctions))).sort().forEach(function (name) {
        if (beforeFunctions[name] !== afterFunctions[name]) changedFunctions.push(name);
      });
      const beforeExports = extractApiExports(before);
      const afterExports = extractApiExports(after);
      uniqueStrings(beforeExports.concat(afterExports)).sort().forEach(function (name) {
        if (beforeExports.indexOf(name) === -1) changedApiExports.push('+' + name);
        if (afterExports.indexOf(name) === -1) changedApiExports.push('-' + name);
      });
      const beforeConstants = extractConstants(before);
      const afterConstants = extractConstants(after);
      uniqueStrings(Object.keys(beforeConstants).concat(Object.keys(afterConstants))).sort().forEach(function (name) {
        if (beforeConstants[name] !== afterConstants[name]) changedConstants.push(name);
      });
      changedApiExports.filter(function (item) { return item.charAt(0) === '-'; }).forEach(function (item) {
        risk('high', '公開 API が削除されています: ' + item.slice(1) + '。');
      });
      const displayOnly = stripDisplayOnlyChanges(before) === stripDisplayOnlyChanges(after);
      if (!displayOnly && (changedFunctions.length || changedApiExports.length || changedConstants.length)) {
        risk('medium', 'JavaScript の処理または公開契約に変更候補があります。');
      }
      if (displayOnly) riskReasons.push('コメントまたは表示文言のみの変更候補です。');
      const searchable = changedFunctions.join(' ') + ' ' + before + '\n' + after;
      if (/handoff/i.test(searchable)) affect('handoff');
      if (/mission_control|broadcast_human_directive|current_human_directive/i.test(searchable)) affect('mission_control');
      if (/run_bridge_core_diagnostics|analyze_bridge_diff|wtc|wt_core/i.test(searchable)) affect('wt_core');
      if (/ai_boot_log/i.test(searchable)) affect('ai_boot_log');
      recommend('AppDiagnostics.runDiagnostics()');
      if (affectedAreas.indexOf('wt_core') !== -1) recommend('BRIDGE.run_bridge_core_diagnostics(context)');
      if (affectedAreas.indexOf('handoff') !== -1) recommend('Handoff 生成確認');
      if (affectedAreas.indexOf('mission_control') !== -1) recommend('Broadcast 生成確認');
    } else {
      if (/bridge\.html/i.test(surface) && /mission|作戦管制|directive|broadcast/i.test(before + after)) {
        risk('medium', 'Mission Control UI が変更されています。');
        affect('mission_control');
        recommend('WATCHTOWER ブラウザ確認');
      } else {
        riskReasons.push('文書または表示面のみの変更候補です。');
      }
    }

    if (riskLevel === 'medium' || riskLevel === 'high') recommend('WATCHTOWER ブラウザ確認');
    const status = riskLevel === 'high' ? 'risky' : (riskLevel === 'medium' ? 'caution' : 'safe');
    return {
      diff_status: status,
      changed_surfaces: [surface],
      changed_functions: uniqueStrings(changedFunctions),
      changed_api_exports: uniqueStrings(changedApiExports),
      changed_constants: uniqueStrings(changedConstants),
      changed_schema_fields: uniqueStrings(changedSchemaFields),
      affected_areas: uniqueStrings(affectedAreas),
      risk_level: riskLevel,
      risk_reasons: uniqueStrings(riskReasons),
      recommended_checks: uniqueStrings(recommendedChecks),
      summary: status === 'risky'
        ? '高危険度の差分です。理由を解消してから作業を続けてください。'
        : (status === 'caution'
          ? '確認が必要な差分です。推奨チェックを実行してください。'
          : '軽微な差分です。')
    };
  }

  function generate_wtc_report(context, diffResult) {
    const core = run_bridge_core_diagnostics(context);
    const diff = diffResult && typeof diffResult === 'object' ? diffResult : null;
    const diffStatus = diff ? String(diff.diff_status || 'unknown') : 'not_provided';
    const riskLevel = diff ? String(diff.risk_level || 'unknown') : 'none';
    const diffRisky = diffStatus === 'risky' || riskLevel === 'high';
    const diffCaution = diffStatus === 'caution' || riskLevel === 'medium';
    const stop = core.bridge_status === 'failed' || diffRisky;
    const review = core.bridge_status === 'warning' || diffCaution;
    const overall = stop ? '作業停止' : (review ? '要確認' : '続行可');
    const agents = core.agent_status || {};
    const alerts = (core.warnings || []).concat(diff && Array.isArray(diff.risk_reasons) ? diff.risk_reasons : []);
    const checks = diff && Array.isArray(diff.recommended_checks) ? uniqueStrings(diff.recommended_checks) : [];
    const lines = [
      '# WTc 短文レポート',
      '判定: ' + overall + ' (bridge=' + core.bridge_status + ', diff=' + diffStatus + ', risk=' + riskLevel + ')',
      '現在状態: canonical=' + core.canonical + ', recovery=' + core.recovery_checkpoint + ', latest_packet=' + (core.latest_semantic_packet || 'none'),
      'AI状態: fresh=' + ((agents.fresh_agents || []).join(',') || 'none')
        + '; warning=' + ((agents.warning_agents || []).join(',') || 'none')
        + '; stale=' + ((agents.stale_agents || []).join(',') || 'none')
        + '; reject=' + ((agents.reject_agents || []).join(',') || 'none')
    ];
    if (diff) {
      lines.push('差分: surfaces=' + ((diff.changed_surfaces || []).join(',') || 'none')
        + '; affected=' + ((diff.affected_areas || []).join(',') || 'none'));
    } else {
      lines.push('差分: 未指定');
    }
    lines.push('注意: ' + (alerts.length ? alerts.join(' / ') : 'なし'));
    if (checks.length) lines.push('確認: ' + checks.join(', '));
    lines.push('次の行動: ' + (stop
      ? '作業を止め、危険理由を解消してから再診断してください。'
      : (review
        ? '注意事項と推奨チェックを確認してから作業してください。'
        : core.recommendation)));
    return lines.join('\n');
  }

  function generate_ai_resume_packet(context, target_agent) {
    assertValid(context);
    const core = run_bridge_core_diagnostics(context);
    const task = context.task_frame || {};
    const goal = task.goal || {};
    const recovery = context.recovery_checkpoint || null;
    const directive = context.current_human_directive || {};
    const gate = context.watchtower_gate || {};
    const target = String(target_agent || 'CODEX');
    const checkpointAccess = recovery && RECOVERY_ACCESS_MODES.includes(recovery.access_mode_at_save)
      ? recovery.access_mode_at_save : 'read_propose_only';
    const editingForbidden = core.bridge_status !== 'healthy'
      || core.canonical !== 'fresh'
      || core.recovery_checkpoint !== 'valid'
      || checkpointAccess !== 'full_access'
      || (gate.required_before_edit !== false && String(gate.status || 'pending') !== 'passed');
    let accessMode = checkpointAccess;
    if (editingForbidden && accessMode === 'full_access') accessMode = 'read_propose_only';
    if (core.bridge_status === 'failed') accessMode = 'no_access';
    const nextAction = recovery && Array.isArray(recovery.pending_actions) && String(recovery.pending_actions[0] || '').trim()
      ? String(recovery.pending_actions[0]) : '現在状態を確認し、安全な次の単一アクションを人間に確認する';
    const dangerousSurfaces = [
      'current_truth_snapshot',
      'consensus_state',
      'agent_responses'
    ];
    if (editingForbidden) {
      dangerousSurfaces.push('canonical_current_state', 'recovery_checkpoint');
    }
    const requiredReads = [
      'canonical_current_state',
      'watchtower_gate',
      'current_human_directive',
      'semantic_packets.latest',
      'recovery_checkpoint'
    ];
    const recommendedChecks = [
      'BRIDGE.run_bridge_core_diagnostics(context)',
      'BRIDGE.generate_wtc_report(context)'
    ];
    if (editingForbidden) {
      recommendedChecks.push('正本と復旧チェックポイントを更新するまで編集しない');
    } else if ((context.watchtower_gate || {}).required_before_edit !== false) {
      recommendedChecks.push('WATCHTOWER Browser確認');
    }
    return {
      resume_packet_id: 'rp-' + uuid(),
      generated_at: now(),
      target_agent: target,
      bridge_status: core.bridge_status,
      canonical_status: core.canonical,
      watchtower_gate_status: String(gate.status || 'pending'),
      current_goal: String(goal.primary || task.human_intent || ''),
      current_phase: String(task.stage || task.session_mode || task.status || ''),
      latest_semantic_packet_id: core.latest_semantic_packet,
      current_human_directive: String(directive.content || ''),
      recovery_checkpoint_id: String((recovery || {}).checkpoint_id || ''),
      next_single_action: nextAction,
      access_mode_required: accessMode,
      dangerous_surfaces: uniqueStrings(dangerousSurfaces),
      required_reads: requiredReads,
      recommended_checks: recommendedChecks,
      do_not_touch: [
        'current_truth_snapshot',
        'consensus_state',
        'agent_responses',
        'change_log (通常復帰では読まない・更新しない)'
      ],
      handoff_summary: editingForbidden
        ? '編集禁止。' + nextAction + ' を再開候補として保持し、正本・WT Core・復旧地点を確認してください。'
        : '復帰可能。最初に ' + nextAction + ' を実行し、編集前に必要な確認を完了してください。'
    };
  }

  function broadcast_human_directive(context, directive, boot_id) {
    authorize_ai_operation(context, boot_id, 'edit');
    ensureStructures(assertValid(context));
    const input = directive || {};
    const content = String(input.content || '').trim();
    if (!content) throw new Error('人間からの指示を入力してください。');
    const issuedBy = String(input.issued_by || 'Human');
    if (!/(^|\/|\s)(Human|CODEX)(\s|\/|$)/.test(issuedBy)) {
      throw new Error('人間指示を発行できるのは Human または CODEX だけです。');
    }
    const targets = Array.isArray(input.target_agents)
      ? input.target_agents.map(String).map(function (agent) { return agent.trim(); }).filter(Boolean)
      : MISSION_CONTROL_AGENTS.slice();
    if (!targets.length) throw new Error('配布先 AI を1つ以上指定してください。');
    const packet = add_semantic_packet(context, {
      source_agent: issuedBy,
      type: 'decision',
      content: 'Current Human Directive: ' + content,
      confidence: 1,
      provenance: 'Mission Control manual broadcast',
      tags: ['human-directive', 'broadcast', 'v' + BRIDGE_VERSION],
      related_packets: []
    }, boot_id);
    context.current_human_directive = {
      directive_id: String(input.directive_id || 'hd-' + uuid()),
      issued_at: now(),
      issued_by: issuedBy,
      content: content,
      target_agents: targets,
      delivery_mode: 'manual_broadcast',
      source_packet_id: packet.packet_id
    };
    add_change_log(context, {
      changed_by: issuedBy,
      summary: 'Current Human Directive broadcast prepared',
      reason: 'Provide one manual instruction packet for all selected AI participants.',
      affected_fields: ['current_human_directive', 'semantic_packets', 'handoff']
    }, boot_id);
    return {
      directive: context.current_human_directive,
      packet: packet,
      broadcast_text: [
        '# BRIDGE 人間指示（手動配布用）',
        '- 指示ID (directive_id): ' + context.current_human_directive.directive_id,
        '- 発行日時 (issued_at): ' + context.current_human_directive.issued_at,
        '- 配布先 (targets): ' + targets.join(', '),
        '- 元パケット (source_packet_id): ' + packet.packet_id,
        '',
        content
      ].join('\n')
    };
  }

  function add_memory_node(context, type, label, content, source_agent, source_packet_id, boot_id) {
    authorize_ai_operation(context, boot_id, 'edit');
    ensureStructures(assertValid(context));
    if (!NODE_TYPES.includes(type)) throw new Error('Invalid Memory Graph node type: ' + type);
    const node = {
      node_id: uuid(),
      type: type,
      label: String(label || ''),
      content: String(content || ''),
      created_at: now(),
      source_agent: String(source_agent || ''),
      source_packet_id: String(source_packet_id || '')
    };
    context.memory_graph_lite.nodes.push(node);
    return node;
  }

  function defaultNodeTypeForPacket(packetType) {
    if (packetType === 'decision') return 'Decision';
    if (packetType === 'warning') return 'Risk';
    return '';
  }

  function promote_semantic_packet_to_memory_node(context, packet_id, node_type, label, boot_id) {
    authorize_ai_operation(context, boot_id, 'edit');
    ensureStructures(assertValid(context));
    const packetId = String(packet_id || '');
    const packet = context.semantic_packets.find(function (entry) { return entry.packet_id === packetId; });
    if (!packet) throw new Error('Semantic Packet not found: ' + packetId);
    if (context.memory_graph_lite.nodes.some(function (node) { return node.source_packet_id === packetId; })) {
      throw new Error('Semantic Packet already promoted: ' + packetId);
    }
    const type = String(node_type || defaultNodeTypeForPacket(packet.type));
    if (!type) throw new Error('Explicit Memory Graph node type is required for packet type: ' + packet.type);
    const nodeLabel = String(label || (type + ' from ' + packet.packet_id));
    return add_memory_node(context, type, nodeLabel, packet.content, packet.source_agent, packet.packet_id);
  }

  function add_memory_edge(context, from_id, to_id, relation, boot_id) {
    authorize_ai_operation(context, boot_id, 'edit');
    ensureStructures(assertValid(context));
    if (!EDGE_RELATIONS.includes(relation)) throw new Error('Invalid Memory Graph relation: ' + relation);
    const ids = context.memory_graph_lite.nodes.map(function (node) { return node.node_id; });
    if (!ids.includes(from_id) || !ids.includes(to_id)) {
      throw new Error('Memory Graph edge requires existing from/to node_id values');
    }
    const edge = { from: from_id, to: to_id, relation: relation };
    context.memory_graph_lite.edges.push(edge);
    return edge;
  }

  function propose_memory_edge(context, from_id, to_id, relation, rationale, proposed_by, boot_id) {
    authorize_ai_operation(context, boot_id, 'propose');
    ensureStructures(assertValid(context));
    if (!EDGE_RELATIONS.includes(relation)) throw new Error('Invalid Memory Graph relation: ' + relation);
    if (from_id === to_id) throw new Error('Memory Graph edge cannot relate a node to itself');
    const ids = context.memory_graph_lite.nodes.map(function (node) { return node.node_id; });
    if (!ids.includes(from_id) || !ids.includes(to_id)) {
      throw new Error('Memory Graph edge proposal requires existing from/to node_id values');
    }
    if (!String(rationale || '').trim()) throw new Error('Memory Graph edge proposal rationale is required');
    if (context.memory_graph_lite.edge_proposals.some(function (proposal) {
      return proposal.from === from_id && proposal.to === to_id && proposal.relation === relation && proposal.status !== 'rejected';
    })) {
      throw new Error('Equivalent Memory Graph edge proposal already exists');
    }
    const proposal = {
      proposal_id: 'mep-' + uuid(),
      proposed_at: now(),
      proposed_by: String(proposed_by || ''),
      from: String(from_id),
      to: String(to_id),
      relation: relation,
      rationale: String(rationale),
      status: 'proposed',
      validated_by: '',
      validated_at: '',
      validation_notes: ''
    };
    context.memory_graph_lite.edge_proposals.push(proposal);
    return proposal;
  }

  function validate_memory_edge(context, proposal_id, status, validated_by, notes, boot_id) {
    authorize_ai_operation(context, boot_id, 'edit');
    ensureStructures(assertValid(context));
    if (!['validated', 'rejected'].includes(status)) throw new Error('Invalid Memory Graph edge validation status: ' + status);
    const proposal = context.memory_graph_lite.edge_proposals.find(function (entry) {
      return entry.proposal_id === proposal_id;
    });
    if (!proposal) throw new Error('Memory Graph edge proposal not found: ' + proposal_id);
    proposal.status = status;
    proposal.validated_by = String(validated_by || '');
    proposal.validated_at = now();
    proposal.validation_notes = String(notes || '');
    return proposal;
  }

  function add_validated_memory_edge(context, proposal_id, boot_id) {
    authorize_ai_operation(context, boot_id, 'edit');
    ensureStructures(assertValid(context));
    const proposal = context.memory_graph_lite.edge_proposals.find(function (entry) {
      return entry.proposal_id === proposal_id;
    });
    if (!proposal) throw new Error('Memory Graph edge proposal not found: ' + proposal_id);
    if (proposal.status !== 'validated') throw new Error('Memory Graph edge proposal is not validated: ' + proposal_id);
    if (context.memory_graph_lite.edges.some(function (edge) { return edge.proposal_id === proposal_id; })) {
      throw new Error('Validated Memory Graph edge already added: ' + proposal_id);
    }
    const edge = {
      from: proposal.from,
      to: proposal.to,
      relation: proposal.relation,
      proposal_id: proposal.proposal_id,
      validated_by: proposal.validated_by,
      validated_at: proposal.validated_at
    };
    context.memory_graph_lite.edges.push(edge);
    return edge;
  }

  function listItems(items, formatter, emptyText) {
    return items.length ? items.map(formatter).join('\n') : '- ' + emptyText;
  }

  function generate_handoff_markdown(context, target_agent) {
    assertValid(context);
    const target = String(target_agent || '');
    const handoff = context.handoff;
    const task = context.task_frame;
    const gate = context.watchtower_gate || createWatchtowerGate();
    const consensus = context.consensus_state || createConsensusState();
    const latestConsensusTest = (context.consensus_test_log || []).length
      ? context.consensus_test_log[context.consensus_test_log.length - 1] : null;
    const snapshot = context.current_truth_snapshot;
    const canonical = context.canonical_current_state;
    const recovery = context.recovery_checkpoint;
    const recoveryValidation = recovery ? validate_recovery_checkpoint(context, recovery) : null;
    const directive = context.current_human_directive || createHumanDirective();
    const boot = context.ai_boot_protocol || createAiBootProtocol();
    const latestBoot = (context.ai_boot_log || []).length
      ? context.ai_boot_log[context.ai_boot_log.length - 1]
      : ((boot.boot_responses || []).length ? boot.boot_responses[boot.boot_responses.length - 1] : null);
    const packets = (context.semantic_packets || []).slice(-3).reverse();
    const allFrictionPackets = (context.semantic_packets || []).filter(function (packet) {
      return FRICTION_PACKET_TYPES.includes(packet.type);
    });
    const frictionPackets = allFrictionPackets.slice(-5).reverse();
    const recentFailures = list_recent_failures(context, 5);
    const graph = context.memory_graph_lite || { nodes: [], edge_proposals: [], edges: [] };
    const graphNodes = (graph.nodes || []).slice(-5).reverse();
    const graphProposals = (graph.edge_proposals || []).slice(-3).reverse();
    const open = (handoff.what_is_open || []).slice().sort(function (a, b) {
      return (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9);
    });
    const actions = (handoff.recommended_next_actions || []).filter(function (entry) {
      return entry.target_agent === target || entry.target_agent.split(/\s*\/\s*/).includes(target);
    });
    return [
      '# BRIDGE Handoff — ' + target + ' 向け',
      '**生成日時**: ' + handoff.generated_at,
      '**発行元**: ' + handoff.from_agent,
      '',
      '## 今のタスク',
      '- セッションモード: ' + task.session_mode,
      '- 主目標: ' + task.goal.primary,
      '- フェーズ: ' + task.stage,
      '',
      '## Current Human Directive',
      directive.content ? '- directive_id: ' + directive.directive_id : '- directive_id: not-issued',
      directive.content ? '- issued_at: ' + directive.issued_at : '',
      directive.content ? '- targets: ' + directive.target_agents.join(', ') : '',
      directive.content ? '- source_packet_id: ' + directive.source_packet_id : '',
      directive.content ? '- instruction: ' + directive.content : '- instruction: none',
      '',
      '## WATCHTOWER Gate',
      '- required_before_edit: ' + gate.required_before_edit,
      '- status: ' + gate.status,
      '- last_checked_at: ' + (gate.last_checked_at || 'not-run'),
      '- signature: ' + (gate.signature || 'none'),
      '- result_summary: ' + (gate.result_summary || 'WT実行または代替ゲートが必要'),
      gate.blocked_reason ? '- blocked_reason: ' + gate.blocked_reason : '',
      '',
      '## Canonical Current State',
      canonical ? '- pointer_version: ' + canonical.canonical_pointer_version : '- pointer_version: missing',
      canonical ? '- updated_at: ' + canonical.updated_at : '',
      canonical ? '- authority: ' + canonical.authority : '',
      canonical ? '- bridge_version: ' + canonical.bridge_version : '',
      canonical ? '- latest_semantic_packet_id: ' + canonical.latest_semantic_packet_id : '',
      canonical ? '- watchtower_gate_current_status: ' + canonical.watchtower_gate_current_status : '',
      canonical ? '- current_truth_priority: ' + canonical.current_truth_priority.join(' -> ') : '',
      '',
      '## Recovery Checkpoint',
      recovery ? '- checkpoint_id: ' + recovery.checkpoint_id : '- checkpoint_id: not-saved',
      recovery ? '- saved_at: ' + recovery.saved_at : '',
      recovery ? '- work_status: ' + recovery.work_status : '',
      recovery ? '- access_mode_at_save: ' + recovery.access_mode_at_save : '',
      recovery ? '- active_task: ' + recovery.active_task : '',
      recovery ? '- next_single_action: ' + (recovery.pending_actions[0] || 'none') : '',
      recoveryValidation ? '- validation: ' + recoveryValidation.status + ' / ' + recoveryValidation.severity : '',
      '',
      '## AI読解検証',
      '- responses_received: ' + (context.agent_responses || []).length,
      '- agreement_level: ' + consensus.agreement_level,
      '- active_disagreements: ' + (consensus.active_disagreements || []).length,
      '',
      '### 共通質問',
      listItems(context.reading_verification_questions || [], function (item) { return '- [' + item.question_id + '] ' + item.prompt; }, 'なし'),
      '',
      '## Disagreement Detection Test',
      latestConsensusTest
        ? '- latest_result: ' + (latestConsensusTest.passed ? 'pass' : 'fail')
        : '- latest_result: not-run',
      latestConsensusTest
        ? '- isolated_from_production_consensus: ' + latestConsensusTest.isolated_from_production_consensus
        : '',
      latestConsensusTest
        ? '- detected_topics: ' + latestConsensusTest.observed.active_disagreements.map(function (entry) { return entry.topic; }).join(', ')
        : '',
      '',
      '## Current Truth Snapshot',
      snapshot ? '- snapshot_id: ' + snapshot.snapshot_id : '- snapshot_id: not-frozen',
      snapshot ? '- frozen_at: ' + snapshot.frozen_at : '',
      snapshot ? '- validated_by: ' + snapshot.validated_by.join(', ') : '',
      snapshot ? '- primary_goal: ' + snapshot.primary_goal : '',
      snapshot ? '- current_phase: ' + snapshot.current_phase : '',
      snapshot ? '- watchtower_gate_mandatory: ' + snapshot.watchtower_gate_mandatory : '',
      snapshot ? '- open_questions: ' + snapshot.open_questions.join(' / ') : '',
      snapshot ? '- codex_next_action: ' + snapshot.codex_next_action : '',
      '',
      '## AI Boot Protocol',
      '- protocol_version: ' + boot.protocol_version,
      '- read_order: ' + boot.read_order.join(' -> '),
      '- required_response: ' + boot.required_response_fields.join(', '),
      '- recorded_boots: ' + ((context.ai_boot_log || []).length + (boot.boot_responses || []).length),
      latestBoot ? '- latest_boot: ' + latestBoot.agent + ' / ' + latestBoot.status : '- latest_boot: none',
      latestBoot && latestBoot.freshness_result ? '- latest_freshness: ' + latestBoot.freshness_result.status + ' / ' + latestBoot.freshness_result.severity : '',
      latestBoot && latestBoot.access_mode ? '- latest_access_mode: ' + latestBoot.access_mode : '',
      '',
      '## Semantic Packets',
      '- stored_packets: ' + (context.semantic_packets || []).length,
      listItems(packets, function (item) {
        return '- [' + item.type + '] ' + item.content + ' (confidence: ' + item.confidence + ', source: ' + (item.source_agent || 'unknown') + ')';
      }, 'なし'),
      '',
      '## AI Friction / Complaints',
      '- stored_feedback: ' + allFrictionPackets.length,
      listItems(frictionPackets, function (item) {
        const score = item.friction_score === null || item.friction_score === undefined ? 'n/a' : item.friction_score;
        return '- [' + item.type + '] ' + (item.category || 'general') + ' / ' + (item.severity || 'unspecified')
          + ' / ' + score + ': ' + item.content
          + (item.suggested_fix ? ' -> suggested_fix: ' + item.suggested_fix : '');
      }, 'なし'),
      '',
      '## Negative Memory / Failure Log',
      '- stored_failures: ' + ((context.failure_log || []).length),
      listItems(recentFailures, function (item) {
        return '- [' + item.severity + ' / ' + item.status + '] ' + item.failure_type + ': ' + item.summary
          + (item.prevention_rule ? ' -> prevention: ' + item.prevention_rule : '');
      }, 'none'),
      '',
      '## Memory Graph Lite',
      '- nodes: ' + (graph.nodes || []).length,
      '- edge_proposals: ' + (graph.edge_proposals || []).length,
      '- edges: ' + (graph.edges || []).length,
      listItems(graphNodes, function (item) {
        return '- [' + item.type + '] ' + item.label + (item.source_packet_id ? ' <- ' + item.source_packet_id : '');
      }, 'なし'),
      '',
      '### Validated Relationships',
      listItems((graph.edges || []).slice(-3).reverse(), function (item) {
        return '- ' + item.from + ' ' + item.relation + ' ' + item.to + (item.proposal_id ? ' <- ' + item.proposal_id : '');
      }, 'なし'),
      '',
      '### Edge Proposals',
      listItems(graphProposals, function (item) {
        return '- [' + item.status + '] ' + item.from + ' ' + item.relation + ' ' + item.to + ': ' + item.rationale;
      }, 'なし'),
      '',
      '## 決定済み事項',
      listItems(handoff.what_is_decided || [], function (item) { return '- [' + item.id + '] ' + item.summary; }, 'なし'),
      '',
      '## 未決事項（優先度順）',
      listItems(open, function (item) { return '- [' + item.priority + '] ' + item.question + ' - ' + item.context; }, 'なし'),
      '',
      '## あなたへの推奨アクション',
      listItems(actions, function (item) { return '- ' + item.action + '（理由: ' + item.reason + '）'; }, '対象アクションなし'),
      '',
      '## 制約（変えてはいけないこと）',
      listItems(task.constraints || [], function (item) { return '- ' + item; }, 'なし')
    ].filter(function (line, index, lines) {
      return line !== '' || lines[index - 1] !== '';
    }).join('\n');
  }

  const api = {
    bridge_init: bridge_init,
    bridge_load: bridge_load,
    bridge_save: bridge_save,
    add_semantic_packet: add_semantic_packet,
    record_ai_friction: record_ai_friction,
    record_failure: record_failure,
    list_recent_failures: list_recent_failures,
    add_agent_response: add_agent_response,
    record_ai_boot_response: record_ai_boot_response,
    validate_context_freshness: validate_context_freshness,
    authorize_ai_operation: authorize_ai_operation,
    evaluate_consensus: evaluate_consensus,
    run_disagreement_detection_test: run_disagreement_detection_test,
    freeze_current_truth_snapshot: freeze_current_truth_snapshot,
    add_validation_check: add_validation_check,
    update_validation_status: update_validation_status,
    add_change_log: add_change_log,
    update_canonical_current_state: update_canonical_current_state,
    save_recovery_checkpoint: save_recovery_checkpoint,
    validate_recovery_checkpoint: validate_recovery_checkpoint,
    generate_recovery_handoff: generate_recovery_handoff,
    get_mission_control_status: get_mission_control_status,
    run_bridge_core_diagnostics: run_bridge_core_diagnostics,
    analyze_bridge_diff: analyze_bridge_diff,
    generate_wtc_report: generate_wtc_report,
    generate_ai_resume_packet: generate_ai_resume_packet,
    broadcast_human_directive: broadcast_human_directive,
    update_watchtower_gate: update_watchtower_gate,
    update_handoff: update_handoff,
    add_memory_node: add_memory_node,
    add_memory_edge: add_memory_edge,
    promote_semantic_packet_to_memory_node: promote_semantic_packet_to_memory_node,
    propose_memory_edge: propose_memory_edge,
    validate_memory_edge: validate_memory_edge,
    add_validated_memory_edge: add_validated_memory_edge,
    generate_handoff_markdown: generate_handoff_markdown,
    validate: validationResult,
    constants: {
      nodeTypes: NODE_TYPES.slice(),
      edgeRelations: EDGE_RELATIONS.slice(),
      packetTypes: PACKET_TYPES.slice(),
      failureTypes: FAILURE_TYPES.slice(),
      failureSeverities: FAILURE_SEVERITIES.slice(),
      failureStatuses: FAILURE_STATUSES.slice(),
      validationStatuses: VALIDATION_STATUSES.slice(),
      watchtowerGateStatuses: WATCHTOWER_GATE_STATUSES.slice(),
      recoveryWorkStatuses: RECOVERY_WORK_STATUSES.slice(),
      recoveryAccessModes: RECOVERY_ACCESS_MODES.slice(),
      missionControlAgents: MISSION_CONTROL_AGENTS.slice(),
      consensusTopics: CONSENSUS_TOPICS.map(function (topic) { return topic.key; })
    }
  };
  global.BRIDGE = api;
  Object.keys(api).forEach(function (key) {
    if (typeof api[key] === 'function') global[key] = api[key];
  });

  function runDiagnostics() {
    const persistedBeforeDiagnostics = lastPersistedContext ? clone(lastPersistedContext) : null;
    const checks = [];
    function check(label, test) {
      let ok = false;
      try {
        ok = !!test();
      } catch (error) {
        ok = false;
      }
      checks.push({ label: label, ok: ok });
    }

    check('v1.5 init structures', function () {
      const context = bridge_init('BRIDGE', 'diagnostics', 'verification');
      return context.bridge_version === BRIDGE_VERSION
        && Array.isArray(context.agent_responses)
        && Array.isArray(context.validation_checklist)
        && Array.isArray(context.change_log)
        && Array.isArray(context.failure_log)
        && Array.isArray(context.reading_verification_questions)
        && context.consensus_state.agreement_level === 0
        && context.current_truth_snapshot === null
        && context.canonical_current_state === null
        && context.recovery_checkpoint === null
        && context.current_human_directive.content === ''
        && context.watchtower_gate.required_before_edit
        && context.validation_checklist.some(function (item) { return item.check_id === 'vc-wt-gate'; })
        && context.validation_checklist.some(function (item) { return item.check_id === 'vc-semantic-packet'; })
        && context.validation_checklist.some(function (item) { return item.check_id === 'vc-packet-memory-link'; })
        && Array.isArray(context.memory_graph_lite.edge_proposals)
        && context.validation_checklist.some(function (item) { return item.check_id === 'vc-memory-edge-validation'; })
        && context.ai_boot_protocol.protocol_version === '1.5'
        && context.ai_boot_protocol.read_order.includes('current_human_directive')
        && Array.isArray(context.ai_boot_protocol.boot_responses)
        && Array.isArray(context.ai_boot_log)
        && context.validation_checklist.some(function (item) { return item.check_id === 'vc-ai-boot-protocol'; })
        && context.validation_checklist.some(function (item) { return item.check_id === 'vc-canonical-freshness'; })
        && context.validation_checklist.some(function (item) { return item.check_id === 'vc-recovery-checkpoint'; });
    });
    check('handoff markdown API', function () {
      const context = bridge_init('BRIDGE', 'diagnostics', 'verification');
      return generate_handoff_markdown(context, 'GPT').includes('# BRIDGE Handoff');
    });
    check('v0.2 response and validation API', function () {
      const context = bridge_init('BRIDGE', 'diagnostics', 'verification');
      const response = add_agent_response(context, {
        agent: 'GPT',
        understood_goal: 'diagnostics',
        understood_current_state: 'verification',
        concerns: [],
        suggested_next_actions: [],
        confidence: 1
      });
      const item = add_validation_check(context, { label: 'diagnostic', description: 'diagnostic' });
      return !!response.response_id && update_validation_status(context, item.check_id, 'pass', 'BRIDGE', '').status === 'pass';
    });
    check('watchtower gate API and handoff output', function () {
      const context = bridge_init('BRIDGE', 'diagnostics', 'verification');
      const gate = update_watchtower_gate(context, { status: 'passed', checked_by: 'WATCHTOWER', signature: 'self-test', result_summary: 'OK' });
      return gate.status === 'passed' && generate_handoff_markdown(context, 'GPT').includes('## WATCHTOWER Gate');
    });
    check('mission control directive packet and freshness view', function () {
      const context = bridge_init('BRIDGE', 'diagnostics', 'verification');
      const prepared = broadcast_human_directive(context, {
        issued_by: 'Human',
        content: 'Review the canonical state before work.',
        target_agents: ['GPT', 'Gemini']
      });
      const status = get_mission_control_status(context);
      const markdown = generate_handoff_markdown(context, 'GPT');
      return prepared.packet.type === 'decision'
        && status.current_human_directive.source_packet_id === prepared.packet.packet_id
        && status.ai_freshness.length === MISSION_CONTROL_AGENTS.length
        && status.ai_freshness.every(function (entry) { return entry.status === 'stale'; })
        && markdown.includes('## Current Human Directive')
        && markdown.includes('Review the canonical state before work.');
    });
    check('wtc diff analyzer identifies source and protected context risk without mutation', function () {
      const beforeJs = [
        "const CORE_MODE = 'base';",
        'function existing() { return 1; }',
        'const api = {',
        '  existing: existing',
        '};',
        'global.BRIDGE = api;'
      ].join('\n');
      const afterJs = [
        "const CORE_MODE = 'expanded';",
        'function existing() { return 2; }',
        'function added() { return true; }',
        'const api = {',
        '  existing: existing,',
        '  added: added',
        '};',
        'global.BRIDGE = api;'
      ].join('\n');
      const sourceDiff = analyze_bridge_diff(beforeJs, afterJs, { surface: 'bridge.js', kind: 'javascript' });
      const beforeContext = bridge_init('BRIDGE', 'diagnostics', 'verification');
      update_watchtower_gate(beforeContext, { status: 'passed', checked_by: 'WATCHTOWER', result_summary: 'OK' });
      update_canonical_current_state(beforeContext, { updated_by: 'CODEX' });
      save_recovery_checkpoint(beforeContext, {
        saved_by: 'CODEX',
        work_status: 'in_progress',
        access_mode_at_save: 'full_access',
        pending_actions: ['Resume diagnostic verification'],
        last_safe_operation: 'Saved diagnostic recovery point'
      });
      const beforeJson = JSON.stringify(beforeContext);
      const altered = clone(beforeContext);
      altered.current_truth_snapshot = { modified: true };
      const contextDiff = analyze_bridge_diff(beforeJson, JSON.stringify(altered), { surface: 'bridge-context.json', kind: 'json' });
      return sourceDiff.diff_status === 'caution'
        && sourceDiff.changed_functions.includes('existing')
        && sourceDiff.changed_functions.includes('added')
        && sourceDiff.changed_api_exports.includes('+added')
        && sourceDiff.changed_constants.includes('CORE_MODE')
        && contextDiff.diff_status === 'risky'
        && contextDiff.changed_schema_fields.includes('current_truth_snapshot')
        && contextDiff.risk_reasons.some(function (reason) { return reason.includes('current_truth_snapshot'); })
        && beforeJson === JSON.stringify(beforeContext);
    });
    check('wtc short report summarizes health and risky diff without mutation', function () {
      const context = bridge_init('BRIDGE', 'diagnostics', 'verification');
      update_watchtower_gate(context, { status: 'passed', checked_by: 'WATCHTOWER', result_summary: 'OK' });
      update_canonical_current_state(context, { updated_by: 'CODEX' });
      save_recovery_checkpoint(context, {
        saved_by: 'CODEX',
        work_status: 'in_progress',
        access_mode_at_save: 'full_access',
        pending_actions: ['Resume diagnostic verification'],
        last_safe_operation: 'Saved diagnostic recovery point'
      });
      const before = JSON.stringify(context);
      const healthyReport = generate_wtc_report(context);
      const riskyReport = generate_wtc_report(context, {
        diff_status: 'risky',
        risk_level: 'high',
        changed_surfaces: ['bridge-context.json'],
        affected_areas: ['current_truth_snapshot'],
        risk_reasons: ['current_truth_snapshot が変更されています。'],
        recommended_checks: ['WATCHTOWER ブラウザ確認']
      });
      return healthyReport.includes('判定: 続行可')
        && healthyReport.includes('差分: 未指定')
        && riskyReport.includes('判定: 作業停止')
        && riskyReport.includes('current_truth_snapshot が変更されています。')
        && riskyReport.includes('次の行動: 作業を止め')
        && before === JSON.stringify(context);
    });
    check('wt core warns when canonical packet pointer or saved version is behind', function () {
      const context = bridge_init('BRIDGE', 'diagnostics', 'verification');
      update_watchtower_gate(context, { status: 'passed', checked_by: 'WATCHTOWER', result_summary: 'OK' });
      const pointer = update_canonical_current_state(context, { updated_by: 'CODEX' });
      const boot = record_ai_boot_response(context, {
        boot_id: 'boot-core-current-pointer',
        agent: 'Claude',
        read_confirmed: context.ai_boot_protocol.read_order.slice(),
        confirm_current_goal: 'Verify current pointer',
        confirm_phase: 'wt-core-validation',
        confirm_open_risks: [],
        declare_intended_action: 'Read only',
        whether_wt_required: true,
        context_basis: {
          bridge_generated_at: pointer.bridge_generated_at,
          canonical_pointer_updated_at: pointer.updated_at,
          canonical_pointer_version_seen: pointer.canonical_pointer_version,
          handoff_generated_at: pointer.latest_handoff_generated_at,
          snapshot_id: pointer.latest_snapshot_id,
          snapshot_frozen_at: '',
          latest_semantic_packet_id_seen: pointer.latest_semantic_packet_id,
          watchtower_gate_status_seen: pointer.watchtower_gate_current_status,
          watchtower_gate_last_checked_at_seen: pointer.watchtower_gate_last_checked_at
        },
        confidence: 1
      });
      add_semantic_packet(context, {
        source_agent: 'CODEX',
        type: 'insight',
        content: 'Newer packet after canonical pointer.',
        confidence: 1
      });
      const before = JSON.stringify(context);
      const stalePointer = run_bridge_core_diagnostics(context);
      const moved = clone(context);
      update_canonical_current_state(moved, { updated_by: 'CODEX' });
      const movedPointer = run_bridge_core_diagnostics(moved);
      const legacy = clone(moved);
      legacy.bridge_version = '1.3';
      legacy.canonical_current_state.bridge_version = '1.3';
      const oldRuntimeContext = run_bridge_core_diagnostics(legacy);
      const blockedGate = clone(moved);
      blockedGate.watchtower_gate.status = 'blocked';
      const stoppedByGate = run_bridge_core_diagnostics(blockedGate);
      return boot.status === 'fresh'
        && stalePointer.bridge_status === 'warning'
        && stalePointer.canonical === 'stale'
        && stalePointer.warnings.some(function (warning) { return warning.includes('最新 Semantic Packet'); })
        && movedPointer.canonical === 'fresh'
        && movedPointer.bridge_status === 'warning'
        && movedPointer.agent_status.warning_agents.includes('Claude')
        && oldRuntimeContext.bridge_status === 'warning'
        && oldRuntimeContext.warnings.some(function (warning) { return warning.includes('実行コード'); })
        && stoppedByGate.bridge_status === 'warning'
        && stoppedByGate.warnings.some(function (warning) { return warning.includes('WATCHTOWER Gate'); })
        && before === JSON.stringify(context);
    });
    check('ai resume packet prioritizes next action and forbids stale editing without mutation', function () {
      const context = bridge_init('BRIDGE', 'diagnostics', 'verification');
      context.task_frame.goal.primary = 'Resume work quickly';
      context.task_frame.stage = 'resume-validation';
      update_watchtower_gate(context, { status: 'passed', checked_by: 'WATCHTOWER', result_summary: 'OK' });
      update_canonical_current_state(context, { updated_by: 'CODEX' });
      save_recovery_checkpoint(context, {
        saved_by: 'CODEX',
        work_status: 'in_progress',
        access_mode_at_save: 'full_access',
        pending_actions: ['Resume this exact next action first', 'Do not choose this second action'],
        last_safe_operation: 'Resume packet fixture ready'
      });
      const before = JSON.stringify(context);
      const healthy = generate_ai_resume_packet(context, 'Claude');
      const stale = clone(context);
      stale.generated_at = 'stale-generation';
      const blocked = generate_ai_resume_packet(stale, 'Claude');
      return healthy.target_agent === 'Claude'
        && healthy.bridge_status === 'healthy'
        && healthy.canonical_status === 'fresh'
        && healthy.watchtower_gate_status === 'passed'
        && healthy.current_goal === 'Resume work quickly'
        && healthy.current_phase === 'resume-validation'
        && healthy.next_single_action === 'Resume this exact next action first'
        && healthy.access_mode_required === 'full_access'
        && healthy.required_reads.includes('current_human_directive')
        && healthy.do_not_touch.includes('current_truth_snapshot')
        && blocked.bridge_status === 'warning'
        && blocked.access_mode_required === 'read_propose_only'
        && blocked.handoff_summary.includes('編集禁止')
        && before === JSON.stringify(context);
    });
    check('change log API', function () {
      const context = bridge_init('BRIDGE', 'diagnostics', 'verification');
      const change = add_change_log(context, {
        changed_by: 'BRIDGE',
        summary: 'diagnostic',
        reason: 'verify API',
        affected_fields: ['change_log']
      });
      return !!change.change_id && context.change_log.length === 1;
    });
    check('consensus agreement and disagreement detection', function () {
      const context = bridge_init('BRIDGE', 'diagnostics', 'verification');
      add_agent_response(context, { agent: 'GPT', understood_goal: 'goal', understood_current_state: 'state', confidence: 1, reading_answers: { current_phase: 'v0.4', watchtower_gate_mandatory: true, open_questions: ['confidence'], codex_next_action: 'collect' } });
      add_agent_response(context, { agent: 'Claude', understood_goal: 'goal', understood_current_state: 'state', confidence: 1, reading_answers: { current_phase: 'v0.4', watchtower_gate_mandatory: true, open_questions: ['confidence'], codex_next_action: 'review' } });
      const consensus = evaluate_consensus(context);
      return consensus.agreement_level === 0.8
        && consensus.shared_understanding.length === 4
        && consensus.active_disagreements[0].topic === 'codex_next_action';
    });
    check('isolated disagreement test preserves production consensus', function () {
      const context = bridge_init('BRIDGE', 'diagnostics', 'verification');
      const answer = { primary_goal: 'goal', current_phase: 'phase', watchtower_gate_mandatory: true, open_questions: ['open'], codex_next_action: 'act' };
      add_agent_response(context, { agent: 'GPT', understood_goal: 'goal', understood_current_state: 'state', confidence: 1, reading_answers: answer });
      add_agent_response(context, { agent: 'Claude', understood_goal: 'goal', understood_current_state: 'state', confidence: 1, reading_answers: answer });
      evaluate_consensus(context);
      const baseline = JSON.stringify(context.consensus_state);
      const baselineLog = JSON.stringify(context.consensus_test_log);
      const test = run_disagreement_detection_test(context, {
        response_id: 'test-divergent-diagnostic',
        agent: 'TEST_DIVERGENT_AI',
        understood_goal: 'goal',
        understood_current_state: 'test',
        confidence: 1,
        reading_answers: Object.assign({}, answer, { watchtower_gate_mandatory: false })
      }, 'watchtower_gate_mandatory');
      return test.passed
        && test.observed.agreement_level === 0.8
        && JSON.stringify(context.consensus_state) === baseline
        && JSON.stringify(context.consensus_test_log) === baselineLog;
    });
    check('current truth snapshot freezes production consensus only', function () {
      const context = bridge_init('BRIDGE', 'diagnostics', 'verification');
      const answer = { primary_goal: 'goal', current_phase: 'phase', watchtower_gate_mandatory: true, open_questions: ['open'], codex_next_action: 'act' };
      add_agent_response(context, { agent: 'GPT', understood_goal: 'goal', understood_current_state: 'state', confidence: 1, reading_answers: answer });
      add_agent_response(context, { agent: 'Claude', understood_goal: 'goal', understood_current_state: 'state', confidence: 1, reading_answers: answer });
      evaluate_consensus(context);
      context.consensus_test_log.push({ test_id: 'ignored-test-record', passed: true });
      const responsesBefore = JSON.stringify(context.agent_responses);
      const testsBefore = JSON.stringify(context.consensus_test_log);
      const snapshot = freeze_current_truth_snapshot(context);
      let rejected = false;
      try { freeze_current_truth_snapshot(bridge_init('BRIDGE', 'empty', 'verification')); } catch (error) { rejected = /without shared consensus/.test(error.message); }
      return snapshot.agreement_level === 1
        && snapshot.validated_by.join(',') === 'GPT,Claude'
        && snapshot.primary_goal === 'goal'
        && !snapshot.notes.includes('ignored-test-record')
        && JSON.stringify(context.agent_responses) === responsesBefore
        && JSON.stringify(context.consensus_test_log) === testsBefore
        && rejected;
    });
    check('semantic packet validates and appears in handoff', function () {
      const context = bridge_init('BRIDGE', 'diagnostics', 'verification');
      const packet = add_semantic_packet(context, {
        packet_id: 'sp-diagnostic',
        source_agent: 'CODEX',
        type: 'insight',
        content: 'Semantic Packet remains readable in handoff.',
        confidence: 1,
        provenance: 'diagnostics',
        tags: ['semantic-packet'],
        related_packets: []
      });
      let rejected = false;
      try {
        add_semantic_packet(context, { source_agent: 'CODEX', type: 'insight', content: '', confidence: 1 });
      } catch (error) {
        rejected = /content is required/.test(error.message);
      }
      const markdown = generate_handoff_markdown(context, 'GPT');
      return packet.packet_id === 'sp-diagnostic'
        && context.semantic_packets.length === 1
        && markdown.includes('## Semantic Packets')
        && markdown.includes('Semantic Packet remains readable in handoff.')
        && rejected;
    });
    check('ai friction stores wishes and complaints through warning proposals only', function () {
      const context = bridge_init('BRIDGE', 'diagnostics', 'verification');
      update_watchtower_gate(context, { status: 'passed', checked_by: 'WATCHTOWER', result_summary: 'OK' });
      const pointer = update_canonical_current_state(context, { updated_by: 'CODEX' });
      const warning = record_ai_boot_response(context, {
        boot_id: 'boot-friction-warning',
        agent: 'Claude',
        read_confirmed: context.ai_boot_protocol.read_order.slice(),
        confirm_current_goal: 'Record friction',
        confirm_phase: 'friction-validation',
        confirm_open_risks: ['stale packet'],
        declare_intended_action: 'propose feedback',
        whether_wt_required: true,
        context_basis: {
          bridge_generated_at: pointer.bridge_generated_at,
          canonical_pointer_updated_at: pointer.updated_at,
          canonical_pointer_version_seen: pointer.canonical_pointer_version,
          handoff_generated_at: pointer.latest_handoff_generated_at,
          snapshot_id: pointer.latest_snapshot_id,
          snapshot_frozen_at: '',
          latest_semantic_packet_id_seen: 'sp-stale',
          watchtower_gate_status_seen: pointer.watchtower_gate_current_status,
          watchtower_gate_last_checked_at_seen: pointer.watchtower_gate_last_checked_at
        },
        confidence: 1
      });
      const protectedBefore = JSON.stringify({
        consensus_state: context.consensus_state,
        agent_responses: context.agent_responses,
        change_log: context.change_log
      });
      const wish = record_ai_friction(context, {
        source_agent: 'Claude',
        type: 'wish',
        category: 'resume',
        severity: 'low',
        friction_score: 0.3,
        content: 'Resume Packet を入口にしたい。',
        suggested_fix: '短縮表示を維持する',
        confidence: 0.8
      }, warning.boot_id);
      const complaint = record_ai_friction(context, {
        source_agent: 'Claude',
        type: 'complaint',
        category: 'boot',
        severity: 'medium',
        friction_score: 0.72,
        content: 'Boot Protocol の read_order が長い。',
        suggested_fix: 'canonical shortcut mode を追加する',
        confidence: 0.8,
        tags: ['ux', 'boot']
      }, warning.boot_id);
      let rejectsScore = false;
      let rejectsType = false;
      try {
        record_ai_friction(context, {
          source_agent: 'Claude',
          type: 'complaint',
          content: 'invalid score',
          friction_score: 1.2,
          confidence: 0.8
        }, warning.boot_id);
      } catch (error) {
        rejectsScore = /friction_score/.test(error.message);
      }
      try {
        record_ai_friction(context, {
          source_agent: 'Claude',
          type: 'insight',
          content: 'not feedback',
          confidence: 0.8
        }, warning.boot_id);
      } catch (error) {
        rejectsType = /wish or complaint/.test(error.message);
      }
      const markdown = generate_handoff_markdown(context, 'GPT');
      return warning.status === 'completed_with_warning'
        && wish.type === 'wish'
        && complaint.type === 'complaint'
        && complaint.category === 'boot'
        && complaint.friction_score === 0.72
        && complaint.suggested_fix === 'canonical shortcut mode を追加する'
        && rejectsScore
        && rejectsType
        && markdown.includes('## AI Friction / Complaints')
        && markdown.includes('[complaint] boot / medium / 0.72')
        && JSON.stringify({
          consensus_state: context.consensus_state,
          agent_responses: context.agent_responses,
          change_log: context.change_log
        }) === protectedBefore;
    });
    check('negative memory records warning reports without protected mutations', function () {
      const context = bridge_init('BRIDGE', 'diagnostics', 'verification');
      update_watchtower_gate(context, { status: 'passed', checked_by: 'WATCHTOWER', result_summary: 'OK' });
      const pointer = update_canonical_current_state(context, { updated_by: 'CODEX' });
      const warning = record_ai_boot_response(context, {
        boot_id: 'boot-failure-warning',
        agent: 'Claude',
        read_confirmed: context.ai_boot_protocol.read_order.slice(),
        confirm_current_goal: 'Record failure',
        confirm_phase: 'failure-validation',
        confirm_open_risks: ['stale packet'],
        declare_intended_action: 'report failure',
        whether_wt_required: true,
        context_basis: {
          bridge_generated_at: pointer.bridge_generated_at,
          canonical_pointer_updated_at: pointer.updated_at,
          canonical_pointer_version_seen: pointer.canonical_pointer_version,
          handoff_generated_at: pointer.latest_handoff_generated_at,
          snapshot_id: pointer.latest_snapshot_id,
          snapshot_frozen_at: '',
          latest_semantic_packet_id_seen: 'sp-stale',
          watchtower_gate_status_seen: pointer.watchtower_gate_current_status,
          watchtower_gate_last_checked_at_seen: pointer.watchtower_gate_last_checked_at
        },
        confidence: 1
      });
      const protectedBefore = JSON.stringify({
        consensus_state: context.consensus_state,
        current_truth_snapshot: context.current_truth_snapshot,
        agent_responses: context.agent_responses,
        change_log: context.change_log
      });
      const first = record_failure(context, {
        source_agent: 'Claude',
        failure_type: 'stale_context',
        severity: 'high',
        summary: 'Attempted work from stale context.',
        cause: 'An old semantic packet was referenced.',
        detected_by: 'WTc',
        affected_surfaces: ['bridge.js'],
        recovery_action: 'Stop and refresh canonical state.',
        prevention_rule: 'Run WT Core before editing.',
        status: 'open'
      }, warning.boot_id);
      const second = record_failure(context, {
        source_agent: 'Claude',
        failure_type: 'edit_blocked',
        severity: 'medium',
        summary: 'An edit was blocked pending refresh.',
        detected_by: 'AppDiagnostics',
        status: 'mitigated'
      }, warning.boot_id);
      let rejectsType = false;
      let rejectsSeverity = false;
      let rejectsStatus = false;
      try {
        record_failure(context, {
          source_agent: 'Claude',
          failure_type: 'unknown',
          severity: 'low',
          summary: 'invalid type',
          detected_by: 'WTc'
        }, warning.boot_id);
      } catch (error) {
        rejectsType = /failure_type/.test(error.message);
      }
      try {
        record_failure(context, {
          source_agent: 'Claude',
          failure_type: 'other',
          severity: 'urgent',
          summary: 'invalid severity',
          detected_by: 'WTc'
        }, warning.boot_id);
      } catch (error) {
        rejectsSeverity = /severity/.test(error.message);
      }
      try {
        record_failure(context, {
          source_agent: 'Claude',
          failure_type: 'other',
          severity: 'low',
          summary: 'invalid status',
          detected_by: 'WTc',
          status: 'ignored'
        }, warning.boot_id);
      } catch (error) {
        rejectsStatus = /status/.test(error.message);
      }
      const latest = list_recent_failures(context, 1);
      const markdown = generate_handoff_markdown(context, 'GPT');
      return warning.status === 'completed_with_warning'
        && first.failure_type === 'stale_context'
        && second.status === 'mitigated'
        && context.failure_log.length === 2
        && latest.length === 1
        && latest[0].failure_id === second.failure_id
        && rejectsType
        && rejectsSeverity
        && rejectsStatus
        && markdown.includes('## Negative Memory / Failure Log')
        && markdown.includes('Attempted work from stale context.')
        && JSON.stringify({
          consensus_state: context.consensus_state,
          current_truth_snapshot: context.current_truth_snapshot,
          agent_responses: context.agent_responses,
          change_log: context.change_log
        }) === protectedBefore;
    });
    check('semantic packet promotes to traced memory node', function () {
      const context = bridge_init('BRIDGE', 'diagnostics', 'verification');
      const decision = add_semantic_packet(context, {
        packet_id: 'sp-decision-diagnostic',
        source_agent: 'CODEX',
        type: 'decision',
        content: 'Use packets as graph sources.',
        confidence: 1,
        provenance: 'diagnostics'
      });
      const insight = add_semantic_packet(context, {
        packet_id: 'sp-insight-diagnostic',
        source_agent: 'CODEX',
        type: 'insight',
        content: 'An insight needs deliberate graph typing.',
        confidence: 1,
        provenance: 'diagnostics'
      });
      const packetsBefore = JSON.stringify(context.semantic_packets);
      const autoNode = promote_semantic_packet_to_memory_node(context, decision.packet_id, '', 'Packet decision');
      const explicitNode = promote_semantic_packet_to_memory_node(context, insight.packet_id, 'Shortcut', 'Packet insight');
      let rejectsDuplicate = false;
      try { promote_semantic_packet_to_memory_node(context, decision.packet_id); } catch (error) { rejectsDuplicate = /already promoted/.test(error.message); }
      return autoNode.type === 'Decision'
        && explicitNode.type === 'Shortcut'
        && explicitNode.source_packet_id === insight.packet_id
        && JSON.stringify(context.semantic_packets) === packetsBefore
        && rejectsDuplicate
        && generate_handoff_markdown(context, 'GPT').includes('## Memory Graph Lite');
    });
    check('memory graph edges require validated proposals', function () {
      const context = bridge_init('BRIDGE', 'diagnostics', 'verification');
      const from = add_memory_node(context, 'Risk', 'Unverified route', 'risk', 'CODEX');
      const to = add_memory_node(context, 'Decision', 'Verify route', 'decision', 'CODEX');
      const proposal = propose_memory_edge(context, to.node_id, from.node_id, 'mitigates', 'Verification directly reduces the unverified-route risk.', 'CODEX');
      let rejectsPremature = false;
      try { add_validated_memory_edge(context, proposal.proposal_id); } catch (error) { rejectsPremature = /not validated/.test(error.message); }
      const validated = validate_memory_edge(context, proposal.proposal_id, 'validated', 'CODEX', 'Relation is directly supported by the node contents.');
      const edge = add_validated_memory_edge(context, proposal.proposal_id);
      let rejectsDuplicate = false;
      try { add_validated_memory_edge(context, proposal.proposal_id); } catch (error) { rejectsDuplicate = /already added/.test(error.message); }
      const markdown = generate_handoff_markdown(context, 'GPT');
      return rejectsPremature
        && validated.status === 'validated'
        && edge.proposal_id === proposal.proposal_id
        && rejectsDuplicate
        && markdown.includes('### Validated Relationships')
        && markdown.includes('### Edge Proposals');
    });
    check('canonical pointer update requires privileged actor and records evidence', function () {
      const context = bridge_init('BRIDGE', 'diagnostics', 'verification');
      update_watchtower_gate(context, { status: 'passed', checked_by: 'WATCHTOWER', result_summary: 'OK' });
      let rejectsAgent = false;
      try {
        update_canonical_current_state(context, { updated_by: 'GPT' });
      } catch (error) {
        rejectsAgent = /Human or CODEX/.test(error.message);
      }
      const pointer = update_canonical_current_state(context, { updated_by: 'CODEX', notes: 'diagnostic' });
      const saved = bridge_save(context, 'bridge-context.json', { download: false }).context;
      return rejectsAgent
        && pointer.authority === 'manual-canonical-pointer'
        && pointer.watchtower_gate_current_status === 'passed'
        && pointer.latest_semantic_packet_id === context.semantic_packets[0].packet_id
        && saved.generated_at === pointer.bridge_generated_at
        && context.semantic_packets.length === 1
        && context.change_log.length === 1;
    });
    check('AI boot freshness gates access without changing consensus', function () {
      const context = bridge_init('BRIDGE', 'diagnostics', 'verification');
      const riskNode = add_memory_node(context, 'Risk', 'stale context', 'risk', 'CODEX');
      const decisionNode = add_memory_node(context, 'Decision', 'refresh context', 'decision', 'CODEX');
      update_watchtower_gate(context, { status: 'passed', checked_by: 'WATCHTOWER', result_summary: 'OK' });
      const pointer = update_canonical_current_state(context, { updated_by: 'CODEX' });
      const basis = {
        bridge_generated_at: pointer.bridge_generated_at,
        canonical_pointer_updated_at: pointer.updated_at,
        canonical_pointer_version_seen: pointer.canonical_pointer_version,
        handoff_generated_at: pointer.latest_handoff_generated_at,
        snapshot_id: pointer.latest_snapshot_id,
        snapshot_frozen_at: '',
        latest_semantic_packet_id_seen: pointer.latest_semantic_packet_id,
        watchtower_gate_status_seen: pointer.watchtower_gate_current_status,
        watchtower_gate_last_checked_at_seen: pointer.watchtower_gate_last_checked_at
      };
      const consensusBefore = JSON.stringify(context.consensus_state);
      const responsesBefore = JSON.stringify(context.agent_responses);
      const pureLogBefore = JSON.stringify(context.ai_boot_log);
      const pureResult = validate_context_freshness(context, { context_basis: basis });
      const pureDidNotLog = JSON.stringify(context.ai_boot_log) === pureLogBefore;
      const fresh = record_ai_boot_response(context, {
        boot_id: 'boot-fresh',
        agent: 'GPT',
        read_confirmed: context.ai_boot_protocol.read_order.slice(),
        confirm_current_goal: 'goal',
        confirm_phase: 'phase',
        confirm_open_risks: ['risk'],
        declare_intended_action: 'act',
        whether_wt_required: true,
        context_basis: basis,
        confidence: 1
      });
      const warning = record_ai_boot_response(context, {
        boot_id: 'boot-warning',
        agent: 'Claude',
        read_confirmed: context.ai_boot_protocol.read_order.slice(),
        confirm_current_goal: 'goal',
        confirm_phase: 'phase',
        confirm_open_risks: ['stale packet'],
        declare_intended_action: 'propose',
        whether_wt_required: true,
        context_basis: Object.assign({}, basis, { latest_semantic_packet_id_seen: 'sp-old' }),
        confidence: 1
      });
      const rejected = record_ai_boot_response(context, {
        boot_id: 'boot-reject',
        agent: 'Grok',
        read_confirmed: context.ai_boot_protocol.read_order.slice(),
        confirm_current_goal: 'goal',
        confirm_phase: 'phase',
        confirm_open_risks: ['old gate'],
        declare_intended_action: 'stop',
        whether_wt_required: true,
        context_basis: Object.assign({}, basis, { watchtower_gate_status_seen: 'blocked' }),
        confidence: 1
      });
      let warningEditRejected = false;
      try {
        add_semantic_packet(context, { source_agent: 'Claude', type: 'proposal', content: 'not editable', confidence: 1 }, warning.boot_id);
      } catch (error) {
        warningEditRejected = /access denied/.test(error.message);
      }
      const warningProposal = propose_memory_edge(context, decisionNode.node_id, riskNode.node_id, 'mitigates', 'Proposal remains allowed while editing is blocked.', 'Claude', warning.boot_id);
      let rejectProposalRejected = false;
      try {
        propose_memory_edge(context, decisionNode.node_id, riskNode.node_id, 'supports', 'not allowed', 'Grok', rejected.boot_id);
      } catch (error) {
        rejectProposalRejected = /access denied/.test(error.message);
      }
      const markdown = generate_handoff_markdown(context, 'GPT');
      return pureResult.status === 'fresh'
        && pureDidNotLog
        && fresh.status === 'fresh'
        && fresh.access_mode === 'full_access'
        && warning.status === 'completed_with_warning'
        && warning.access_mode === 'read_and_propose_only'
        && rejected.status === 'reject'
        && rejected.access_mode === 'no_access'
        && warningEditRejected
        && warningProposal.status === 'proposed'
        && rejectProposalRejected
        && context.ai_boot_log.length === 3
        && JSON.stringify(context.consensus_state) === consensusBefore
        && JSON.stringify(context.agent_responses) === responsesBefore
        && markdown.includes('## AI Boot Protocol')
        && markdown.includes('latest_boot: Grok / reject');
    });
    check('recovery checkpoint records a canonical safe resume point only', function () {
      const context = bridge_init('BRIDGE', 'diagnostics', 'verification');
      update_watchtower_gate(context, { status: 'passed', checked_by: 'WATCHTOWER', result_summary: 'OK' });
      update_canonical_current_state(context, { updated_by: 'CODEX' });
      const consensusBefore = JSON.stringify(context.consensus_state);
      const responsesBefore = JSON.stringify(context.agent_responses);
      let rejectsMissingNext = false;
      try {
        save_recovery_checkpoint(context, {
          saved_by: 'CODEX',
          work_status: 'in_progress',
          access_mode_at_save: 'full_access',
          pending_actions: []
        });
      } catch (error) {
        rejectsMissingNext = /pending_actions\[0\]/.test(error.message);
      }
      const saved = save_recovery_checkpoint(context, {
        checkpoint_id: 'rc-diagnostic',
        saved_by: 'CODEX',
        work_status: 'in_progress',
        access_mode_at_save: 'full_access',
        active_task: 'Recovery diagnostics',
        completed_actions: ['Created canonical pointer'],
        pending_actions: ['Resume from this action first', 'Review logs if needed'],
        blocking_issues: [],
        last_safe_operation: 'Saved canonical-aligned recovery point'
      });
      const valid = validate_recovery_checkpoint(context);
      context.canonical_current_state.updated_at = 'changed-later';
      const stale = validate_recovery_checkpoint(context);
      const markdown = generate_recovery_handoff(Object.assign(context, {
        canonical_current_state: Object.assign({}, context.canonical_current_state, { updated_at: saved.canonical_pointer_updated_at })
      }));
      return rejectsMissingNext
        && saved.checkpoint_id === 'rc-diagnostic'
        && valid.status === 'valid'
        && stale.status === 'stale'
        && stale.severity === 'warning'
        && JSON.stringify(context.consensus_state) === consensusBefore
        && JSON.stringify(context.agent_responses) === responsesBefore
        && markdown.includes('# BRIDGE Recovery Handoff')
        && markdown.includes('next_single_action: Resume from this action first');
    });
    lastPersistedContext = persistedBeforeDiagnostics;
    const ok = checks.every(function (entry) { return entry.ok; });
    return {
      ok: ok,
      checks: checks,
      report: [
        'BRIDGE diagnostics: ' + (ok ? 'OK' : 'FAILED'),
        'Checks: ' + checks.length,
        'Failures: ' + checks.filter(function (entry) { return !entry.ok; }).length
      ].concat(checks.map(function (entry) {
        return '- ' + entry.label + ': ' + (entry.ok ? 'OK' : 'FAILED');
      })).join('\n')
    };
  }

  global.AppDiagnostics = {
    runDiagnostics: runDiagnostics,
    runSmokeChecks: runDiagnostics,
    report: function (result) { return result.report; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
