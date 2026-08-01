# smooth-stream-text Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `smooth-stream-text` to npm - a zero-dependency library that paces bursty LLM text into a visually even stream and reveals it as a left-to-right wave, with a headless-first core and wrappers for React, Vue, Svelte and Web Components.

**Architecture:** Four layers. A pure pacing core (no DOM, runs in Node, all timing tests live here) feeds a visible-prefix string. A wave timeline allocates stagger slots globally. An imperative DOM reveal renderer wraps only currently-animating words in spans and collapses them back into plain text when done. Framework wrappers are thin bindings over those two - including React, whose `Reveal` is a leaf over plain text, so an imperative renderer inside it never conflicts with React's tree.

**Tech Stack:** TypeScript strict, tsup (esbuild), vitest (node + jsdom), Vite playground, ESLint flat config, Prettier.

**Spec:** `docs/superpowers/specs/2026-08-01-smooth-stream-text-design.md`

## Global Constraints

- Zero runtime dependencies. `react` (`>=18`) and `vue` (`>=3`) are **optional** peer dependencies. Svelte support must import nothing from Svelte.
- Root entry `.` must run in Node: no DOM globals at module scope, no DOM types in its public signatures.
- Root entry ships ESM + CJS. Every other entry is ESM-only.
- `sideEffects: ["**/web-component/**"]` - only the custom-element entry may have import-time side effects.
- TypeScript `strict`, `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`, `isolatedModules`. No `any` in public signatures.
- Prettier: no semicolons, single quotes, width 120, trailing commas, 2-space tabs, `bracketSameLine: true`.
- All public identifiers, comments, docs and README in English.
- CSS class prefix `sst-`; CSS custom property prefix `--sst-`.
- Author `Maksim Zolotoi`, license MIT, repo `github.com/crmapache/smooth-stream-text`.
- Never claim an asset exists (GIF, screenshot, deployed URL) unless it was actually produced.

## Deviations from the spec (decided while planning, both simplifications)

1. **Grapheme safety is hand-rolled, not `Intl.Segmenter`.** Segmenting the
   whole string every tick is O(n) per frame; a bounded backward scan is O(1),
   deterministic across runtimes, and enough to guarantee "never cut a visible
   cluster".
2. **The React `Reveal` drops the `offset` prop.** Its purpose was surviving the
   markdown parser recreating nodes. The imperative renderer gets that for free:
   on mount it seeds whatever text it is given as *already settled*, so a
   remount never re-animates. Combined with the rule "if the new text is not an
   extension of the current text, silently reset", every remount and re-split
   case is covered with less API surface than the offset path would need.
   The user-visible guarantee they asked for is fully met.

---

## File Structure

```
src/
  index.ts                 root entry: pacing core public surface
  core/
    types.ts               Clock, PacingOptions, SmoothState, SmoothStream, BoundaryMode
    options.ts             defaults + resolvePacingOptions
    clock.ts               rafClock, timeoutClock, createManualClock
    grapheme.ts            clampToGraphemeBoundary
    boundary.ts            createBoundaryResolver ('char' | 'word' | 'markdown' | fn)
    markdown-scan.ts       incremental markdown cleanliness scanner
    pacer.ts               pure rate controller (stepPacer)
    stream.ts              createSmoothStream - buffer + pacer + boundary + clock
  reveal/
    types.ts               RevealOptions, ResolvedReveal, WaveTimeline, RevealHandle
    options.ts             defaults + resolveRevealOptions
    split.ts               splitPieces (word / char, whitespace kept unwrapped)
    timeline.ts            createWaveTimeline (stagger slots, compression, reduced motion)
    styles.ts              one-time stylesheet injection, CSS var application
  dom/
    index.ts               entry: createSmoothText, createReveal, createWaveTimeline, re-exports
    reveal.ts              imperative renderer
    smooth-text.ts         pacing + reveal wired together
  react/
    index.ts               entry
    use-smooth-stream.ts   useSmoothStream, useSmoothStreamController
    reveal.tsx             RevealProvider, Reveal, useReveal
    smooth-text.tsx        SmoothText
  vue/
    index.ts               useSmoothStream composable, SmoothText, Reveal
  svelte/
    index.ts               smoothText action, reveal action, smoothStream store
  web-component/
    index.ts               <smooth-stream-text> + defineSmoothStreamTextElement
tests/
  grapheme.test.ts         node
  boundary.test.ts         node
  pacer.test.ts            node
  stream.test.ts           node
  split.test.ts            node
  timeline.test.ts         node
  dom-reveal.test.ts       jsdom
  react.test.tsx           jsdom
  vue.test.ts              jsdom
  svelte.test.ts           jsdom
  web-component.test.ts    jsdom
playground/
  index.html  main.ts  simulator.ts  controls.ts  chart.ts  sample.ts  style.css
```

---

### Task 1: Project scaffolding

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsup.config.ts`, `vitest.config.ts`, `vite.config.ts`, `vercel.json`, `eslint.config.mjs`, `.prettierrc`, `.prettierignore`, `.gitignore`, `LICENSE`
- Create placeholder: `src/index.ts` exporting nothing yet

**Interfaces:**
- Produces: the `npm run` scripts every later task uses - `test`, `typecheck`, `lint`, `format`, `build`, `dev`, `build:playground`.

- [ ] **Step 1: Write `package.json`**

Fields per Global Constraints. `"type": "module"`, `version` `0.1.0`. Export map:
`.` (types/import/require), `./dom`, `./react`, `./vue`, `./svelte`,
`./web-component` (types/import only), `./package.json`. `typesVersions` mirroring
the map. `files: ["dist", "README.md", "LICENSE"]`.
`prepublishOnly: "npm run build"`. `homepage` omitted for now - it is only added
once a deployment actually exists.

Keywords, verbatim:
`streaming-text`, `smooth-streaming`, `stream-text`, `llm`, `llm-ui`,
`ai-chat-ui`, `ai-ui`, `typewriter`, `text-reveal`, `streaming-markdown`,
`token-streaming`, `headless`, `react`, `vue`, `svelte`, `web-component`,
`animation`.

devDependencies: `@eslint/js`, `@types/node`, `@types/react`, `@types/react-dom`,
`@testing-library/react`, `eslint`, `eslint-config-prettier`, `jsdom`,
`prettier`, `react`, `react-dom`, `tsup`, `typescript`, `typescript-eslint`,
`vite`, `vitest`, `vue`.

- [ ] **Step 2: Copy the tooling configs from the prosody-mask conventions**

`tsconfig.json`, `.prettierrc`, `eslint.config.mjs`, `.gitignore` follow
`/Users/max/Documents/Projects/prosody-mask` exactly, with the path alias
renamed to `smooth-stream-text` and `include` set to `["src", "playground", "tests"]`.

`vitest.config.ts`: `environment: 'node'`, `include: ['tests/**/*.test.{ts,tsx}']`.
DOM tests opt in per-file with `// @vitest-environment jsdom`.

`vite.config.ts`: `root: 'playground'`, alias `smooth-stream-text/dom` ->
`src/dom/index.ts` and `smooth-stream-text` -> `src/index.ts`, `build.outDir: 'dist'`.

`tsup.config.ts`: two groups - group A `src/index.ts` as esm+cjs with dts; group B
the five wrapper entries as esm only, `external: ['react', 'react/jsx-runtime', 'vue']`,
`esbuildOptions` setting `jsx: 'automatic'`.

- [ ] **Step 3: Write `LICENSE`** - MIT, `Copyright (c) 2026 Maksim Zolotoi`.

- [ ] **Step 4: Install and verify**

