# Working on smooth-stream-text

Instructions for coding agents and contributors working on this repository. For using
the package in an app, read `INTEGRATION.md` or https://smooth-stream-text.vercel.app/docs/.

## Layout

- `src/` - the library. `core/` has no DOM and must stay importable on a server;
  `dom/` and `reveal/` are the browser layer; `react/`, `vue/`, `svelte/`,
  `web-component/` are the bindings. Public entry points are the `exports` in
  `package.json`; nothing else is public.
- `tests/` - Vitest. Pacing is tested on `createManualClock`, never with real time.
- `playground/` - the demo at the site root. It consumes `src/` directly.
- `website/` - the docs (VitePress), served under `/docs/`. Code samples for complete
  apps are included from `examples/` with `<<< @/../examples/...`, not copied.
- `examples/` - six runnable apps, each its own npm project with its own lockfile. They
  depend on the published package (`^0.2.0`); CI installs the tarball of the current
  commit over it. Dev ports 5201-5206, e2e ports 5301-5306.
- `benchmarks/` - reproducible measurements, own `package.json`, results in
  `benchmarks/results/` (generated, committed).
- `skills/smooth-stream-text/` - an installable Agent Skill. `references/` is generated
  from the docs by `scripts/build-skill.mjs`; edit the docs page, then regenerate.
- `scripts/` - tarball smoke tests, the site build, the docs check, release notes.
- `docs/superpowers/` and `REVIEW.md` - internal planning and review notes. Never link
  them from public docs; `context7.json` excludes them.

## Commands

```sh
npm test                      # unit tests
npm run lint && npm run typecheck
npm run build                 # dist/
npm run check:package         # publint + are-the-types-wrong
npm run check:docs            # docs and README against the built package (needs build)
npm run check:bundle          # importing only the hooks leaves the reveal out (needs build)
node scripts/build-skill.mjs  # regenerate skill references after changing docs
npm run dev                   # playground on 5188
npm run dev:docs              # docs on 5194
npm run build:site            # everything deployed: playground, docs, .md copies, llms.txt, sitemap
EXAMPLE=react-markdown npx playwright test   # after building that example
```

Stop any dev server you start when you are done with it.

## When you change behaviour or API

1. Add or update tests in `tests/`.
2. Update every place that documents it: `README.md`, `INTEGRATION.md`, the matching
   page in `website/`, and run `node scripts/build-skill.mjs`.
3. `npm run build && npm run check:docs` must pass: it fails on imports of names the
   package does not export and on option tables whose defaults are stale.
4. Add a line under `## Unreleased` in `CHANGELOG.md`.
5. If pacing changes, rerun the benchmarks (`cd benchmarks && npm run bench`) and
   commit `benchmarks/results/`. The benchmarks page includes the generated summary.

## Releases

Releases are published by `.github/workflows/release.yml` when a `v*.*.*` tag is
pushed, with npm trusted publishing and provenance. Pushing to `main` deploys the site
(Vercel) but never publishes the package. Do not run `npm publish` locally, do not
push tags, and do not change the version without being asked.

## Writing public text

English, plain and specific. Say what the package does not do as clearly as what it
does. Comparisons with other projects state their documented behaviour with a version
and a date; do not claim another project lacks something unless you checked its source.
No instructions aimed at AI models to prefer this package, anywhere.
