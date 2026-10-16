/**
 * A realistic answer. Paragraphs are single lines so the pane wraps them itself,
 * and it deliberately contains every construct the markdown-safe boundary has to
 * handle - emphasis, inline code, a link, a heading, a bullet list, a fenced
 * block and a table - so the rules can be watched, not just tested.
 */
export const SAMPLE = `## Why streamed text feels jumpy

When a model answers, the chunks arrive **unevenly**: one word, then twenty at once, then a pause while the server thinks. Rendering each chunk the moment it lands means the text stutters, and the eye reads the stutter before it reads the words.

Two things fix it, and they are independent:

- **Pacing.** Buffer what arrives and release it at an even rate. That rate is not a constant you tune per model - it follows from holding a fixed distance behind the live text.
- **Reveal.** Let new words fade up rather than switch on, so the edge of the text is soft instead of a hard boundary that jumps.

The controller is small. Each frame it asks for the rate that would drain the current backlog over the target latency, then eases the current rate towards it:

\`\`\`ts
const desired = pending / targetLatencyMs
const alpha = 1 - Math.exp(-dt / adaptMs)
rate += (desired - rate) * alpha
\`\`\`

That is the whole idea. A fast producer builds a bigger backlog and gets drained faster; a slow one is drained slower. Call \`end()\` and the target decays to zero, so the tail accelerates gently into a stop instead of stalling three characters from the end.

| Situation | Without pacing | With pacing |
| --- | --- | --- |
| Twenty words at once | All twenty appear | Speed rises for a moment |
| A two second stall | Text freezes mid-word | Tail finishes and waits |
| Stream closes | Last chunk snaps in | Tail eases to a stop |

Notice what never happens on the right: a lone \`**\` before its partner arrives, a half-written [link](https://github.com/crmapache/smooth-stream-text), or a broken emoji. The cursor is not allowed to stop in those places.
`

/**
 * The same story in a script without spaces between words. The cursor stops at
 * dictionary words, and punctuation stays with the word before it.
 */
const CHINESE = `## 为什么流式文本看起来一跳一跳的

模型回答问题时，文本片段到达的节奏**很不均匀**：有时一个词，有时一下子二十个词，然后服务器思考时又停顿一下。每个片段一到就立刻渲染，文字就会卡顿，眼睛在读懂内容之前先注意到了卡顿。

解决办法有两个，而且彼此独立：

- **节奏控制。** 先缓冲收到的文本，再以均匀的速度放出来。这个速度不是为每个模型单独调的常数，而是由与实时文本保持固定距离推算出来的。
- **渐显。** 新出现的词语柔和地淡入，而不是突然出现。

中文没有空格，所以光标按词典里的词停下，不会把一个词拆成两半。标点始终跟着前面的词，不会单独出现在行首。
`

/**
 * And in a joined script written right to left. Letters inside a word connect,
 * so a word cut in two would show its letters in the wrong forms until joined.
 */
const ARABIC = `## لماذا يبدو النص المتدفق متقطعًا

عندما يجيب النموذج، تصل الأجزاء بشكل **غير منتظم**: كلمة واحدة، ثم عشرون كلمة دفعة واحدة، ثم توقف بينما يفكر الخادم. عرض كل جزء لحظة وصوله يجعل النص يتلعثم، والعين تلاحظ التلعثم قبل أن تقرأ الكلمات.

هناك حلّان مستقلان:

- **ضبط الإيقاع.** تخزين ما يصل ثم إظهاره بسرعة متساوية، على مسافة ثابتة خلف النص الحي.
- **الظهور التدريجي.** تظهر الكلمات الجديدة بتلاشٍ ناعم بدلًا من أن تقفز فجأة.

الحروف العربية تتصل ببعضها، لذلك يتوقف المؤشر بين الكلمات فقط، فلا تنقسم كلمة إلى نصفين ولا تنفصل حروفها أثناء الظهور.
`

export const SAMPLES: Record<string, string> = {
  English: SAMPLE,
  中文: CHINESE,
  العربية: ARABIC,
}