Run: `npm install && npm run typecheck && npm run lint && npm test`
Expected: install succeeds, typecheck clean, lint clean, vitest reports "no test files" (exit 0 with `--passWithNoTests`).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "chore: scaffold package, build and test tooling"
```

---

### Task 2: Grapheme boundary safety

**Files:**
- Create: `src/core/grapheme.ts`
- Test: `tests/grapheme.test.ts`

**Interfaces:**
- Produces: `clampToGraphemeBoundary(text: string, index: number): number` - the
  largest index `<= index` that does not split a visible cluster.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest'
import { clampToGraphemeBoundary as clamp } from '../src/core/grapheme'

describe('clampToGraphemeBoundary', () => {
  it('leaves plain ascii positions alone', () => {
    expect(clamp('hello', 3)).toBe(3)
  })

  it('clamps the ends', () => {
    expect(clamp('hello', 0)).toBe(0)
    expect(clamp('hello', 99)).toBe(5)
    expect(clamp('hello', -1)).toBe(0)
  })

  it('never splits a surrogate pair', () => {
    const text = 'a\u{1F600}b' // a + emoji (2 units) + b
    expect(clamp(text, 2)).toBe(1)
    expect(clamp(text, 3)).toBe(3)
  })

  it('never splits a combining mark from its base', () => {
    const text = 'éx' // e + combining acute
    expect(clamp(text, 1)).toBe(0)
    expect(clamp(text, 2)).toBe(2)
  })

  it('never splits a ZWJ sequence', () => {
    const text = '\u{1F468}‍\u{1F4BB}' // man technologist
    expect(clamp(text, 2)).toBe(0)
    expect(clamp(text, 3)).toBe(0)
    expect(clamp(text, 5)).toBe(5)
  })

  it('never splits a skin tone modifier or variation selector', () => {
    expect(clamp('\u{1F44B}\u{1F3FB}', 2)).toBe(0)
    expect(clamp('❤️', 1)).toBe(0)
  })

  it('never splits a keycap sequence', () => {
    expect(clamp('1️⃣', 1)).toBe(0)
    expect(clamp('1️⃣', 2)).toBe(0)
  })

  it('never splits a flag (regional indicator pair)', () => {
    const flag = '\u{1F1FA}\u{1F1F8}' // US
    expect(clamp(flag, 2)).toBe(0)
    expect(clamp(flag, 4)).toBe(4)
  })

  it('terminates on pathological input', () => {
    const nasty = 'a' + '́'.repeat(200)
    expect(clamp(nasty, 100)).toBeGreaterThanOrEqual(0)
  })
})
```

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run tests/grapheme.test.ts`
Expected: FAIL - module not found.

- [ ] **Step 3: Implement**

Backward scan, bounded to 32 steps (then give up and return the candidate, so
pathological input can never hang). Back up one code unit while the character
**at** the index is any of: a low surrogate, `\p{M}`, ZWJ, a variation selector
(`FE00-FE0F`, `E0100-E01EF`), a skin-tone modifier (`1F3FB-1F3FF`), or the keycap
`20E3`; or while the character **before** the index is a ZWJ; or while the
character before the index is a regional indicator and the run of regional
indicators ending there has odd length.

- [ ] **Step 4: Run tests** - Expected: PASS.

- [ ] **Step 5: Commit** - `feat(core): never cut text inside a grapheme cluster`

---

### Task 3: Markdown cleanliness scanner

**Files:**
- Create: `src/core/markdown-scan.ts`
- Test: covered by `tests/boundary.test.ts` in Task 4 (this module has no public surface of its own)

**Interfaces:**
- Produces:
  ```ts
  interface MarkdownScanner {
    /** Largest index <= desired at which the prefix contains no unclosed inline construct. */
    cleanUpTo(source: string, desired: number): number
    reset(): void
  }
  function createMarkdownScanner(): MarkdownScanner
  ```

- [ ] **Step 1: Implement the incremental scanner**

The scanner walks the source forward once and never rescans, so total cost is
O(length) across the whole stream, not O(length) per frame. It keeps:

- `pos` - how far it has scanned
- `lastClean` - the greatest scanned index at which the prefix was clean
- `atLineStart`, `inFence`, `fenceChar`, `fenceLen`
- `pendingLineMarker` - a line-leading `#`/`-`/`*`/`+`/`1.`/`>` that has not yet
  been followed by a content character
- `inTableRow` - the line began with `|` and has not ended
- `openBacktick` - length of the open inline-code run, or 0
- `emphasis` - stack of `{ char, len }`
- `bracket` - link state: `none` | `inText` (depth) | `inUrl`
- `escaped` - previous character was an unescaped backslash

Rules:

- Inside a fence, every position is clean **except** inside the fence marker run
  itself. The fence body must never be held - holding it would stall for
  thousands of characters.
- A position is clean when: not inside a delimiter run, `pendingLineMarker` is
  null, `inTableRow` is false, `openBacktick` is 0, `emphasis` is empty, and
  `bracket` is `none`.
- A run of identical `*`, `_`, `~` or `` ` `` characters is atomic: positions
  inside the run are never clean.
- Emphasis pairing is deliberately naive (a matching char+length run closes the
  top of the stack). False positives only cause a brief hold, and the engine's
  caps release it.
- `\` escapes the next character.

`cleanUpTo(source, desired)` scans forward to `min(desired, source.length)` and
returns `min(desired, lastClean)`. Scanning never goes past `desired`, because
cleanliness is a property of the *visible prefix* - a closer that exists later in
the source but is not yet visible does not help.

- [ ] **Step 2: Commit** (tests land with Task 4)

`feat(core): incremental markdown cleanliness scanner`

---

### Task 4: Boundary resolver

**Files:**
- Create: `src/core/boundary.ts`
- Test: `tests/boundary.test.ts`

**Interfaces:**
- Consumes: `clampToGraphemeBoundary`, `createMarkdownScanner`
- Produces:
  ```ts
  type BoundaryFn = (source: string, desired: number, closed: boolean) => number
  type BoundaryMode = 'char' | 'word' | 'markdown' | BoundaryFn
  interface BoundaryResolver {
    resolve(source: string, desired: number, closed: boolean): number
    reset(): void
  }
  function createBoundaryResolver(mode: BoundaryMode): BoundaryResolver
  ```

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest'
import { createBoundaryResolver } from '../src/core/boundary'

const at = (mode: any, source: string, desired: number, closed = false) =>
  createBoundaryResolver(mode).resolve(source, desired, closed)

describe("boundary 'char'", () => {
  it('allows any grapheme-safe position', () => {
    expect(at('char', 'hello world', 7)).toBe(7)
  })
  it('still refuses to split a cluster', () => {
    expect(at('char', 'a\u{1F600}b', 2)).toBe(1)
  })
})

describe("boundary 'word'", () => {
  it('backs up to the last completed word', () => {
    expect(at('word', 'hello world', 8)).toBe(6)
  })
  it('allows a position right after whitespace', () => {
    expect(at('word', 'hello world', 6)).toBe(6)
  })
  it('releases the final partial word once the stream is closed', () => {
    expect(at('word', 'hello wor', 9, true)).toBe(9)
  })
})

describe("boundary 'markdown' - atomic delimiters", () => {
  it('never stops between the two stars of an opener', () => {
    expect(at('markdown', '**bold** tail', 1)).toBe(0)
  })
  it('never stops inside a fence marker', () => {
    expect(at('markdown', 'x\n```js\ncode', 4)).toBe(2)
  })
})

describe("boundary 'markdown' - hold until closed", () => {
  it('holds unclosed emphasis', () => {
    expect(at('markdown', '**bold** ok', 4)).toBe(0)
  })
  it('releases emphasis once the closer is visible', () => {
    expect(at('markdown', '**bold** ok', 8)).toBe(8)
  })
  it('holds unclosed inline code', () => {
    expect(at('markdown', 'run `npm i` now', 7)).toBe(4)
    expect(at('markdown', 'run `npm i` now', 11)).toBe(11)
  })
  it('holds an unclosed link', () => {
    expect(at('markdown', 'see [docs](https://x.dev) now', 12)).toBe(4)
    expect(at('markdown', 'see [docs](https://x.dev) now', 25)).toBe(25)
  })
  it('holds a line-leading marker until its first content character', () => {
    expect(at('markdown', 'a\n## Title', 4)).toBe(2)
    expect(at('markdown', 'a\n## Title', 6)).toBe(6)
  })
  it('holds a table row until its newline', () => {
    expect(at('markdown', 'a\n| x | y |\nb', 6)).toBe(2)
    expect(at('markdown', 'a\n| x | y |\nb', 12)).toBe(12)
  })
  it('never holds inside a fenced code body', () => {
    const src = 'a\n```\nlet x = **not emphasis\n'
    expect(at('markdown', src, 20)).toBe(20)
  })
  it('releases everything when the stream is closed and we are at the end', () => {
    expect(at('markdown', 'tail **unclosed', 15, true)).toBe(15)
  })
})

