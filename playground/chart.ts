interface Sample {
  lag: number
  rate: number
}

const HISTORY = 300
/** The scale relaxes slowly, so a steady signal keeps its shape instead of flattening. */
const PEAK_DECAY = 0.995
/** The smallest scale, so near-zero noise at rest does not fill the whole chart. */
const LAG_FLOOR = 20
const RATE_FLOOR = 100
const GRID_LINES = 3
/** Half the width of the smoothing window, in samples, and how many times it runs. */
const SMOOTH_RADIUS = 3
const SMOOTH_PASSES = 2

/**
 * A box blur run twice, which comes close to a Gaussian: steps and spikes in the
 * raw samples become rounded slopes. An average never rises above the highest
 * sample it covers, so the smoothed line stays inside the same scale.
 */
function smooth(values: number[]): number[] {
  let current = values
  for (let pass = 0; pass < SMOOTH_PASSES; pass++) {
    const next = new Array<number>(current.length)
    for (let i = 0; i < current.length; i++) {
      const from = Math.max(0, i - SMOOTH_RADIUS)
      const to = Math.min(current.length - 1, i + SMOOTH_RADIUS)
      let sum = 0
      for (let k = from; k <= to; k++) sum += current[k]
      next[i] = sum / (to - from + 1)
    }
    current = next
  }
  return current
}

/** `#rrggbb` with an alpha, for the canvas, which cannot take `color-mix()` everywhere. */
function withAlpha(color: string, alpha: number): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(color)
  if (!hex) return color
  const value = parseInt(hex[1], 16)
  return `rgba(${value >> 16}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`
}

/**
 * Plots the two numbers the controller actually works with: how far behind the
 * display is, and how fast it is currently drawing. Watching them is the quickest
 * way to tell a healthy setting from a twitchy one.
 */
export function createChart(canvas: HTMLCanvasElement) {
  const samples: Sample[] = []
  let lags: number[] = []
  let rates: number[] = []
  let peakLag = LAG_FLOOR
  let peakRate = RATE_FLOOR

  // The palette lives in the stylesheet, next to the swatches these lines match.
  const css = getComputedStyle(canvas)
  const read = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback
  const lagColor = read('--lag', '#dfbd82')
  const rateColor = read('--rate', '#76e6d4')
  const gridColor = read('--grid', 'rgba(255, 255, 255, 0.07)')

  function resize() {
    const ratio = window.devicePixelRatio || 1
    const { width, height } = canvas.getBoundingClientRect()
    canvas.width = Math.max(1, Math.round(width * ratio))
    canvas.height = Math.max(1, Math.round(height * ratio))
  }

  function plot(context: CanvasRenderingContext2D, values: number[], peak: number, color: string) {
    const { width, height } = canvas
    const ratio = window.devicePixelRatio || 1
    // Room above the highest point for the glow, and below zero for the line itself.
    const top = 12 * ratio
    const bottom = height - 4 * ratio
    const x = (index: number) => (index / (HISTORY - 1)) * width
    const y = (value: number) => bottom - Math.min(1, value / peak) * (bottom - top)

    const fill = context.createLinearGradient(0, top, 0, height)
    fill.addColorStop(0, withAlpha(color, 0.26))
    fill.addColorStop(1, withAlpha(color, 0))

    context.beginPath()
    context.moveTo(x(0), height)
    values.forEach((value, index) => context.lineTo(x(index), y(value)))
    context.lineTo(x(values.length - 1), height)
    context.closePath()
    context.fillStyle = fill
    context.fill()

    context.beginPath()
    values.forEach((value, index) => {
      if (index === 0) context.moveTo(x(index), y(value))
      else context.lineTo(x(index), y(value))
    })
    context.strokeStyle = color
    context.lineWidth = Math.max(1.5, ratio * 1.3)
    context.lineJoin = 'round'
    context.lineCap = 'round'
    context.shadowColor = withAlpha(color, 0.7)
    context.shadowBlur = 8 * ratio
    context.stroke()
    context.shadowBlur = 0
  }

  function grid(context: CanvasRenderingContext2D) {
    const { width, height } = canvas
    const ratio = window.devicePixelRatio || 1
    context.save()
    context.strokeStyle = gridColor
    context.lineWidth = ratio
    context.setLineDash([2 * ratio, 4 * ratio])
    for (let line = 1; line <= GRID_LINES; line++) {
      const level = Math.round((height * line) / (GRID_LINES + 1)) + 0.5
      context.beginPath()
      context.moveTo(0, level)
      context.lineTo(width, level)
      context.stroke()
    }
    context.restore()
  }

  function draw() {
    const context = canvas.getContext('2d')
    if (!context) return
    context.clearRect(0, 0, canvas.width, canvas.height)
    grid(context)
    if (samples.length < 2) return
    plot(context, rates, peakRate, rateColor)
    plot(context, lags, peakLag, lagColor)
  }

  // The canvas, not the window: the side panel reflows on its own when the layout
  // switches between columns or a scrollbar comes and goes.
  resize()
  new ResizeObserver(() => {
    resize()
    draw()
  }).observe(canvas)

  return {
    push(lag: number, rate: number) {
      samples.push({ lag, rate })
      if (samples.length > HISTORY) samples.shift()
      lags = smooth(samples.map((sample) => sample.lag))
      rates = smooth(samples.map((sample) => sample.rate))
      // Never below the highest point on screen, so the whole line stays in view;
      // it only eases down once that point has scrolled out.
      peakLag = Math.max(Math.max(...lags), peakLag * PEAK_DECAY, LAG_FLOOR)
      peakRate = Math.max(Math.max(...rates), peakRate * PEAK_DECAY, RATE_FLOOR)
      draw()
    },
    clear() {
      samples.length = 0
      lags = []
      rates = []
      peakLag = LAG_FLOOR
      peakRate = RATE_FLOOR
      draw()
    },
  }
}
