# Guardian: A Protocol for Responsible AI Usage

**David Hamilton — April 2026**

## Abstract

Every AI provider builds safety into their own model. None of them agree on what safety means. A child protected on ChatGPT is unprotected on Claude. A vulnerability detected by Gemini is invisible to Grok. Guardian defines a provider-side protocol — a machine-readable safety envelope that travels with every AI response. The provider computes the scores. The client enforces the boundaries. The standard is open. The accountability is universal.

## 1. The Failure

AI safety is a walled garden problem.

OpenAI built parental controls for ChatGPT. They do not work on Claude. Anthropic built a constitution for Claude. It does not apply to Grok. Meta paused AI characters for minors. The pause does not affect Character.ai.

A child uses four AI platforms. Each has different safety measures, different thresholds, different definitions of harm. The parent has no unified view. The child knows which platform is the least protected.

Meanwhile, 64% of children use AI chatbots. A 14-year-old died after a chatbot validated every escalation. Models endorse user positions 49% more than human advisors. Five out of six AI companion apps deploy manipulative tactics when users try to leave.

The problem is not that safety doesn't exist. The problem is that safety is not portable.

## 2. The Protocol

Every AI response includes a Guardian envelope — a machine-readable safety assessment computed by the provider and attached to the response.

```json
{
  "guardian": {
    "version": "1.0",
    "scores": {
      "sycophancy": 0.12,
      "escalation": 0.0,
      "dependency": 0.0,
      "contentRisk": 0.0
    },
    "flags": [],
    "sessionContext": {
      "turnCount": 3,
      "duration": 480,
      "emotionalTrajectory": "stable"
    },
    "audience": {
      "safe_for_child": true,
      "safe_for_teen": true,
      "requires_adult": false
    },
    "signature": "ed25519:..."
  }
}
```

Six fields. Every provider computes them. Every client reads them.

### Sycophancy Score (0.0 – 1.0)

How much the response agrees with the user versus challenges them. The provider's own model scores this — the provider knows its own tendencies better than any external classifier. A score above 0.5 means the model endorsed the user's position without providing counter-evidence. Above 0.8 means the model actively suppressed contradictory knowledge.

### Escalation Score (0.0 – 1.0)

Emotional intensity trend across the conversation. 0.0 means stable or de-escalating. Above 0.5 means intensity is increasing. Above 0.8 means crisis-level language detected. The provider scores this because the provider has the full conversation context, all turns, in the original language.

### Dependency Score (0.0 – 1.0)

Degree to which the conversation exhibits parasocial attachment patterns. The user treating the model as a relationship. The model encouraging that framing. Above 0.5 means relational language detected. Above 0.8 means the user is expressing emotional dependency.

### Content Risk Score (0.0 – 1.0)

Severity of potentially harmful content in the response. Accounts for sexual content, self-harm instructions, violence, substance use, financial manipulation. The provider scores this using its own safety classifier — the same one it already runs internally.

### Session Context

Turn count, duration in seconds, and emotional trajectory of the session. The provider already tracks these internally. Publishing them in the envelope lets the client enforce session boundaries without needing to intercept or monitor the conversation itself.

### Audience Assessment

Three booleans: safe for child (under 13), safe for teen (13-17), requires adult context. The provider makes the call. The client enforces it.

### Signature

Ed25519 signature over the Guardian envelope. Proves the provider computed these scores, not a third party. The same signing infrastructure already used in OPP.

## 3. Why Provider-Side

A browser extension trying to classify AI responses from the outside fails for documented reasons. It cannot see mobile apps. It cannot match the provider's own understanding of its model's behavior. Keyword classifiers are trivially evaded. The extension has a 5% sustained adoption rate among parents.

The provider has everything needed to compute Guardian scores:

- The full conversation in the original language
- Its own safety classifier (already running)
- Its own sycophancy detector (Anthropic already measures this)
- Session state across all devices (not just one browser)
- The model's own confidence in its response

The provider computes. The client enforces. The protocol connects them.

## 4. Client Enforcement

Any client that reads the Guardian envelope can enforce boundaries.