describe('custom boundary function', () => {
  it('is used verbatim, after grapheme clamping', () => {
    const fn = (_s: string, d: number) => Math.min(d, 3)
    expect(at(fn, 'hello world', 9)).toBe(3)
  })
})

describe('resolver is monotonic and resettable', () => {
  it('never moves backwards across calls on a growing source', () => {
    const r = createBoundaryResolver('markdown')
    let prev = 0
    for (let i = 1; i <= 40; i++) {
      const got = r.resolve('the **quick** brown `fox` jumps [over](x) it', i, false)
      expect(got).toBeGreaterThanOrEqual(prev)
      prev = got
    }
  })
})
```

- [ ] **Step 2: Run and verify failure** - Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`resolve` order: grapheme clamp first, then the mode rule, then grapheme clamp
again (the mode rule can only move the index down, but a `word`/`markdown` result
must still be cluster-safe). When `closed` is true and `desired >= source.length`,
return `source.length` immediately - nothing more is coming, so no hold can ever
be satisfied.

`word` mode: back up while the position is neither the end of the source nor
preceded by whitespace.

- [ ] **Step 4: Run tests** - Expected: PASS.

- [ ] **Step 5: Commit** - `feat(core): cut boundaries with markdown-safe mode`

---

### Task 5: Clocks

**Files:**
- Create: `src/core/clock.ts`, `src/core/types.ts`
- Test: `tests/pacer.test.ts` and `tests/stream.test.ts` use `createManualClock`

**Interfaces:**
- Produces:
  ```ts
  interface Clock { now(): number; schedule(cb: (now: number) => void): () => void }
  interface ManualClock extends Clock { advance(ms: number): void; setNow(ms: number): void }
  const defaultClock: Clock          // rAF where available, setTimeout(16) otherwise
  function createManualClock(startMs?: number): ManualClock
  ```
  `types.ts` also declares `PacingOptions`, `ResolvedPacing`, `StreamPhase`,
  `SmoothState`, `SmoothStream`, re-exporting `BoundaryMode`.

- [ ] **Step 1: Implement `types.ts`** exactly as specified in spec sections 3.1 and 3.3.

- [ ] **Step 2: Implement `clock.ts`**

`defaultClock` resolves rAF lazily inside `schedule`, never at module scope, so
importing the root entry in Node is safe. `createManualClock` keeps a queue of
pending callbacks; `advance(ms)` moves `now` and drains callbacks scheduled at or
before the new time, re-entrantly (a callback that schedules another callback in
the same tick must not spin forever - drain in waves, cap at 10000 waves).

- [ ] **Step 3: Implement `src/core/options.ts`**

`defaultPacing` with the exact values from spec section 3.3 and
`resolvePacingOptions(partial?): ResolvedPacing`.

- [ ] **Step 4: Typecheck** - Run: `npm run typecheck`. Expected: clean.

- [ ] **Step 5: Commit** - `feat(core): injectable clock and pacing option defaults`

---

### Task 6: The pacing controller

**Files:**
- Create: `src/core/pacer.ts`
- Test: `tests/pacer.test.ts`

**Interfaces:**
- Produces:
  ```ts
  interface PacerState { rate: number; exact: number }   // rate in chars per ms
  interface PacerInput {
    pending: number
    dtMs: number
    closed: boolean
    msSinceLastInput: number
    msSinceClose: number      // Infinity when the stream is open
  }
  function createPacerState(opts: ResolvedPacing, cursor?: number): PacerState
  function effectiveTargetLatency(input: PacerInput, opts: ResolvedPacing): number
  function stepPacer(state: PacerState, input: PacerInput, opts: ResolvedPacing): PacerState
  ```

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest'
import { createPacerState, effectiveTargetLatency, stepPacer } from '../src/core/pacer'
import { resolvePacingOptions } from '../src/core/options'

const opts = resolvePacingOptions()
const open = { closed: false, msSinceLastInput: 0, msSinceClose: Infinity }

describe('effectiveTargetLatency', () => {
  it('is the configured target while the stream is live', () => {
    expect(effectiveTargetLatency({ ...open, pending: 100, dtMs: 16 }, opts)).toBe(opts.targetLatencyMs)
  })
  it('decays to zero across the settle window after close', () => {
    const half = effectiveTargetLatency(
      { pending: 100, dtMs: 16, closed: true, msSinceLastInput: 0, msSinceClose: opts.settleMs / 2 },
      opts,
    )
    expect(half).toBeCloseTo(opts.targetLatencyMs / 2, 5)
    const done = effectiveTargetLatency(
      { pending: 100, dtMs: 16, closed: true, msSinceLastInput: 0, msSinceClose: opts.settleMs },
      opts,
    )
    expect(done).toBe(0)
  })
  it('decays the same way after idle silence on an open stream', () => {
    const t = effectiveTargetLatency(
      { pending: 100, dtMs: 16, closed: false, msSinceLastInput: opts.idleGraceMs + opts.settleMs, msSinceClose: Infinity },
      opts,
    )
    expect(t).toBe(0)
  })
})

describe('stepPacer', () => {
  it('starts at the minimum rate so the first characters are not delayed', () => {
    expect(createPacerState(opts).rate).toBeCloseTo(opts.minCharsPerSecond / 1000, 8)
  })

  it('never exceeds the configured ceiling', () => {
    let s = createPacerState(opts)
    for (let i = 0; i < 500; i++) s = stepPacer(s, { ...open, pending: 1e6, dtMs: 16 }, opts)
    expect(s.rate).toBeLessThanOrEqual(opts.maxCharsPerSecond / 1000 + 1e-9)
  })

  it('never drops below the configured floor while work remains', () => {
    let s = createPacerState(opts)
    for (let i = 0; i < 500; i++) s = stepPacer(s, { ...open, pending: 1, dtMs: 16 }, opts)
    expect(s.rate).toBeGreaterThanOrEqual(opts.minCharsPerSecond / 1000 - 1e-9)
  })

  it('accelerates gradually rather than jumping when a burst lands', () => {
    let s = createPacerState(opts)
    const first = stepPacer(s, { ...open, pending: 2000, dtMs: 16 }, opts)
    // one frame after a 2000 char burst must not already be at full speed
    expect(first.rate).toBeLessThan((opts.maxCharsPerSecond / 1000) * 0.5)
  })

  it('converges towards the rate that drains the backlog over the target latency', () => {
    let s = createPacerState(opts)
    for (let i = 0; i < 300; i++) s = stepPacer(s, { ...open, pending: 90, dtMs: 16 }, opts)
    expect(s.rate).toBeCloseTo(90 / opts.targetLatencyMs, 3)
  })

  it('carries the fractional cursor so slow rates do not lose characters', () => {
    const slow = { ...opts, minCharsPerSecond: 10, maxCharsPerSecond: 10 }
    let s = createPacerState(slow)
    for (let i = 0; i < 100; i++) s = stepPacer(s, { ...open, pending: 100, dtMs: 10 }, slow)
    expect(s.exact).toBeCloseTo(10, 5) // 10 cps for 1000 ms
  })
})
```

