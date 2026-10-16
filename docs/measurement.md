# What we measure, and what each number does not mean

Internal note for the maintainer. Not part of the public docs or the npm package.

Three kinds of evidence answer different questions and are never added together:
controlled experiments (do coding agents find and integrate the package), site
analytics (do people read the docs and take a step), and real integrations (is it used).
npm downloads are a side signal.

## Site analytics (Umami, self-hosted)

Instance: https://analytics.mzpizote.com, website `smooth-stream-text`
(`1ca1a0aa-b24c-4d45-8c2d-656c1453e435`). The script runs only on
`smooth-stream-text.vercel.app` (`data-domains`), honours Do Not Track, and sets no
cookies. It counts browsers that run JavaScript, so most crawlers and every AI fetcher
that reads `.md` or `llms.txt` are not in these numbers.

| Metric | Definition | Source | It is not |
| --- | --- | --- | --- |
| Page views, visitors | Umami page views and unique visitors per page | Umami | a count of people who use the package |
| Referrers | Umami referrer domains; AI products show up as `chatgpt.com`, `claude.ai`, `gemini.google.com`, `perplexity.ai`, `copilot.microsoft.com` when they send a referrer | Umami | complete: assistants often send none |
| `copy-install` | A click on the install button on the playground, or on the copy button of a code block that contains an install command for the package | Umami event, `page` property | an installation |
| `copy-code` | A click on the copy button of any other code block, with `page` and `lang` | Umami event | a working integration |
| `outbound` | A click from the site to GitHub or npm, with `target` and `page` | Umami event | a star or a download |
| `open-docs` | A click on "Read the docs" on the playground | Umami event | |
| `found-via` | The optional "How did you find smooth-stream-text?" answer on the docs home page, `source` (`ai`, `search`, `github`, `npm`, `people`, `other`) and, for `ai`, `assistant` | Umami event | a sample of all readers: only those who answer |

## Search and crawling

| Metric | Source | Notes |
| --- | --- | --- |
| Sitemap accepted | Google Search Console, Bing Webmaster Tools | Accepted is not indexed. Record both separately. |
| Pages indexed | Search Console page indexing report, URL inspection | Not `site:` queries. |
| Search appearance in AI features | Search Console performance report, where available | Google-only. |
| Crawler requests | Vercel request logs filtered by user agent (OAI-SearchBot, ChatGPT-User, GPTBot, Claude-SearchBot, Claude-User, ClaudeBot, Googlebot, PerplexityBot, bingbot) | A user-agent string can be faked; a request is not a citation or a recommendation. |

## Controlled experiment

The private harness in `../smooth-stream-text-aieo` (not in this repository, so its
queries cannot be found by the agents it tests). It runs Claude Code, Codex and
Antigravity in clean environments on fixed projects and queries and reports mention,
recommendation, install attempts, valid dependencies, passing builds and false
positives on negative controls, with intervals bootstrapped over queries. A baseline
taken before the public changes is the reference for every later run. Results with the
skill or Context7 connected are reported separately from the clean runs.

## npm

| Metric | Source | It is not |
| --- | --- | --- |
| Downloads | `https://api.npmjs.org/downloads/range/<period>/smooth-stream-text` | people, installations, or AI recommendations: CI, caches and reinstalls all count |
| Dependents | GitHub "Used by", npm dependents | complete: private projects do not show |

## Real integrations

Public projects that use the package, written up on `/docs/case-studies` with links to
code at a fixed commit. A case counts when the code can be checked.

## Rules

- Report counts with their denominators and the period.
- Compare before and after only when the list of changes between the two and their
  dates are written down; several changes at once cannot be credited to one of them.
- No runtime telemetry in the library itself.
