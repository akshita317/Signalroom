# Signalroom

AI incident intelligence for calmer, faster production response.

Signalroom turns a messy production report into an evidence-backed incident brief, a likely cause, and an owner-ready action plan. It is designed as a portfolio project for software engineering and applied AI roles: the prototype is usable without an API key, while the production architecture is ready for retrieval, structured model output, evaluation, and human approval.

## Run locally

```bash
npm install
npm run dev
npm run dev:server
```

Run the frontend and API in separate terminals, then open `http://127.0.0.1:5173/`.

Copy `.env.example` to `.env` for the API. Without `OPENAI_API_KEY`, the server uses a deterministic demo provider. Add an OpenAI key to use the real LLM path.

## Validate

```bash
npm run build
```

## Learn the project

Read [PROJECT_GUIDE.md](PROJECT_GUIDE.md) for the product story, demo walkthrough, AI architecture, interview explanation, roadmap, and resume bullets.

## Implemented capabilities

- Editable incident intake
- Real OpenAI analysis with a safe deterministic fallback
- Retrieved runbooks, deploy timeline, and service ownership context
- Zod-validated structured incident JSON
- JWT authentication with registration and login
- File-backed saved investigations for local development
- Incident brief, evidence, and action-plan views
- Confidence and model reasoning notes
- Evaluation metrics endpoint at `/api/evaluations`
- Human approval endpoint before any production action
- Responsive desktop and mobile layout

## API scripts

```bash
npm run dev:server
npx tsc -p tsconfig.server.json --noEmit
```

The server stores local users and investigations under `data/`, which is intentionally gitignored.