- [ ] **Step 2: Run and verify failure** - Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```ts
export function stepPacer(state: PacerState, input: PacerInput, opts: ResolvedPacing): PacerState {
  const target = effectiveTargetLatency(input, opts)
  const min = opts.minCharsPerSecond / 1000
  const max = opts.maxCharsPerSecond / 1000
  const desired = target > 0 ? input.pending / target : Number.POSITIVE_INFINITY
  const alpha = 1 - Math.exp(-input.dtMs / opts.adaptMs)
  let rate = Number.isFinite(desired) ? state.rate + (desired - state.rate) * alpha : max
  rate = Math.min(max, Math.max(min, rate))
  return { rate, exact: state.exact + rate * input.dtMs }
}
```

`effectiveTargetLatency` returns `targetLatencyMs` while live, and
`targetLatencyMs * max(0, 1 - elapsed / settleMs)` while draining, where `elapsed`
is `msSinceClose` when closed and `msSinceLastInput - idleGraceMs` otherwise.

- [ ] **Step 4: Run tests** - Expected: PASS.

- [ ] **Step 5: Commit** - `feat(core): adaptive pacing controller`

---

### Task 7: The stream engine

**Files:**
- Create: `src/core/stream.ts`, `src/index.ts`
- Test: `tests/stream.test.ts`

**Interfaces:**
- Consumes: `stepPacer`, `createBoundaryResolver`, `resolvePacingOptions`, `Clock`
- Produces: `createSmoothStream(options?: PacingOptions): SmoothStream` plus the
  root entry re-exporting `createSmoothStream`, `defaultPacing`,
  `resolvePacingOptions`, `createManualClock`, `defaultClock`,
  `clampToGraphemeBoundary`, `createBoundaryResolver` and all public types.

- [ ] **Step 1: Write the failing tests**

The thirteen cases from spec section 9. Every test uses `createManualClock`, so
the suite never waits on real time.

```ts
import { describe, expect, it } from 'vitest'
import { createManualClock, createSmoothStream } from '../src/index'

const run = (opts = {}) => {
  const clock = createManualClock(0)
  const s = createSmoothStream({ clock, boundary: 'char', ...opts })
  return { clock, s, frames: (n: number, ms = 16) => { for (let i = 0; i < n; i++) clock.advance(ms) } }
}

describe('createSmoothStream', () => {
  it('starts idle and empty', () => {
    const { s } = run()
    expect(s.getState()).toMatchObject({ text: '', cursor: 0, pending: 0, phase: 'idle' })
  })

  it('holds the display behind live text by roughly the target latency', () => {
    const { s, clock, frames } = run({ targetLatencyMs: 200 })
    // feed 100 chars per 100 ms for 2 s, then check the lag
    for (let i = 0; i < 20; i++) { s.push('x'.repeat(100)); clock.advance(100) }
    const { pending } = s.getState()
    expect(pending).toBeGreaterThan(20)
    expect(pending).toBeLessThan(400)
  })

  it('turns a burst into an acceleration, not a dump', () => {
    const { s, clock } = run()
    s.push('y'.repeat(2000))
    clock.advance(16)
    expect(s.getState().cursor).toBeLessThan(100)
  })

  it('drains and stops after a long mid-stream pause', () => {
    const { s, frames } = run()
    s.push('hello world')
    frames(200)
    expect(s.getState()).toMatchObject({ text: 'hello world', pending: 0, phase: 'streaming' })
  })

  it('finishes within the settle window once the producer closes', () => {
    const { s, clock, frames } = run({ settleMs: 400 })
    s.push('a'.repeat(300))
    frames(3)
    s.end()
    frames(60) // ~960 ms, comfortably past settleMs * 2
    expect(s.getState()).toMatchObject({ pending: 0, phase: 'done' })
  })

  it('stays streaming when the producer is abandoned without end()', () => {
    const { s, frames } = run()
    s.push('abc')
    frames(200)
    expect(s.getState().phase).toBe('streaming')
    expect(s.getState().text).toBe('abc')
  })

  it('flush() reveals everything immediately', () => {
    const { s } = run()
    s.push('a'.repeat(5000))
    s.flush()
    expect(s.getState().cursor).toBe(5000)
  })

  it('reset() clears everything without animating', () => {
    const { s, frames } = run()
    s.push('old text')
    frames(50)
    s.reset()
    expect(s.getState()).toMatchObject({ text: '', source: '', cursor: 0, phase: 'idle' })
  })

  it('reset(text) starts fully revealed', () => {
    const { s } = run()
    s.reset('already here')
    expect(s.getState().text).toBe('already here')
  })

  it('snaps instead of crawling when the backlog cannot drain sanely', () => {
    const { s, clock } = run({ maxCharsPerSecond: 900, maxLatencyMs: 2000 })
    s.push('z'.repeat(100000))
    clock.advance(16)
    expect(s.getState().cursor).toBe(100000)
  })

  it('produces identical output whether fed deltas or a growing string', () => {
    const chunks = ['The ', 'quick brown ', 'fox jumps over ', 'the lazy dog.']
    const a = run(), b = run()
    let full = ''
    for (const c of chunks) {
      a.s.push(c)
      full += c
      b.s.setSource(full)
      a.clock.advance(50)
      b.clock.advance(50)
      expect(a.s.getState().text).toBe(b.s.getState().text)
    }
  })

  it('ignores setSource with an unchanged string', () => {
    const { s, clock } = run()
    s.setSource('same')
    clock.advance(50)
    const before = s.getState().text
    s.setSource('same')
    expect(s.getState().text).toBe(before)
  })

  it('treats a shrinking source as a reset', () => {
    const { s, frames } = run()
    s.setSource('a long first answer')
    frames(100)
    s.setSource('short')
    expect(s.getState()).toMatchObject({ source: 'short', cursor: 0 })
  })

  it('notifies subscribers and stops after unsubscribe', () => {
    const { s, clock } = run()
    let calls = 0
    const off = s.subscribe(() => { calls++ })
    s.push('hello')
    clock.advance(100)
    expect(calls).toBeGreaterThan(0)
    const seen = calls
    off()
    clock.advance(100)
    expect(calls).toBe(seen)
  })

  it('releases a markdown hold once the cap is reached', () => {
    const clock = createManualClock(0)
    const s = createSmoothStream({ clock, boundary: 'markdown', holdMs: 100 })
    s.push('**this emphasis is never closed and keeps going and going')
    for (let i = 0; i < 40; i++) clock.advance(16)
    expect(s.getState().cursor).toBeGreaterThan(2)
  })
})
```

- [ ] **Step 2: Run and verify failure** - Expected: FAIL.

- [ ] **Step 3: Implement `stream.ts`**

Internal state: `source`, `cursor`, `pacer`, `closed`, `closedAt`, `lastInputAt`,
`lastTickAt`, `phase`, `holdStartedAt`, `resolver`, `listeners`, `cancelTick`.

Tick, given `now`:
1. `dt = clamp(now - lastTickAt, 0, maxFrameMs)`; update `lastTickAt`.
2. If `pending / (maxCharsPerSecond / 1000) > maxLatencyMs`, or the hard deadline
   `closed && now - closedAt > settleMs * 2` has passed, jump the cursor to the
   end (still grapheme-clamped) and finish.
3. Otherwise `stepPacer`, then `desired = min(floor(pacer.exact), source.length)`.
4. `allowed = resolver.resolve(source, desired, closed)`.
5. Hold caps: when `allowed < desired`, start (or continue) a hold. Release -
   use `desired` - when `now - holdStartedAt > holdMs` **or**
   `desired - allowed > holdChars`. Clear the hold when `allowed >= desired`.
6. Never let the cursor move backwards. Pin `pacer.exact` to the final cursor
   while a hold is active, so releasing does not dump a backlog that accumulated
   invisibly.
7. Recompute `phase`, emit if anything changed.
8. Keep ticking while `pending > 0` or the stream is settling; stop scheduling
   when `pending === 0` and the stream is either `done` or `streaming` with no
   backlog. `push`/`setSource` restart the loop.

Hidden-tab behaviour needs no visibility listener: rAF stops while hidden, and on
return the backlog trips the `maxLatencyMs` snap (or catches up within a fraction
of a second when small). The wave compression in Task 9 keeps the visual sane.

