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
  group.className = 'group'

  const heading = document.createElement('h3')
  heading.textContent = title
  group.appendChild(heading)

  for (const spec of specs) {
    const row = document.createElement('label')
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
      const segmented = document.createElement('div')
      segmented.className = 'segmented'
      segmented.setAttribute('role', 'radiogroup')
      segmented.setAttribute('aria-label', spec.label)

      const buttons = spec.options.map((option) => {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'segment'
        button.textContent = option
        button.setAttribute('role', 'radio')
        button.setAttribute('aria-checked', String(option === spec.value))
        segmented.appendChild(button)
        return { option, button }
      })

      for (const { option, button } of buttons) {
        button.addEventListener('click', () => {
          for (const other of buttons) other.button.setAttribute('aria-checked', String(other.option === option))
          onChange(spec.key, option)
        })
      }

      row.append(name, segmented)
    }

    group.appendChild(row)
  }

  container.appendChild(group)
}
