# PRD: Phase 2 — Cascading Failure Circuit Breakers & Degraded Modes

**Ticket ID:** 697bfa62-e21b-420e-b69c-266e4e1052e7
**Status:** Draft — Pending Cross-Functional Review
**Authors:** Nexus Architecture Team
**Date:** 2026-03-21

---

## 1. Problem Statement

Nexus Command currently lacks a formalized, system-wide circuit breaker strategy for handling correlated infrastructure failures. When external dependencies such as the GitHub API or the pg-boss queue database become unavailable, the system continues accepting work. This behavior:

- Burns compute capacity on requests that cannot be fulfilled
- Creates zombie tickets that are enqueued but never processed
- Erodes user trust by silently failing instead of providing actionable error responses

This PRD defines the required circuit breaker thresholds, degraded-mode contracts, telemetry requirements, and cross-functional review gates to address these gaps.

---

## 2. Scope

This PRD covers:

- State-aware circuit breaker logic for external Git provider APIs (e.g., GitHub)
- HTTP 503 rejection rules for system-wide degraded states
- Prohibition of synchronous fallback paths when pg-boss is unavailable
- Required telemetry events
- User-facing error payload standards
- Cross-functional sign-off requirements before implementation

Out of scope: per-agent retry logic, LLM provider failover (covered separately), and UI-layer error display.

---

## 3. Acceptance Criteria

### 3.1 State-Aware Circuit Breaker Thresholds

The system MUST implement circuit breakers for the following external dependencies:

| Dependency | Trip Threshold | Reset Window | States |
|---|---|---|---|
| GitHub API (REST/GraphQL) | 3 consecutive 5xx responses within 60 s | 120 s half-open probe | CLOSED → OPEN → HALF_OPEN |
| pg-boss queue database | 1 failed health check | 30 s probe interval | CLOSED → OPEN → HALF_OPEN |
| LLM provider API | 5 consecutive 5xx responses within 120 s | 180 s half-open probe | CLOSED → OPEN → HALF_OPEN |

Circuit breakers MUST be implemented at the adapter layer (`src/adapters/`) so that all consumers automatically benefit without per-call changes.

### 3.2 HTTP 503 Rejection Rules

When any circuit breaker is in the OPEN state:

- All new inbound requests to affected endpoints MUST be rejected immediately with HTTP `503 Service Unavailable`.
- Responses MUST include a `Retry-After` header specifying the earliest time the client may retry (in seconds or as an HTTP-date).
- Responses MUST include a structured JSON body (see Section 5).
- The system MUST NOT enqueue work for a dependency whose circuit breaker is OPEN.

Example header:
```
HTTP/1.1 503 Service Unavailable
Retry-After: 120
Content-Type: application/json
```

### 3.3 pg-boss Unavailability — Synchronous Fallback Prohibited

If the pg-boss queue database becomes unavailable:

- The system MUST NOT attempt any synchronous in-memory fallback queue.
- Synchronous fallbacks violate the system's memory isolation constraints and risk API process OOM conditions under load.
- The circuit breaker MUST trip immediately on the first detected failure of the queue database.
- All ticket creation and job dispatch endpoints MUST return HTTP 503 until the queue database recovers.

**Rationale:** An in-memory fallback would silently absorb work at unbounded cost and reintroduce the zombie-ticket problem in a new form.

### 3.4 Required Telemetry

The following structured telemetry events MUST be emitted:

| Event Name | Trigger | Required Fields |
|---|---|---|
| `circuit_breaker_tripped` | Breaker transitions CLOSED → OPEN | `dependency`, `reason`, `trip_count`, `timestamp` |
| `circuit_breaker_reset` | Breaker transitions OPEN → CLOSED | `dependency`, `downtime_seconds`, `timestamp` |
| `degraded_mode_active` | Any breaker enters OPEN state | `affected_dependencies[]`, `timestamp` |
| `degraded_mode_cleared` | All breakers return to CLOSED | `timestamp` |
| `request_rejected_degraded` | A request is rejected due to an OPEN breaker | `dependency`, `endpoint`, `timestamp` |

All events MUST be emitted via the existing telemetry logger (`agents/telemetry/logger.ts`) using structured JSON payloads compatible with the current log format.

### 3.5 User-Facing Error Payloads

All 503 responses MUST return the following JSON structure to ensure clarity about degraded state:

