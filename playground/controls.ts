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
      }
      show()

      input.addEventListener('input', () => {
        show()
        onChange(spec.key, Number(input.value))
      })

      row.append(name, readout, input)
    } else {
      const select = document.createElement('select')
      for (const option of spec.options) {
        const item = document.createElement('option')
        item.value = option
        item.textContent = option
        select.appendChild(item)
      }
      select.value = spec.value
      select.addEventListener('change', () => onChange(spec.key, select.value))
      row.append(name, select)
    }

    group.appendChild(row)
  }

  container.appendChild(group)
}
