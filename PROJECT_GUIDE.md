# Signalroom

## The name

**Signalroom** is the recommended name.

It sounds like a real engineering product: a place where a team brings signals together, understands what is happening, and decides what to do next.

Suggested subtitle:

> AI incident intelligence for calmer, faster production response.

Other names considered:

- **Tracewise**: clear and technical, but more generic.
- **Relay**: memorable, but too broad.
- **Rootline**: good for debugging, but less collaborative.

## The one-sentence explanation

Signalroom turns a messy production incident report into an evidence-backed incident brief, a likely cause, and an owner-ready action plan.

## The 30-second explanation

When a production issue happens, engineers usually have to read a Slack thread, scan dashboards, check recent deploys, and decide who should do what. Signalroom gives them one place to paste the noisy report. It extracts the important signals, compares them, explains its reasoning, and suggests the safest next action. The key design choice is that it shows evidence and confidence instead of presenting an unexplained AI answer.

## The problem

Incident response is often slow because the information is fragmented:

- Error reports are written in inconsistent language.
- Logs, metrics, deploys, and customer reports live in different tools.
- The first response is often a guess instead of a shared, auditable decision.
- Teams lose time deciding ownership and sequence of actions.

Signalroom reduces the time between "something is wrong" and "we have a responsible next move."

## How the demo works

1. Open the app at `http://127.0.0.1:5173/`.
2. Read the preloaded checkout incident.
3. Point out the three signal cards: customer impact, likely fault domain, and evidence quality.
4. Click **Re-analyze signal** to show the analysis state.
5. Open **Evidence** to show the corroborating signals.
6. Open **Action plan** to show owner-ready tasks.
7. Use **Why this read?** to explain temporal matching, negative evidence, and reversible-first reasoning.
8. Click **Save & notify team** to show the collaboration workflow.

## Current architecture

The app now has a typed Express API. It uses a deterministic provider when no API key is configured and switches to OpenAI when `OPENAI_API_KEY` is present:

```text
Slack / PagerDuty / Jira / GitHub / metrics
                    |
                    v
          Signal ingestion service
                    |
                    v
       Normalize + redact sensitive data
                    |
                    v
       Retrieval over runbooks and history
                    |
                    v
      LLM structured incident analysis
                    |
                    v
 Evidence + confidence + action plan schema
                    |
                    v
       Human review and team notification
```

The local backend exposes authentication, analysis, saved investigations, evaluation metrics, and approval routes. Local persistence uses JSON files so the project can run without a database; replace this adapter with Postgres or a managed database for deployment.

The model should return structured JSON, not free-form prose only. A useful result would include:

- incident summary
- affected service and region
- customer impact
- evidence for each hypothesis
- evidence against each hypothesis
- confidence score
- recommended actions
- owner suggestions
- unresolved questions

## AI engineering decisions to explain

### Retrieval-augmented generation

The model should retrieve relevant runbooks, recent deploy notes, service ownership data, and similar past incidents before generating a recommendation. This makes the answer specific to the company instead of generic troubleshooting advice.

### Grounded recommendations

Every important recommendation should link to an input signal or retrieved document. If there is not enough evidence, Signalroom should say that the confidence is low and ask for a specific missing signal.

### Guardrails

Before analysis, redact secrets and customer data. After analysis, validate the response against a schema and reject unsafe or incomplete actions. The system should recommend a rollback or traffic shift, but never execute production changes automatically without human approval.

### Evaluation

Build a small evaluation set from historical incidents. Measure:

- factual accuracy of extracted signals
- correct service and region identification
- quality of evidence links
- usefulness of the first recommended action
- calibration of the confidence score
- time saved compared with the existing workflow

## What to build next

### Phase 1: Production hardening

- Replace JSON persistence with Postgres.
- Add secret redaction before model calls.
- Add rate limits, refresh-token rotation, and account recovery.
- Add GitHub API ingestion instead of seeded deploy context.
- Add a real evaluation dataset and CI evaluation gate.

### Phase 2: More useful context

- Import GitHub deploys and pull requests.
- Add Slack or PagerDuty ingestion.
- Add a small runbook library with search.
- Add service ownership and escalation rules.
- Store investigations so users can revisit them.

### Phase 3: Production operations

- Add authentication and team workspaces.
- Redact secrets before sending text to a model.
- Add audit logs for every AI recommendation.
- Add evaluation dashboards and feedback buttons.
- Add human approval before any operational action.

## Interview explanation

### For an SDE1 interview

> I built Signalroom, a React and TypeScript incident response workspace. The main engineering challenge was turning an ambiguous incident report into a predictable workflow: signal intake, analysis, evidence, action ownership, and team notification. I kept the UI state explicit, made the analysis explainable, and designed the interface to handle loading and collaboration states rather than only showing a final answer.

### For an applied AI interview

> The interesting part is not adding a chat box. Signalroom treats incident analysis as a structured decision problem. A real implementation would use retrieval over runbooks and deploy history, ask the model for a validated schema, attach evidence to each hypothesis, calibrate confidence against historical incidents, and keep a human in the loop before any production change.

### If asked what is not finished

> The prototype now has a real backend contract, authentication, persistence, structured validation, and approval workflow. Without an API key it deliberately uses a deterministic provider so the demo remains reproducible. The next production steps are secret redaction, managed persistence, live GitHub ingestion, and evaluation against historical incidents.

## Resume bullets

- Built Signalroom, a React and TypeScript AI incident intelligence workspace that converts unstructured production reports into explainable briefs, evidence views, and owner-ready action plans.
- Designed a grounded AI workflow with retrieval, structured output validation, confidence scoring, redaction, auditability, and human approval as first-class production concerns.
- Implemented responsive interaction states for analysis, evidence review, action planning, and team notification using Vite, React, TypeScript, and Lucide icons.

## Product principle

**The AI should make the team's reasoning clearer, not make the team less responsible.**