`flush()` sets the cursor to `source.length` and emits. `reset(text)` clears
everything, resets the resolver and pacer, and reveals `text` fully if given.

- [ ] **Step 4: Run tests** - Expected: PASS.

- [ ] **Step 5: Run the whole suite and typecheck**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all green.

- [ ] **Step 6: Commit** - `feat(core): smooth stream engine with public root entry`

---

### Task 8: Text splitting into reveal pieces

**Files:**
- Create: `src/reveal/types.ts`, `src/reveal/options.ts`, `src/reveal/split.ts`
- Test: `tests/split.test.ts`

**Interfaces:**
- Produces:
  ```ts
  interface Piece { text: string; animatable: boolean }
  function splitPieces(text: string, unit: 'word' | 'char'): Piece[]
  ```
  `types.ts` declares `RevealOptions`, `ResolvedReveal`, `WaveTimeline`,
  `RevealHandle`; `options.ts` gives `defaultReveal` (spec section 6.3) and
  `resolveRevealOptions`.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest'
import { splitPieces } from '../src/reveal/split'

describe('splitPieces', () => {
  it('keeps whitespace as separate, non-animatable pieces', () => {
    expect(splitPieces('a b', 'word')).toEqual([
      { text: 'a', animatable: true },
      { text: ' ', animatable: false },
      { text: 'b', animatable: true },
    ])
  })

  it('treats newlines as whitespace so line structure survives', () => {
    expect(splitPieces('a\n\nb', 'word').map((p) => p.text)).toEqual(['a', '\n\n', 'b'])
  })

  it('splits into grapheme clusters in char mode', () => {
    expect(splitPieces('a\u{1F600}', 'char').map((p) => p.text)).toEqual(['a', '\u{1F600}'])
  })

  it('round-trips exactly', () => {
    const src = '  hello   world\n\ttab '
    expect(splitPieces(src, 'word').map((p) => p.text).join('')).toBe(src)
    expect(splitPieces(src, 'char').map((p) => p.text).join('')).toBe(src)
  })

  it('returns nothing for empty input', () => {
    expect(splitPieces('', 'word')).toEqual([])
  })
})
```

- [ ] **Step 2: Run and verify failure** - Expected: FAIL.

- [ ] **Step 3: Implement** - alternate runs of `\s` and non-`\s`; in `char` mode
  further split non-whitespace runs into grapheme clusters using
  `clampToGraphemeBoundary` to find each cluster end.

- [ ] **Step 4: Run tests** - Expected: PASS.

- [ ] **Step 5: Commit** - `feat(reveal): split text into animatable pieces`

---

### Task 9: Wave timeline

**Files:**
- Create: `src/reveal/timeline.ts`
- Test: `tests/timeline.test.ts`

**Interfaces:**
- Produces:
  ```ts
  interface WaveTimeline {
    claim(count: number, now: number): number[]   // absolute start timestamps
    reset(): void
  }
  function createWaveTimeline(opts: Pick<ResolvedReveal, 'staggerMs' | 'maxWaveLagMs'>): WaveTimeline
  ```

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest'
import { createWaveTimeline } from '../src/reveal/timeline'

const opts = { staggerMs: 40, maxWaveLagMs: 240 }

describe('createWaveTimeline', () => {
  it('staggers words within one claim', () => {
    expect(createWaveTimeline(opts).claim(3, 1000)).toEqual([1000, 1040, 1080])
  })

  it('keeps the wave continuous across separate claims', () => {
    const t = createWaveTimeline(opts)
    t.claim(2, 1000)          // occupies 1000, 1040; next slot 1080
    expect(t.claim(1, 1010)).toEqual([1080])
  })

  it('lets the queue heal after a silence', () => {
    const t = createWaveTimeline(opts)
    t.claim(2, 1000)
    expect(t.claim(1, 5000)).toEqual([5000])
  })

  it('compresses the stagger so a large batch cannot queue a long wave', () => {
    const starts = createWaveTimeline(opts).claim(100, 0)
    expect(starts[0]).toBe(0)
    expect(starts[99]).toBeLessThanOrEqual(opts.maxWaveLagMs)
  })

  it('reset() clears the queue', () => {
    const t = createWaveTimeline(opts)
    t.claim(5, 1000)
    t.reset()
    expect(t.claim(1, 1010)).toEqual([1010])
  })
})
```

- [ ] **Step 2: Run and verify failure** - Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
export function createWaveTimeline(opts) {
  let next = -Infinity
  return {
    claim(count, now) {
      const start = Math.max(now, Math.min(next, now + opts.maxWaveLagMs))
      const budget = opts.maxWaveLagMs - (start - now)
      const stagger = count > 1 ? Math.min(opts.staggerMs, Math.max(0, budget / (count - 1))) : opts.staggerMs
      const starts = Array.from({ length: count }, (_, i) => start + i * stagger)
      next = start + count * stagger
      return starts
    },
    reset() { next = -Infinity },
  }
}
```

- [ ] **Step 4: Run tests** - Expected: PASS.

- [ ] **Step 5: Commit** - `feat(reveal): global stagger timeline with lag compression`

---

### Task 10: Styles

**Files:**
- Create: `src/reveal/styles.ts`
- Test: covered by `tests/dom-reveal.test.ts` in Task 11

**Interfaces:**
- Produces:
  ```ts
  function ensureStyles(doc: Document): void          // idempotent
  function applyRevealVars(el: HTMLElement, opts: ResolvedReveal): void
  function prefersReducedMotion(): boolean
  const WORD_CLASS = 'sst-word'
  const FLAT_CLASS = 'sst-flat'
  ```

- [ ] **Step 1: Implement**

`ensureStyles` inserts one `<style data-smooth-stream-text>` element, guarded by a
lookup so repeat calls are free. Contents:

```css
@keyframes sst-in {
  from { opacity: 0; filter: blur(var(--sst-blur)); transform: translateY(var(--sst-translate)); }
  to   { opacity: 1; filter: blur(0px); transform: none; }
}
@keyframes sst-in-flat {
  from { opacity: 0; filter: blur(var(--sst-blur)); }
  to   { opacity: 1; filter: blur(0px); }
}
.sst-word {
  display: inline-block;
  white-space: pre-wrap;
  animation-name: sst-in;
  animation-duration: var(--sst-duration);
  animation-timing-function: var(--sst-easing);
  animation-fill-mode: both;
}
.sst-word.sst-flat { display: inline; animation-name: sst-in-flat; }
```

`sst-flat` is used when `translatePx` is 0: `transform` needs a block box, but
`opacity` and `filter` work on inline boxes, so the zero-shift configuration has
zero layout impact.

`applyRevealVars` sets `--sst-duration`, `--sst-easing`, `--sst-blur`,
`--sst-translate` on the host.

`prefersReducedMotion` guards for a missing `matchMedia`.

- [ ] **Step 2: Typecheck** - Run: `npm run typecheck`. Expected: clean.

- [ ] **Step 3: Commit** - `feat(reveal): self-injecting stylesheet driven by CSS variables`

---

### Task 11: DOM reveal renderer and `./dom` entry

**Files:**
- Create: `src/dom/reveal.ts`, `src/dom/smooth-text.ts`, `src/dom/index.ts`
- Test: `tests/dom-reveal.test.ts`

**Interfaces:**
- Consumes: `splitPieces`, `createWaveTimeline`, `ensureStyles`,
  `applyRevealVars`, `prefersReducedMotion`, `createSmoothStream`
- Produces:
  ```ts
  interface RevealHandle {
    update(fullVisibleText: string): void
    flush(): void
    reset(text?: string): void
    setOptions(next: Partial<RevealOptions>): void
    destroy(): void
  }
  function createReveal(el: HTMLElement, options?: RevealOptions & { timeline?: WaveTimeline; clock?: Clock }): RevealHandle

  interface SmoothTextHandle {
    push(delta: string): void
    setText(text: string): void
    end(): void
    reset(text?: string): void
    flush(): void
    setOptions(next: Partial<SmoothTextOptions>): void
    destroy(): void
    readonly state: SmoothState
  }
  function createSmoothText(el: HTMLElement, options?: SmoothTextOptions): SmoothTextHandle
  ```
  `./dom` also re-exports `createWaveTimeline`, `defaultReveal`, the core surface
  and all types.

- [ ] **Step 1: Write the failing tests**

```ts
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createReveal, createSmoothText } from '../src/dom/index'
import { createManualClock } from '../src/index'

