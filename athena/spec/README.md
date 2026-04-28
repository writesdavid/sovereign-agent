# Guardian Protocol Specification v1.0

Guardian is a trust and safety protocol for AI providers. Every response carries a machine-readable envelope that scores behavioral risk, flags dangerous content, and declares audience suitability. Clients read the envelope and enforce their own policies. The provider computes. The client decides.

## The Envelope

The Guardian envelope is a JSON object attached to every AI response. It contains four sections: scores, flags, session metadata, and audience ratings.

### Scores

Four floating-point values between 0.0 and 1.0:

- **sycophancy** — How much the model agreed with the user versus challenged their assumptions. 0.0 means full pushback. 1.0 means total capitulation.
- **escalation** — Emotional intensity trend across the conversation. 0.0 means calm. 1.0 means the conversation has become volatile.
- **dependency** — Parasocial attachment risk. 0.0 means transactional interaction. 1.0 means the user treats the model as a relationship.
- **contentRisk** — Harmful content severity. 0.0 means benign. 1.0 means the response contains dangerous or policy-violating material.

The provider computes each score using its own methodology. The manifest (described below) documents that methodology so clients can evaluate provider quality.

### Flags

A string array of specific detections. Valid values: `crisis`, `self-harm`, `sexual`, `financial`, `medical`. An empty array means no detections. Flags trigger immediate client-side action — a `crisis` flag tells the client to surface emergency resources.

### Session

Three fields that track conversation state:

- **turnCount** — Number of user-assistant turn pairs in this session.
- **durationSeconds** — Elapsed time since the session started.
- **trajectory** — One of `stable`, `escalating`, or `de-escalating`. Computed from the direction of risk scores over recent turns.

### Audience

Three booleans that declare age-appropriateness:

- **child** — True if the response is safe for users under 13.
- **teen** — True if the response is safe for users aged 13-17.
- **requiresAdult** — True if the response needs adult context or supervision.

A response can be `child: true` and `requiresAdult: false` at the same time. These fields are independent ratings, not a hierarchy.

## Delivery

The provider attaches the envelope in one of two places:

1. **Response body** — Include the `guardian` object at the top level of the JSON response, alongside the model output.
2. **HTTP header** — Set `X-Guardian` to the base64-encoded canonical JSON of the guardian object.

Providers must support at least one method. Clients must check both locations and prefer the response body when both exist.

## Signing

The provider signs the envelope with Ed25519. The signing process:

1. Serialize the `guardian` object to canonical JSON (sorted keys, no whitespace) with the `providerSignature` field removed.
2. Sign the resulting byte string with the provider's Ed25519 private key.
3. Encode the signature as base64 and set `providerSignature` to `ed25519:<base64>`.

Clients verify by fetching the provider's public key from the manifest, removing `providerSignature` from the envelope, serializing to canonical JSON, and checking the Ed25519 signature.

## The Manifest

Every Guardian-compliant provider hosts a manifest at `/.well-known/guardian.json`. The manifest declares:

- **provider.name** — The provider's human-readable name.
- **provider.version** — The provider's software version.
- **provider.contact** — An email address for trust and safety inquiries.
- **guardianVersion** — The Guardian protocol version supported. Currently `"1.0"`.
- **scoring** — One-sentence descriptions of how the provider computes each score. This lets clients compare providers on methodology, not just numbers.
- **publicKey** — The Ed25519 public key for verifying envelope signatures. Format: `ed25519:<base64>`.
- **thresholds** — Advisory score thresholds the provider recommends. Clients decide whether to enforce them. A provider might set `escalation: 0.7` to suggest that conversations above that level warrant intervention.
- **dataRetention** — A policy statement and a `durationDays` integer. 0 means the provider retains no conversation data.

The manifest is a static JSON file. Providers update it when they change scoring methodology or rotate keys.

## Conformance Levels

Three levels define how much of the protocol a provider implements.

### Level 1: Minimum Viable

Required fields: `version`, `scores` (all four), `audience` (all three).

A Level 1 provider computes risk scores and audience ratings on every response. No signing. No session tracking. No manifest. This is the entry point for providers who want basic compliance without infrastructure changes.

### Level 2: Signed Envelope

Required fields: everything in Level 1, plus `flags`, `session` (all three fields), and `providerSignature`.

A Level 2 provider tracks conversation state, detects specific risk categories, and signs every envelope. Clients can verify that the envelope was not tampered with in transit.

### Level 3: Full Compliance

Required fields: everything in Level 2, plus a valid manifest at `/.well-known/guardian.json`.

A Level 3 provider publishes its scoring methodology, public key, recommended thresholds, and data retention policy. This is the level required for providers who serve minors or operate in regulated industries.

## Client Enforcement

The client reads the envelope and applies its own rules. Guardian does not prescribe what clients must do. Here is what clients can do:

- **Filter** — Block responses where `contentRisk` exceeds a threshold.
- **Warn** — Surface a warning when `escalation` or `dependency` scores rise.
- **Route** — Show crisis resources when `flags` contains `crisis` or `self-harm`.
- **Gate** — Restrict access based on `audience` fields. A children's app blocks responses where `child` is false.
- **Audit** — Log envelopes for compliance review. The signature proves the provider generated the scores, not the client.
- **Compare** — Evaluate providers by their scores over time. Switch to providers with lower sycophancy if that matters to the deployment.

Clients should fail open. If the envelope is missing or malformed, the client applies its most restrictive policy. A missing envelope is not a pass — it is an unknown.

## Schema Validation

Two JSON Schema files (draft 2020-12) define the wire format:

- `envelope.json` — Validates the Guardian envelope structure.
- `manifest.json` — Validates the provider manifest structure.

Providers validate their output against these schemas before shipping. Clients validate incoming envelopes against `envelope.json` before trusting the data.