```json
{
  "error": "service_degraded",
  "message": "Nexus Command is temporarily unable to process requests due to an upstream dependency outage.",
  "degraded_dependencies": ["github_api"],
  "retry_after_seconds": 120,
  "support_reference": "<request-id>"
}
```

Requirements:
- `degraded_dependencies` MUST list each dependency whose circuit breaker is OPEN.
- `retry_after_seconds` MUST match the `Retry-After` header value.
- `support_reference` MUST be populated with the request's trace/correlation ID for support triage.
- The payload MUST NOT expose internal stack traces or configuration details.

---

## 4. Measurement & Validation Plan

### 4.1 Integration Tests

The following integration test scenarios MUST pass before implementation is considered complete:

1. **GitHub API Outage Simulation:** Simulate 3 consecutive HTTP 5xx responses from the GitHub API adapter stub. Assert that the circuit breaker trips, subsequent requests return HTTP 503 with `Retry-After`, and `circuit_breaker_tripped` telemetry is emitted.

2. **pg-boss Failure:** Simulate a pg-boss connection failure. Assert that ticket creation returns HTTP 503 immediately, no in-memory queue is populated, and `degraded_mode_active` telemetry is emitted.

3. **Recovery Path:** After the simulated outage clears, assert that the circuit breaker transitions through HALF_OPEN to CLOSED, `circuit_breaker_reset` and `degraded_mode_cleared` events are emitted, and normal operations resume.

4. **Retry-After Header Compliance:** Assert that all 503 responses include a valid `Retry-After` header with a non-zero value.

### 4.2 Observability Validation

Confirm that all five telemetry events appear in the log stream during integration test execution with correct field schemas.

---

## 5. Cross-Functional Review Gate (Mandatory)

**This PRD MUST NOT proceed to implementation until both of the following sign-offs are obtained.**

### 5.1 SRE Sign-Off

SRE review must evaluate:

- **SLO Impact:** Does the proposed circuit breaker reset window (120 s for GitHub, 30 s for pg-boss) align with existing error budget allocations?
- **Queue Depth Risk:** What is the maximum safe queue depth before a pg-boss outage causes cascading backpressure? Does the circuit breaker trip early enough?
- **Reliability Risk:** Are the trip thresholds (e.g., 3 consecutive failures) appropriately conservative given normal transient error rates, or will they cause false-positive degraded-mode activations?

Reviewer: SRE Persona (`ai-agent-sre.md`)
Required field in SRE findings: `Affected Application(s): nexus`

### 5.2 CISO Sign-Off

CISO review must evaluate:

- **Availability Risk:** Does the degraded-mode design prevent abuse by malicious actors who could intentionally trip circuit breakers via targeted 5xx injection?
- **DDoS Mitigation:** Does returning HTTP 503 early (with `Retry-After`) reduce or increase attack surface for amplification/retry storms?
- **Information Disclosure:** Does the user-facing error payload (Section 3.5) disclose information that could assist an attacker in mapping system dependencies?

Reviewer: CISO Persona
Required outcome: Explicit approval or required changes before implementation begins.

---

## 6. Fallback Plan

If dynamic circuit breakers are too complex for v1 implementation:

**Fallback:** Implement a manual kill switch via a `DEGRADED_MODE` environment variable. When set to `true`, the API immediately returns HTTP 503 with a `Retry-After: 300` header on all endpoints. Ops can toggle this variable to force degraded mode during known outage windows without a code deploy.

This fallback provides the critical user-trust and compute-protection benefits while deferring the complexity of automated threshold detection to a subsequent iteration.

---

## 7. Open Questions

1. Should circuit breaker state be persisted in the database (to survive process restarts) or kept in-process memory only?
2. What is the correct granularity for GitHub API circuit breakers — per-token, per-repo, or global?
3. Should the HALF_OPEN probe use a lightweight health-check endpoint or a real operation?

---

## 8. References

- Agent Discussion Context: Synthesized from Phase 2 architecture review. Consensus that synchronous fallback during queue failure violates isolation constraints and that downstream provider outages must trigger a halt to prevent compute burn.
- Existing telemetry infrastructure: `agents/telemetry/logger.ts`
- SRE persona guardrails: `personas/ai-agent-sre.md` — requires `Affected Application(s):` field in all findings.
- Intent routing telemetry patterns: `agents/router/` — model for structured event logging.
