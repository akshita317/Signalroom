# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
# Signalroom

AI incident intelligence for calmer, faster production response.

Signalroom turns a messy production report into an evidence-backed incident brief, a likely cause, and an owner-ready action plan. It is designed as a portfolio project for software engineering and applied AI roles: the prototype is usable without an API key, while the production architecture is ready for retrieval, structured model output, evaluation, and human approval.

## Run locally

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5173/`.

## Validate

```bash
npm run build
```

## Learn the project

Read [PROJECT_GUIDE.md](PROJECT_GUIDE.md) for the product story, demo walkthrough, AI architecture, interview explanation, roadmap, and resume bullets.

## Current prototype

- Editable incident intake
- Deterministic analysis state for a no-key demo
- Incident brief, evidence, and action-plan views
- Explainable model notes and confidence display
- Collaboration save and notify feedback
- Responsive desktop and mobile layout

## Recommended next build

Connect a backend analysis endpoint that retrieves runbooks, deploy history, and ownership data, then returns a validated structured incident schema. Keep human approval before any production action.
