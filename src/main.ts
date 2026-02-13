import './style.css'
import { framesExtractor } from './tools/frames-extractor'
import { mediaOptimizer } from './tools/media-optimizer'

const tools = [
  { path: '/frames-extractor', name: 'Frames Extractor', description: 'Extract frames from video at marked timestamps', render: framesExtractor },
  { path: '/media-optimizer', name: 'Media Optimizer', description: 'Convert images to WebP, videos to WebM', render: mediaOptimizer },
]

function renderHome() {
  const app = document.querySelector<HTMLDivElement>('#app')!
  app.innerHTML = `
    <div class="home">
      <h1>Custom Tools</h1>
      <div class="tools-grid">
        ${tools.map(tool => `
          <a href="${tool.path}" class="tool-card">
            <h2>${tool.name}</h2>
            <p>${tool.description}</p>
          </a>
        `).join('')}
      </div>
    </div>
  `
}

function router() {
  const path = window.location.pathname
  const tool = tools.find(t => t.path === path)

  if (tool) {
    tool.render()
  } else {
    renderHome()
  }
}

window.addEventListener('popstate', router)
document.addEventListener('click', (e) => {
  const target = e.target as HTMLElement
  const anchor = target.closest('a')
  if (anchor && anchor.href.startsWith(window.location.origin)) {
    e.preventDefault()
    window.history.pushState({}, '', anchor.href)
    router()
  }
})

router()
