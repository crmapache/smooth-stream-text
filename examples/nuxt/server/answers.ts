// Canned content for the simulated model. Every answer ends with a plain
// sentence of its own, which the end-to-end tests look for.

export interface Turn {
  question: string
  answer: string
}

/** A conversation that already happened. The page renders it complete, on the server. */
export const history: Turn[] = [
  {
    question: 'When should I use const instead of let?',
    answer: `## \`const\` or \`let\`

Use **\`const\`** by default. It does not make a value immutable, it only stops the variable from being reassigned:

\`\`\`js
const user = { name: 'Ada' }
user.name = 'Grace' // fine, the object itself can change
user = {} // TypeError: Assignment to constant variable
\`\`\`

Reach for \`let\` when the binding really changes, such as a counter or a running total in a loop.

Use const by default and switch to let only when you need to reassign.`,
  },
  {
    question: 'What is the simplest way to center an element?',
    answer: `With **CSS Grid** it takes two declarations on the parent:

\`\`\`css
.parent {
  display: grid;
  place-items: center;
}
\`\`\`

- \`place-items\` is shorthand for \`align-items\` and \`justify-items\`.
- It centers the child both horizontally and vertically.
- For text inside a block, \`text-align: center\` is still the right tool.

Grid is usually the shortest way to center something.`,
  },
]

/** Served in turn, one per request. */
export const answers: string[] = [
  `## Caching static assets

The fastest request is the one the browser never makes. When a file name changes with every build, the browser can keep the file for a year with **\`Cache-Control\`**:

\`\`\`js
app.use(
  '/assets',
  express.static('dist/assets', { immutable: true, maxAge: '1y' }),
)
\`\`\`

A few rules keep this safe:

- Put a content hash in every asset name, so a new version gets a new URL.
- Serve the HTML with \`no-cache\`, so the page always asks for the latest list of assets.
- Check the **Network** panel: a \`304\` response means revalidation worked.

| Resource | Header | Why |
| --- | --- | --- |
| \`app.3f9a1c.js\` | \`max-age=31536000, immutable\` | The name changes with the content |
| \`index.html\` | \`no-cache\` | Always revalidated |
| \`/api/*\` | \`private, no-store\` | Personal data |

The [MDN guide to HTTP caching](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Caching) covers the rest.

That is all you need to get started.`,

  `Building for people all over the world 🌍 means testing with real text, not lorem ipsum. I keep a few lines around for that 👩‍💻, one per script:

- 中文：好的网页在每一种语言里都应该同样好用。
- 日本語：文字化けを防ぐために、常にUTF-8を使いましょう。
- العربية: يجب أن تدعم الواجهة الكتابة من اليمين إلى اليسار.
- हिन्दी: हर भाषा में फ़ॉन्ट की जाँच ज़रूरी है।

They catch the usual suspects: fonts without the right glyphs, line breaking that assumes spaces, layouts that break when the text runs right to left. Portuguese for Brazil 🇧🇷 adds accents such as ã and ç, which show up in sorting and search too.

Real text finds the bugs that placeholder text hides.`,

  `Most problems with web forms have nothing to do with validation libraries or frameworks. They come from a handful of small decisions that are easy to get right once you know where to look, and easy to get wrong when a form is built from screenshots alone.

Start with labels. Every input needs a visible label that is connected to it, either by wrapping the input in the label or by pointing the label at the input's id. A placeholder is not a label: it disappears as soon as someone starts typing, it usually has poor contrast, and some screen readers skip it. A connected label also focuses the field when clicked, which gives people on touch screens a larger target.

Next, think about order. People move through forms with the Tab key far more often than designers expect, and focus follows the order of the markup, not the visual layout. If a grid reorders fields on screen, the keyboard path jumps around the page. Keep the source order and the visual order the same, and make sure every control, including custom ones, shows a clear focus outline. People using a screen magnifier see a small part of the page at a time, so a label placed far from its field is easy to miss.

Errors deserve the most care. A message that only says a value is invalid leaves people guessing. Say what is wrong and how to fix it, place the message next to its field, and connect the two so that assistive technology reads the message together with the label. Do not rely on colour alone, because a red border means nothing to someone who cannot tell red from green. When a submitted form has errors, move focus to a short summary at the top that links to each problem.

A few habits cover most of what is left:

- Use the right input type, such as email or tel, so that phones show a suitable keyboard.
- Add autocomplete hints for names, addresses and payment details, so browsers and password managers can fill them in.
- Group related controls, like a set of radio buttons, under a heading that names the group.
- Keep buttons as real buttons with clear text, and do not disable the submit button without saying why.
- Go through the whole form with only a keyboard, then with a screen reader, before calling it finished.

None of this needs a special library. It is plain HTML used the way it was designed, and it tends to make a form better for everyone: quicker to fill in on a phone, easier to follow when tired or distracted, and more forgiving when something goes wrong.

Small habits like these add up to forms that everyone can finish.`,
]