let host: HTMLElement
beforeEach(() => {
  document.body.innerHTML = ''
  host = document.createElement('div')
  document.body.appendChild(host)
})

describe('createReveal', () => {
  it('seeds its first update as already settled, with no spans', () => {
    createReveal(host).update('already here')
    expect(host.textContent).toBe('already here')
    expect(host.querySelectorAll('.sst-word')).toHaveLength(0)
  })

  it('wraps only newly appended words', () => {
    const r = createReveal(host)
    r.update('one two')
    r.update('one two three four')
    expect(host.textContent).toBe('one two three four')
    expect([...host.querySelectorAll('.sst-word')].map((n) => n.textContent)).toEqual(['three', 'four'])
  })

  it('keeps textContent exactly equal to the visible text at all times', () => {
    const r = createReveal(host)
    for (const t of ['a', 'a b', 'a b c', 'a b c d']) {
      r.update(t)
      expect(host.textContent).toBe(t)
    }
  })

  it('collapses finished words back into plain text', () => {
    const clock = createManualClock(0)
    const r = createReveal(host, { clock, durationMs: 100, staggerMs: 0 })
    r.update('')
    r.update('hello world')
    expect(host.querySelectorAll('.sst-word').length).toBeGreaterThan(0)
    clock.advance(500)
    expect(host.querySelectorAll('.sst-word')).toHaveLength(0)
    expect(host.textContent).toBe('hello world')
    expect(host.childNodes).toHaveLength(1)
    expect(host.firstChild?.nodeType).toBe(Node.TEXT_NODE)
  })

  it('silently reseeds when the new text is not an extension of the old', () => {
    const r = createReveal(host)
    r.update('first answer')
    r.update('a completely different answer')
    expect(host.textContent).toBe('a completely different answer')
    expect(host.querySelectorAll('.sst-word')).toHaveLength(0)
  })

  it('creates no spans at all under reduced motion', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }))
    const r = createReveal(host)
    r.update('')
    r.update('hello world')
    expect(host.querySelectorAll('.sst-word')).toHaveLength(0)
    expect(host.textContent).toBe('hello world')
    vi.unstubAllGlobals()
  })

  it('flush() settles everything immediately', () => {
    const r = createReveal(host, { durationMs: 10000 })
    r.update('')
    r.update('hello world')
    r.flush()
    expect(host.querySelectorAll('.sst-word')).toHaveLength(0)
  })

  it('injects its stylesheet exactly once', () => {
    createReveal(document.createElement('div'))
    createReveal(document.createElement('div'))
    expect(document.querySelectorAll('style[data-smooth-stream-text]')).toHaveLength(1)
  })

  it('shares one wave across hosts when given a shared timeline', () => {
    const { createWaveTimeline } = require('../src/dom/index')
    const timeline = createWaveTimeline({ staggerMs: 40, maxWaveLagMs: 240 })
    const a = document.createElement('div'), b = document.createElement('div')
    document.body.append(a, b)
    const ra = createReveal(a, { timeline }), rb = createReveal(b, { timeline })
    ra.update(''); rb.update('')
    ra.update('one'); rb.update('two')
    const delayOf = (el: Element) => (el.querySelector('.sst-word') as HTMLElement).style.animationDelay
    expect(delayOf(a)).not.toBe(delayOf(b))
  })
})

describe('createSmoothText', () => {
  it('paces pushed deltas onto the element', () => {
    const clock = createManualClock(0)
    const h = createSmoothText(host, { clock, boundary: 'char' })
    h.push('hello world')
    expect(host.textContent!.length).toBeLessThan(11)
    for (let i = 0; i < 200; i++) clock.advance(16)
    expect(host.textContent).toBe('hello world')
    h.destroy()
  })

  it('destroy() stops all work and leaves the element alone', () => {
    const clock = createManualClock(0)
    const h = createSmoothText(host, { clock })
    h.push('abc')
    h.destroy()
    const before = host.textContent
    for (let i = 0; i < 50; i++) clock.advance(16)
    expect(host.textContent).toBe(before)
  })
})
```

- [ ] **Step 2: Run and verify failure** - Expected: FAIL.

- [ ] **Step 3: Implement `reveal.ts`**

DOM shape the renderer owns completely (it must be given an element with no other
children - document this):

```
<host>
  #text            <- everything already settled
  <span class="sst-word" style="animation-delay: …">word</span>
  #text " "        <- whitespace is never wrapped, so line breaking is untouched
  <span class="sst-word" …>word</span>
</host>
```

- `update(text)`: if `text` does not start with the current full text, reseed
  (drop everything, single settled text node, no animation). Otherwise split the
  delta, claim one slot per animatable piece, append spans with an inline
  `animation-delay` of `start - now` and whitespace as bare text nodes.
- A single timer, always set to the earliest outstanding settle deadline
  (`start + durationMs`), merges finished leading spans into the settled text
  node and removes them. Because spans finish in order, only a prefix ever
  merges.
- `reset(text)` empties the host and seeds `text`. `flush()` merges everything
  now. `destroy()` clears the timer; it deliberately leaves the DOM as-is.
- Under reduced motion no spans are created at all - the settled text node is
  simply extended.

- [ ] **Step 4: Implement `smooth-text.ts` and `index.ts`**

`createSmoothText` creates a stream and a reveal on the same options object,
subscribes the reveal to the stream's `text`, and forwards `push`/`setText`/`end`/
`reset`/`flush`/`destroy`. `state` is a getter onto the stream's state.

- [ ] **Step 5: Run tests** - Expected: PASS.

- [ ] **Step 6: Commit** - `feat(dom): imperative reveal renderer and smooth text handle`

---

### Task 12: React wrapper

**Files:**
- Create: `src/react/use-smooth-stream.ts`, `src/react/reveal.tsx`, `src/react/smooth-text.tsx`, `src/react/index.ts`
- Test: `tests/react.test.tsx`

**Interfaces:**
- Consumes: `createSmoothStream`, `createReveal`, `createWaveTimeline`
- Produces:
  ```ts
  function useSmoothStream(source: string, options?: PacingOptions & { done?: boolean }):
    SmoothState & { flush(): void; reset(text?: string): void }
  function useSmoothStreamController(options?: PacingOptions):
    SmoothState & { push(d: string): void; end(): void; flush(): void; reset(t?: string): void }
  function RevealProvider(props: RevealOptions & { resetKey?: string | number; children: ReactNode }): JSX.Element
  function Reveal(props: { children?: string; as?: ElementType; className?: string }): JSX.Element
  function useReveal(): ResolvedReveal & { timeline: WaveTimeline }
  function SmoothText(props: { text: string; done?: boolean; as?: ElementType; className?: string;
    onSettled?: () => void } & PacingOptions & RevealOptions): JSX.Element
  ```

- [ ] **Step 1: Write the failing tests**

```tsx
// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Reveal, RevealProvider, SmoothText, useSmoothStream } from '../src/react/index'
import { createManualClock } from '../src/index'

describe('useSmoothStream', () => {
  it('renders an already-done message instantly, with no animation', () => {
    const clock = createManualClock(0)
    function Probe() {
      const { text } = useSmoothStream('a full historical answer', { done: true, clock })
      return <p>{text}</p>
    }
    render(<Probe />)
    expect(screen.getByText('a full historical answer')).toBeTruthy()
  })

  it('paces a growing source and reports its phase', () => {
    const clock = createManualClock(0)
    let seen = ''
    function Probe({ src, done }: { src: string; done: boolean }) {
      const { text, phase } = useSmoothStream(src, { done, clock, boundary: 'char' })
      seen = `${phase}:${text}`
      return <p data-testid="out">{text}</p>
    }
    const { rerender } = render(<Probe src="" done={false} />)
    rerender(<Probe src="hello world" done={false} />)
    expect(screen.getByTestId('out').textContent!.length).toBeLessThan(11)
    act(() => { for (let i = 0; i < 200; i++) clock.advance(16) })
    expect(screen.getByTestId('out').textContent).toBe('hello world')
    rerender(<Probe src="hello world" done />)
    act(() => { for (let i = 0; i < 60; i++) clock.advance(16) })
    expect(seen.startsWith('done:')).toBe(true)
  })
})

