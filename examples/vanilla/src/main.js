import './style.css'
import { mountImperativePanel } from './imperative-panel.js'
import { mountWebComponentPanel } from './web-component-panel.js'

mountImperativePanel(document.getElementById('imperative'))
mountWebComponentPanel(document.getElementById('web-component'))
