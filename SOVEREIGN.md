# Sovereign: A Protocol for Agent-Mediated Intent

**David Hamilton — Open Primitive — April 2026**

## Abstract

The internet bends people toward brands. Every interface, notification, and dark pattern exists to capture attention and convert it into revenue. AI agents break this architecture. Sovereign defines a protocol where the internet bends toward the individual — where agents carry signed intent, services respond with verified data, and the person holds the keys.

## 1. The Problem

Every digital design decision points in one direction: bend the user toward the brand's will.

A person searches for a flight. The airline shows 14 upsells, 3 pop-ups, a cookie wall, and a price that changes based on browsing history. The person wanted a seat from A to B. The brand wanted maximum extraction.

This pattern repeats across every service. Grocery delivery apps place high-margin items first. Social platforms optimize feed order for engagement, not relevance. News sites bury the article behind a modal. The design vocabulary of the modern internet — infinite scroll, notification badges, countdown timers, "only 2 left" — exists to override intent with impulse.

73% of online shopping carts get abandoned. Not because people changed their minds. Because the path from intent to action runs through a gauntlet designed to exploit them.

This is not how good machines work. A thermostat does not try to sell you a higher temperature. A light switch does not show an ad before turning on. Good machines serve the intent of the person who uses them. The internet became a bad machine.

## 2. The Structural Shift

AI agents change the architecture.

When an agent handles your intent, the brand's capture mechanisms stop working. The agent does not see pop-ups. It does not feel urgency from a countdown timer. It does not get distracted by a recommendation carousel. It queries data, compares options, and acts.

The interface designed to capture attention gets bypassed entirely. What remains is the data underneath — prices, availability, specifications, terms. The agent negotiates on facts, not feelings.

This shift is structural, not incremental. The entire capture economy depends on a human at the screen. Remove the human from the screen — put an agent between the person and the service — and the economics of attention collapse.

Services that survive this shift will compete on one thing: how well they fulfill intent.

## 3. The Protocol

Sovereign defines four layers.

**Layer 1: DATA.** Every response from a service carries a cryptographic signature. Ed25519 keypair. The response includes the payload, a timestamp, and the signer's public key — the OPP envelope format. Any agent can verify that the data came from who it claims, and that nothing changed in transit. No certificate authority. No central trust store. The signature is the proof.

**Layer 2: IDENTITY.** A keypair generated on the person's device. No registry. No username. No OAuth provider holding your session. The private key stays on the device. The public key is the identity. The agent signs every request with this key. Services verify the signature. That is the entire identity system.

**Layer 3: INTENT.** The person states what they want. "Book a flight from Portland to Tokyo, departing June 12, returning June 26, under $1,200." The agent translates this into structured queries. It sends signed intent objects to services that accept them. Each intent object contains the goal, constraints, and the person's public key. Services respond with signed offers.

**Layer 4: ACTION.** The agent acts on the person's behalf through a negotiation protocol. Three operations: propose, accept, reject. A service proposes terms. The agent evaluates against the person's constraints. It accepts, rejects, or proposes a counter. Every step is signed. Every step is logged locally.

**Memory: local-first.** All agent memory — past intents, preferences, service interactions — encrypts on the person's device. Scoped permissions control what any service can read. The person revokes access at any time. No cloud sync required. Portable between agents.

## 4. Self-Custody

Bitcoin proved one principle: if you hold the private key, you own the asset.

Sovereign applies the same principle to identity, intent, and data.

Private key on device = you own your identity. No platform can delete your account, because no platform issued it. You generated it. You hold it.

Every intent is a signed transaction. Your agent broadcasts what you want, signed with your key, the same way a Bitcoin wallet broadcasts a payment. The signature proves the intent came from you. No intermediary confirms it.

Every permission is logged and revocable. A service asks to read your dietary preferences to recommend restaurants. You grant scoped access. The grant is signed and timestamped. You revoke it Tuesday. The revocation is signed and timestamped. The audit trail lives on your device.

The wallet model works. 300 million people already hold private keys for money. The same model holds for identity.

## 5. The Provider Model

Any service can accept sovereign intents. A provider needs three things:

1. An Ed25519 keypair to sign responses.
2. An endpoint that accepts structured intent objects.
3. A signed capability manifest — a machine-readable list of what the service does, what inputs it needs, and what terms it offers.

That is it. No SDK. No approval process. No marketplace listing fee. A provider generates a keypair, publishes a manifest, and starts responding to intents.

This mirrors how Bitcoin adoption spread. A merchant does not apply to accept Bitcoin. A merchant installs software and starts accepting Bitcoin. The network grows when providers adopt the protocol, not when users adopt a product.

The adoption cost is low. The manifest format is JSON. The signing takes 4 lines of code. The intent schema is open and versioned.

## 6. What Changes

Companies stop designing to capture attention and start designing to fulfill intent.

When an agent handles the interaction, the dark pattern budget goes to zero. No one designs a pop-up for a machine. The money moves from attention engineering to service quality. The airline that wins is the one with the best price and the most reliable data — not the one with the most aggressive upsell flow.

User intent becomes a human fact, not a conversion metric. A person wants a flight. That is a fact about the person. The current internet treats it as a lead to be funneled. Sovereign treats it as a signed request to be fulfilled.

The best brands already know this. They build products that help people do what they actually want. Sovereign makes this the default, not the exception. The protocol rewards fulfillment, not manipulation.

Advertising does not disappear. It changes form. A provider can include offers in its response. But the agent filters based on the person's stated intent. Relevance stops being a targeting algorithm and starts being a constraint the person defined.

## 7. Reference

The reference exists as working code.

`sovereign-agent` — the agent runtime. Generates keypairs, signs intents, verifies responses, stores memory locally with AES-256 encryption.

Open Primitive Protocol — the data layer. 25 live endpoints returning Ed25519-signed responses in OPP envelope format. 22 MCP tools for agent consumption. Running on Cloudflare Workers. Daily verified uptime since March 2025.

This is not a proposal. The protocol runs. The data layer serves signed responses now. The agent signs intents now. Providers can accept sovereign intents today.

Source: github.com/writesdavid/sovereign-agent

## 8. Conclusion

The internet bent people toward brands for 30 years. AI agents broke the mechanism. Sovereign defines how the internet bends toward you — through signed identity, structured intent, verified data, and local-first memory. The keys are yours. The protocol is open. The code runs.