describe('Reveal', () => {
  it('mounts its initial text as settled and animates only later additions', () => {
    function Chunk({ text }: { text: string }) {
      return <RevealProvider><Reveal>{text}</Reveal></RevealProvider>
    }
    const { container, rerender } = render(<Chunk text="one two" />)
    expect(container.querySelectorAll('.sst-word')).toHaveLength(0)
    rerender(<Chunk text="one two three" />)
    expect([...container.querySelectorAll('.sst-word')].map((n) => n.textContent)).toEqual(['three'])
    expect(container.textContent).toBe('one two three')
  })

  it('does not re-animate when the node is recreated with the same text', () => {
    function Chunk({ k, text }: { k: string; text: string }) {
      return <RevealProvider><Reveal key={k}>{text}</Reveal></RevealProvider>
    }
    const { container, rerender } = render(<Chunk k="a" text="one two" />)
    rerender(<Chunk k="b" text="one two" />)
    expect(container.querySelectorAll('.sst-word')).toHaveLength(0)
  })

  it('renders the text as plain React children on the server pass', () => {
    // renderToStaticMarkup must contain the text, since the imperative renderer
    // only engages after mount
    const { renderToStaticMarkup } = require('react-dom/server')
    expect(renderToStaticMarkup(<RevealProvider><Reveal>hello</Reveal></RevealProvider>)).toContain('hello')
  })
})

describe('SmoothText', () => {
  it('wires pacing and reveal together', () => {
    const clock = createManualClock(0)
    const { container, rerender } = render(<SmoothText text="" clock={clock} boundary="char" />)
    rerender(<SmoothText text="hello world" clock={clock} boundary="char" />)
    act(() => { for (let i = 0; i < 200; i++) clock.advance(16) })
    expect(container.textContent).toBe('hello world')
  })

  it('calls onSettled once the tail has finished', () => {
    const clock = createManualClock(0)
    let done = 0
    const props = { clock, boundary: 'char' as const, onSettled: () => { done++ } }
    const { rerender } = render(<SmoothText text="hi" {...props} />)
    rerender(<SmoothText text="hi there" done {...props} />)
    act(() => { for (let i = 0; i < 200; i++) clock.advance(16) })
    expect(done).toBe(1)
  })
})
```

- [ ] **Step 2: Run and verify failure** - Expected: FAIL.

- [ ] **Step 3: Implement `use-smooth-stream.ts`**

Create the stream lazily in a ref. Subscribe with `useSyncExternalStore`, whose
snapshot is the stream's state object (the engine must return a stable reference
when nothing changed - already true, since it only builds a new state object on
change). When `done` is `true` on the very first render, seed with
`reset(source)` so history renders instantly. Afterwards, an effect calls
`setSource` on change and `end()` when `done` flips true. `destroy()` on unmount.

- [ ] **Step 4: Implement `reveal.tsx`**

`RevealProvider` holds resolved options plus a `createWaveTimeline` in a ref, and
resets it when `resetKey` changes.

`Reveal` renders `<As className>{mounted ? null : children}</As>`. Before mount
(server render and first client pass) the text is plain React children, so SSR
output and hydration contain the real text. In a layout effect it creates a
`createReveal` handle on the host - the handle's first `update` seeds whatever is
there as settled, so mounting never animates - and every later change goes
through `handle.update(children)`. React never manages the host's children after
mount, so there is no conflict.

`useReveal` returns the context, throwing a clear error outside a provider.

- [ ] **Step 5: Implement `smooth-text.tsx`**

`useSmoothStream` + `RevealProvider` + `Reveal` in one element. `onSettled` fires
on the transition into phase `done`, exactly once per stream.

- [ ] **Step 6: Run tests** - Expected: PASS.

- [ ] **Step 7: Commit** - `feat(react): headless hooks, reveal provider and component`

---

### Task 13: Vue, Svelte and Web Component wrappers

**Files:**
- Create: `src/vue/index.ts`, `src/svelte/index.ts`, `src/web-component/index.ts`
- Test: `tests/vue.test.ts`, `tests/svelte.test.ts`, `tests/web-component.test.ts`

**Interfaces:**
- Consumes: `createSmoothText`, `createReveal`, `createSmoothStream`
- Produces:
  ```ts
  // vue
  function useSmoothStream(source: Ref<string> | (() => string), options?: PacingOptions & { done?: Ref<boolean> | boolean }):
    { text: Ref<string>; phase: Ref<StreamPhase>; flush(): void; reset(t?: string): void }
  const SmoothText: DefineComponent   // props: text, done, as, className + options
  const Reveal: DefineComponent       // props: text, as, className

  // svelte
  function smoothText(node: HTMLElement, options?: SmoothTextOptions & { text?: string; done?: boolean }):
    { update(next): void; destroy(): void }
  function reveal(node: HTMLElement, options?: RevealOptions & { text?: string }):
    { update(next): void; destroy(): void }
  function smoothStream(options?: PacingOptions):
    { subscribe(run: (s: SmoothState) => void): () => void; push(d: string): void
      setSource(t: string): void; end(): void; flush(): void; reset(t?: string): void; destroy(): void }

  // web component
  class SmoothStreamTextElement extends HTMLElement
  function defineSmoothStreamTextElement(tag?: string): void
  ```

- [ ] **Step 1: Write the failing tests**

```ts
// @vitest-environment jsdom  -- tests/vue.test.ts
import { createApp, h, ref } from 'vue'
import { describe, expect, it } from 'vitest'
import { SmoothText } from '../src/vue/index'
import { createManualClock } from '../src/index'

it('renders paced text into the host element', () => {
  const clock = createManualClock(0)
  const text = ref('')
  const el = document.createElement('div')
  document.body.appendChild(el)
  createApp({ render: () => h(SmoothText, { text: text.value, clock, boundary: 'char' }) }).mount(el)
  text.value = 'hello world'
  return Promise.resolve().then(() => {
    for (let i = 0; i < 200; i++) clock.advance(16)
    expect(el.textContent).toBe('hello world')
  })
})
```

```ts
// @vitest-environment jsdom  -- tests/svelte.test.ts
import { describe, expect, it } from 'vitest'
import { smoothStream, smoothText } from '../src/svelte/index'
import { createManualClock } from '../src/index'

it('the action paces text onto the node', () => {
  const clock = createManualClock(0)
  const node = document.createElement('div')
  const a = smoothText(node, { clock, boundary: 'char', text: '' })
  a.update({ clock, boundary: 'char', text: 'hello world' })
  for (let i = 0; i < 200; i++) clock.advance(16)
  expect(node.textContent).toBe('hello world')
  a.destroy()
})

it('the store follows the svelte contract', () => {
  const clock = createManualClock(0)
  const s = smoothStream({ clock, boundary: 'char' })
  const seen: string[] = []
  const off = s.subscribe((state) => seen.push(state.text))
  expect(seen).toHaveLength(1) // svelte stores call the subscriber immediately
  s.push('hi')
  for (let i = 0; i < 100; i++) clock.advance(16)
  expect(seen.at(-1)).toBe('hi')
  off()
  s.destroy()
})
```

```ts
// @vitest-environment jsdom  -- tests/web-component.test.ts
import { describe, expect, it } from 'vitest'
import '../src/web-component/index'

