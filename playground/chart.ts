interface Sample {
  lag: number
  rate: number
}

const HISTORY = 300
/** The scale relaxes slowly, so a steady signal keeps its shape instead of flattening. */
const PEAK_DECAY = 0.995

/**
 * Plots the two numbers the controller actually works with: how far behind the
 * display is, and how fast it is currently drawing. Watching them is the quickest
 * way to tell a healthy setting from a twitchy one.
 */
export function createChart(canvas: HTMLCanvasElement) {
  const samples: Sample[] = []
  let peakLag = 40
  let peakRate = 200

  function resize() {
    const ratio = window.devicePixelRatio || 1
    const { width, height } = canvas.getBoundingClientRect()
    canvas.width = Math.max(1, Math.round(width * ratio))
    canvas.height = Math.max(1, Math.round(height * ratio))
  }

  function plot(
    context: CanvasRenderingContext2D,
    pick: (sample: Sample) => number,
    peak: number,
    stroke: string,
    fill: string,
  ) {
    const { width, height } = canvas
    const top = height * 0.1
    const span = height * 0.82
    const x = (index: number) => (index / (HISTORY - 1)) * width
    const y = (value: number) => top + span - Math.min(1, value / peak) * span

    context.beginPath()
    context.moveTo(x(0), height)
    samples.forEach((sample, index) => context.lineTo(x(index), y(pick(sample))))
    context.lineTo(x(samples.length - 1), height)
    context.closePath()
    context.fillStyle = fill
    context.fill()

    context.beginPath()
    samples.forEach((sample, index) => {
      const point = y(pick(sample))
      if (index === 0) context.moveTo(x(index), point)
      else context.lineTo(x(index), point)
    })
    context.strokeStyle = stroke
    context.lineWidth = Math.max(1.5, (window.devicePixelRatio || 1) * 1.1)
    context.lineJoin = 'round'
    context.stroke()
  }

  function draw() {
    const context = canvas.getContext('2d')
    if (!context) return
    context.clearRect(0, 0, canvas.width, canvas.height)
    if (samples.length < 2) return
    plot(context, (s) => s.rate, peakRate, '#4ecdc4', 'rgba(78, 205, 196, 0.10)')
    plot(context, (s) => s.lag, peakLag, '#7c8cff', 'rgba(124, 140, 255, 0.14)')
  }

  resize()
  window.addEventListener('resize', () => {
    resize()
    draw()
  })

  return {
    push(lag: number, rate: number) {
      samples.push({ lag, rate })
      if (samples.length > HISTORY) samples.shift()
      peakLag = Math.max(lag, peakLag * PEAK_DECAY, 20)
      peakRate = Math.max(rate, peakRate * PEAK_DECAY, 100)
      draw()
    },
    clear() {
      samples.length = 0
      peakLag = 40
      peakRate = 200
      draw()
    },
  }
}
