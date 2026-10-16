export interface SliderSpec {
  key: string
  label: string
  min: number
  max: number
  step: number
  value: number
  unit?: string
}

export interface SelectSpec {
  key: string
  label: string
  options: string[]
  value: string
}

export type ControlSpec = SliderSpec | SelectSpec

const isSlider = (spec: ControlSpec): spec is SliderSpec => 'min' in spec

/** Builds one labelled group of live controls and reports every change by key. */
export function buildControls(
  container: HTMLElement,
  title: string,
  specs: ControlSpec[],
  onChange: (key: string, value: number | string) => void,
): void {
  const group = document.createElement('section')
  group.className = 'group card lit'

  const heading = document.createElement('h3')
  heading.textContent = title
  group.appendChild(heading)

  for (const spec of specs) {
    // A label only around a slider: a label forwards clicks to the first control
    // inside it, which in a segmented row would select its first option.
    const row = document.createElement(isSlider(spec) ? 'label' : 'div')
    row.className = 'control'

    const name = document.createElement('span')
    name.className = 'control-label'
    name.textContent = spec.label

    const readout = document.createElement('span')
    readout.className = 'control-value'

    if (isSlider(spec)) {
      const input = document.createElement('input')
      input.type = 'range'
      input.min = String(spec.min)
      input.max = String(spec.max)
      input.step = String(spec.step)
      input.value = String(spec.value)

      const show = () => {
        readout.textContent = spec.unit ? `${input.value}${spec.unit}` : input.value
        // Drives the filled portion of the track, so the slider reads as ours.
        const filled = ((Number(input.value) - spec.min) / (spec.max - spec.min)) * 100
        input.style.setProperty('--fill', `${filled}%`)
      }
      show()

      input.addEventListener('input', () => {
        show()
        onChange(spec.key, Number(input.value))
      })

      row.append(name, readout, input)
    } else {
      // A segmented control rather than a native select: two or three options fit
      // on one row, and it is one click instead of two.
      row.append(
        name,
        createSegmented(spec, (value) => onChange(spec.key, value)),
      )
    }

    group.appendChild(row)
  }

  container.appendChild(group)
}

/** A radio group drawn as one row of options, with a thumb that slides to the checked one. */
export function createSegmented(spec: SelectSpec, onChange: (value: string) => void): HTMLElement {
  const segmented = document.createElement('div')
  segmented.className = 'segmented'
  segmented.setAttribute('role', 'radiogroup')
  segmented.setAttribute('aria-label', spec.label)

  const thumb = document.createElement('span')
  thumb.className = 'segmented-thumb'
  segmented.appendChild(thumb)

  const buttons = spec.options.map((option) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'segment'
    button.textContent = option
    button.setAttribute('role', 'radio')
    segmented.appendChild(button)
    return button
  })

  let checked = 0

  // Measured rather than computed from the index: a font that loads late changes
  // the widths, and the observer below puts the thumb back under its option.
  const place = () => {
    const button = buttons[checked]
    if (!button.offsetWidth) return
    thumb.style.width = `${button.offsetWidth}px`
    thumb.style.transform = `translateX(${button.offsetLeft}px)`
    if (!('placed' in segmented.dataset)) requestAnimationFrame(() => (segmented.dataset.placed = ''))
  }
  new ResizeObserver(place).observe(segmented)

  // A radio group is one tab stop - the checked option - and the arrow keys
  // move the choice within it, as the radiogroup role promises.
  const check = (index: number) => {
    checked = index
    buttons.forEach((button, i) => {
      button.setAttribute('aria-checked', String(i === index))
      button.tabIndex = i === index ? 0 : -1
    })
    place()
  }
  const choose = (index: number) => {
    check(index)
    buttons[index].focus()
    onChange(spec.options[index])
  }
  check(Math.max(0, spec.options.indexOf(spec.value)))

  buttons.forEach((button, index) => button.addEventListener('click', () => choose(index)))
  segmented.addEventListener('keydown', (event) => {
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement)
    if (current < 0) return
    const last = buttons.length - 1
    const next =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? (current + 1) % buttons.length
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? (current + last) % buttons.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : -1
    if (next < 0) return
    event.preventDefault()
    choose(next)
  })

  return segmented
}