it('registers itself and renders its text attribute', async () => {
  expect(customElements.get('smooth-stream-text')).toBeTruthy()
  const el = document.createElement('smooth-stream-text') as any
  el.setAttribute('boundary', 'char')
  document.body.appendChild(el)
  el.setAttribute('text', 'hello world')
  el.flush()
  expect(el.textContent).toBe('hello world')
})

it('emits sst:done when the tail finishes', async () => {
  const el = document.createElement('smooth-stream-text') as any
  document.body.appendChild(el)
  const fired = new Promise((r) => el.addEventListener('sst:done', r, { once: true }))
  el.setAttribute('text', 'hi')
  el.setAttribute('done', '')
  el.flush()
  await fired
})
```

- [ ] **Step 2: Run and verify failure** - Expected: FAIL.

- [ ] **Step 3: Implement the three wrappers**

Vue: `defineComponent` + `h()` only, no SFC. `SmoothText` owns a host `div`,
creates `createSmoothText` on mount, watches `text`/`done`, destroys on unmount.
The composable mirrors the React hook using `ref` + `watchEffect`.

Svelte: plain actions returning `{ update, destroy }` and a store that satisfies
Svelte's contract (calling the subscriber immediately with the current value and
returning an unsubscribe). Nothing is imported from `svelte`.

Web component: attributes `text`, `done`, `unit`, `duration`, `stagger`, `blur`,
`translate`, `target-latency`, `min-cps`, `max-cps`, `boundary`; an `options`
property for anything structured; `push`/`end`/`flush`/`reset` methods; a
`sst:done` event on the transition into phase `done`;
`defineSmoothStreamTextElement(tag = 'smooth-stream-text')` guarded against double
registration and auto-invoked on import. Set `display: block` when the host has
no inline display set.

- [ ] **Step 4: Run tests** - Expected: PASS.

- [ ] **Step 5: Build and verify every entry emits**

Run: `npm run build && ls dist`
Expected: `index.js`, `index.cjs`, `index.d.ts`, plus `dom/`, `react/`, `vue/`,
`svelte/`, `web-component/` each with `index.js` and `index.d.ts`.

- [ ] **Step 6: Commit** - `feat: vue, svelte and web component wrappers`

---

### Task 14: Playground

**Files:**
- Create: `playground/index.html`, `playground/main.ts`, `playground/simulator.ts`, `playground/controls.ts`, `playground/chart.ts`, `playground/sample.ts`, `playground/style.css`

**Interfaces:**
- Consumes: `smooth-stream-text/dom` (via the Vite alias to the working tree)
- Produces: the tuning instrument used by Task 15.

- [ ] **Step 1: Write `simulator.ts`**

```ts
export interface SimulatorOptions {
  charsPerSecond: number   // base production rate
  jitter: number           // 0..1, spread of chunk sizes
  pauseChance: number      // 0..1, probability of a pause between chunks
  pauseMs: number          // length of a pause
  chunkChars: number       // mean chunk size
}
export function createSimulator(text: string, opts: SimulatorOptions, onChunk: (delta: string) => void, onEnd: () => void):
  { start(): void; stop(): void; setOptions(next: Partial<SimulatorOptions>): void }
```

Deterministic pseudo-random (a seeded LCG) so two runs with the same settings are
comparable side by side.

- [ ] **Step 2: Write `sample.ts`**

A realistic markdown answer: a heading, a paragraph with bold, italics, inline
code and a link, a bullet list, a fenced code block, and a small table - so the
boundary rules are exercised on screen, not only in tests.

- [ ] **Step 3: Write `main.ts`, `controls.ts`, `chart.ts`, `index.html`, `style.css`**

Two columns fed by the **same** simulator instance: the left one appends deltas
straight to a node (raw), the right one goes through `createSmoothText`. Controls
for every simulator option and every package option, applied live via
`setOptions`. A small canvas chart plotting current lag (`pending`) and current
rate (`charsPerSecond`) over the last few seconds.

- [ ] **Step 4: Run it**

Run: `npm run dev`
Expected: the page loads, both columns stream, the right one is visibly smoother,
and every slider takes effect without a reload.

- [ ] **Step 5: Commit** - `feat(playground): stream simulator with raw vs smoothed comparison`

---

### Task 15: Tune the defaults

**Files:**
- Modify: `src/core/options.ts`, `src/reveal/options.ts`
- Modify: `docs/superpowers/specs/2026-08-01-smooth-stream-text-design.md` (option tables, if values move)

- [ ] **Step 1: Drive the playground across the realistic range**

Check at least: a slow producer (~30 chars/s), a fast one (~600 chars/s), heavy
burstiness, and long pauses. Watch for a visible speed step when a burst lands, a
stall at the tail, and a wave that runs too long after a batch.

- [ ] **Step 2: Adjust the defaults and re-run the test suite**

Run: `npm test`
Expected: PASS - the timing tests are written against option values, not
hard-coded constants, so tuning must not break them. Fix any test that turns out
to encode a magic number instead of a relationship.

- [ ] **Step 3: Commit** - `tune: default pacing and reveal values`

---

### Task 16: README and repository polish

**Files:**
- Create: `README.md`, `docs/hero.png` (and `docs/demo.gif` if ffmpeg is available)

- [ ] **Step 1: Capture the demo asset**

Drive the playground with a headless browser, capture frames, assemble with
ffmpeg. If ffmpeg is unavailable, capture a single hero screenshot instead and
say so - the README must not reference an asset that does not exist.

- [ ] **Step 2: Write the README**

English. Badges (npm version, minzipped size, license). One-paragraph pitch, then:
zero dependencies / headless-first / works in any framework. Install. Quick start
for the headless React path **first** (it is the primary use), then the ready-made
component, then vanilla, Vue, Svelte and the Web Component. A section on using the
wave over your own markdown renderer. Full option tables for pacing and reveal,
copied from the spec. A short "how the pacing works" section - this is the
differentiator and it should be visible from the README. Honest limitations.

- [ ] **Step 3: Commit** - `docs: readme with live demo and full option tables`

---

### Task 17: Pre-publish verification, then stop

**Files:** none - verification only

- [ ] **Step 1: Full green run**

Run: `npm run lint && npm run typecheck && npm test && npm run build`
Expected: all clean.

- [ ] **Step 2: Verify the published shape**

Run: `npm pack --dry-run` and `npx publint`
Expected: `dist`, `README.md`, `LICENSE` only; every export path resolves; no
missing types; CJS/ESM shape valid.

- [ ] **Step 3: Verify the package works from a consumer's side**

Install the packed tarball into a scratch directory and import each entry point
(`.`, `./dom`, `./react`, `./vue`, `./svelte`, `./web-component`), checking that
types resolve and the root entry imports cleanly under plain Node.

- [ ] **Step 4: STOP and ask**

Report the results and ask before `npm publish` and before deploying the
playground. Both are outward-facing and must not happen without explicit
approval.

---

## Self-Review

**Spec coverage:** section 3 -> Tasks 5-7; section 4 -> Tasks 2-4; section 5 ->
Task 9; section 6 -> Tasks 8, 10, 11; section 7.1 -> Task 12; sections 7.2-7.4 ->
Task 13; section 8 -> Task 1 (+ Task 17 verification); section 9 -> the test steps
of Tasks 2, 4, 6, 7, 8, 9, 11, 12, 13; section 10 -> Task 14; section 11 ->
Task 16; section 12 is a non-goal list, nothing to build.

**Placeholders:** none - every step names its files, its command and its expected
outcome, and the non-obvious algorithms (grapheme clamp, markdown scanner, pacer
step, wave claim, reveal DOM shape) are specified concretely.

**Type consistency:** `RevealHandle` is declared once in `src/reveal/types.ts` and
used by Tasks 11-13. `SmoothState`, `SmoothStream`, `PacingOptions`, `Clock` come
from `src/core/types.ts` and are used unchanged everywhere. `createReveal` takes
`RevealOptions & { timeline?, clock? }` in Task 11 and is called that way in
Tasks 12 and 13. `splitPieces` returns `Piece[]` in Task 8 and is consumed as such
in Task 11.
