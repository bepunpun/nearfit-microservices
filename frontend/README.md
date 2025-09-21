# NearFit frontend

Angular app (standalone components, signals) with a Leaflet map. See the
[root README](../README.md) for how to run the whole project.

```bash
npm start              # dev server on http://localhost:4200 (API expected on :4100, the gateway)
npm run build          # production build into dist/frontend/browser
npm test -- --watch=false
```

The API base URL comes from `src/environments/`: `http://localhost:4100/api` in
development (the gateway), and same-origin `/api` in the production build (the
nginx container serves the app and proxies `/api` to the gateway).