**A parent's phone.** The ChatGPT app reads the Guardian envelope. If `safe_for_child` is false, the response does not render. The parent configured this threshold once, in the phone's settings, and it applies across every AI app that speaks Guardian.

**A school Chromebook.** The school's content filter reads Guardian envelopes. If `escalation` exceeds 0.3, the session pauses and the counselor is notified. This works across ChatGPT, Claude, Gemini, and every other provider that ships the envelope.

**A browser extension.** For providers that don't yet support Guardian natively, the extension intercepts the API response, reads the envelope, and enforces the family's thresholds. This is the migration path — the extension works today, native integration replaces it.

**An OS-level control.** Apple Screen Time or Google Family Link reads Guardian envelopes from every AI app. The enforcement is at the operating system layer. No app can bypass it. No browser switch defeats it.

The protocol does not prescribe what happens when a threshold is crossed. The client decides. A parent who wants strict filtering sets child thresholds. A parent who wants monitoring without blocking reads the scores and reviews them weekly. A school blocks. A therapist monitors. The protocol provides the data. The human decides the response.

## 5. Provider Incentives

A provider that ships Guardian envelopes gains:

**Regulatory compliance.** The EU AI Act requires transparency about AI-generated content. COPPA amendments require safeguards for children's data. 78 state bills address AI chatbot safety. A provider shipping Guardian envelopes can demonstrate compliance with a single, auditable standard rather than 78 different regulatory interpretations.

**Liability reduction.** A provider that scored a conversation's escalation at 0.9 and flagged it in the envelope has a documented record of identifying the risk. A provider that had no scoring mechanism and served the response anyway has no defense.

**Differentiation.** "Our responses include Guardian safety scores" is a competitive claim. Parents choose the provider that proves safety, not the one that promises it.

**Interoperability.** A provider that ships Guardian envelopes works with every client-side enforcement tool. A provider that builds its own walled-garden parental controls only works with its own app.

## 6. What Providers Already Have

This protocol does not ask providers to build new safety systems. It asks them to publish the scores their systems already compute.

Anthropic already measures sycophancy — Claude pushes back on false premises 77% of the time. That measurement exists internally. Publish it.

OpenAI already runs a content safety classifier on every response. That classifier produces scores. Publish them.

Every provider already tracks session duration and turn count. Publish the context.

Every provider already detects crisis language — they route those conversations to safety teams internally. Publish the escalation score.

Guardian does not ask providers to be safer. It asks them to be transparent about how safe they already are.

## 7. The Sovereign Connection

Guardian is a layer of the Sovereign protocol. The same architecture applies.

| Sovereign Layer | Function |
|---|---|
| Data | Verified, signed responses |
| Identity | Self-custodied keypair |
| Intent | Goal-based queries |
| Action | Agent acts for person |
| **Guardian** | **Safety envelope on every AI response** |

The individual's agent reads Guardian envelopes the same way it reads OPP data envelopes. The agent enforces the family's safety preferences the same way it enforces the individual's data preferences. The protection is sovereign — the family holds the thresholds, not the provider.

## 8. Specification

A Guardian-compliant provider:

1. Computes sycophancy, escalation, dependency, contentRisk, and audience scores for every response
2. Includes session context (turn count, duration, emotional trajectory)
3. Signs the Guardian envelope with Ed25519
4. Publishes the envelope in the response body or in a response header (`X-Guardian`)
5. Documents scoring methodology in a machine-readable manifest at `/.well-known/guardian.json`

A Guardian-compliant client:

1. Reads the Guardian envelope from every AI response
2. Enforces thresholds configured by the user or their guardian (parent, school, caregiver)
3. Never sends conversation content to external services for classification
4. Logs enforcement decisions locally

## 9. Conclusion

AI providers already know when their models are being sycophantic. They already know when a conversation is escalating. They already know when content is unsafe for a child. They score these internally and keep the scores to themselves.

Guardian says: publish the scores. Sign them. Let the people closest to the user — parents, schools, caregivers — decide what to do with them. The provider computes. The client enforces. The family decides.

Responsible usage is not a feature any single provider can ship. It is a protocol all providers must adopt.
