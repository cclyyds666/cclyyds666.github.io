# Deprecated root backend

The production and local entrypoint is **`render-backend/`**.

- Deploy: root `render.yaml` runs `cd render-backend && npm ci` / `npm start`
- Static site: `render-backend/public/` (GitHub Pages + Render static)
- Tests: `render-backend/tests/api.test.js`

This `src/` tree is kept only so old local scripts do not break paths by accident.
Do **not** add new features here. Change `render-backend/src/` instead.
