interface Marker {
  time: number
  id: string
}

type ZoomLevel = 2 | 4 | 8

let video: HTMLVideoElement | null = null
let markers: Marker[] = []
let dragMode: 'main' | 'detail' | null = null
let keydownHandler: ((e: KeyboardEvent) => void) | null = null
let zoomLevel: ZoomLevel = 2
let zoomWindowStart = 0
let zoomEnabled = true
const zoomLevels: ZoomLevel[] = [2, 4, 8]

export function framesExtractor() {
  const app = document.querySelector<HTMLDivElement>('#app')!
  app.innerHTML = `
    <div class="frames-extractor">
      <a href="/" class="back-link">&larr; Back</a>
      <h1>Frames Extractor</h1>

      <div id="drop-zone" class="drop-zone">
        <p>Drop video here or click to select</p>
        <input type="file" id="file-input" accept="video/*" hidden />
      </div>

      <div id="video-container" class="video-container hidden">
        <video id="video" muted></video>

        <div class="timeline-container">
          <div id="main-timeline" class="timeline timeline-main">
            <div id="main-progress" class="progress"></div>
            <div id="main-markers-container" class="markers-container"></div>
            <div id="zoom-window" class="zoom-window"></div>
          </div>
          <div class="zoom-controls">
            <button id="magnifier-toggle" class="zoom-toggle-btn">Magnifier On</button>
            <span class="zoom-label">Magnify</span>
            <div id="zoom-buttons" class="zoom-buttons">
              ${zoomLevels.map(level => `<button class="zoom-btn${level === zoomLevel ? ' active' : ''}" data-zoom="${level}">${level}x</button>`).join('')}
            </div>
          </div>
          <div id="detail-timeline" class="timeline timeline-detail">
            <div id="detail-progress" class="progress"></div>
            <div id="detail-markers-container" class="markers-container"></div>
          </div>
          <div id="time-display" class="time-display">0:00 / 0:00</div>
        </div>

        <div class="controls">
          <button id="play-btn" class="btn">Play</button>
          <span class="hint">Press SPACE to add marker at current position</span>
          <button id="export-btn" class="btn btn-primary">Export Frames</button>
        </div>

        <div id="markers-list" class="markers-list"></div>
      </div>

      <div id="export-progress" class="export-progress hidden">
        <p>Exporting frames...</p>
        <progress id="progress-bar" value="0" max="100"></progress>
      </div>
    </div>
  `

  markers = []

  // Clean up previous keydown handler
  if (keydownHandler) {
    document.removeEventListener('keydown', keydownHandler)
    keydownHandler = null
  }

  setupDropZone()
}

function setupDropZone() {
  const dropZone = document.getElementById('drop-zone')!
  const fileInput = document.getElementById('file-input') as HTMLInputElement

  dropZone.addEventListener('click', () => fileInput.click())

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault()
    dropZone.classList.add('dragover')
  })

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover')
  })

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault()
    dropZone.classList.remove('dragover')
    const file = e.dataTransfer?.files[0]
    if (file && file.type.startsWith('video/')) {
      loadVideo(file)
    }
  })

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0]
    if (file) {
      loadVideo(file)
    }
  })
}

function loadVideo(file: File) {
  const dropZone = document.getElementById('drop-zone')!
  const videoContainer = document.getElementById('video-container')!
  video = document.getElementById('video') as HTMLVideoElement

  const url = URL.createObjectURL(file)
  video.src = url

  video.addEventListener('loadedmetadata', () => {
    dropZone.classList.add('hidden')
    videoContainer.classList.remove('hidden')
    setupVideoControls()
  }, { once: true })
}

function setupVideoControls() {
  if (!video) return

  const mainTimeline = document.getElementById('main-timeline')!
  const detailTimeline = document.getElementById('detail-timeline')!
  const timeDisplay = document.getElementById('time-display')!
  const playBtn = document.getElementById('play-btn')!
  const exportBtn = document.getElementById('export-btn')!
  const zoomButtons = document.getElementById('zoom-buttons')!
  const magnifierToggle = document.getElementById('magnifier-toggle') as HTMLButtonElement

  zoomEnabled = true
  zoomLevel = 2
  zoomWindowStart = 0
  renderZoomButtons()
  renderMagnifierState()

  video.addEventListener('timeupdate', () => {
    if (!video) return
    if (zoomEnabled) {
      keepZoomWindowVisible()
    }
    renderTimelineState()
    timeDisplay.textContent = `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`
  })

  video.addEventListener('loadedmetadata', () => {
    if (!video) return
    renderTimelineState()
  })

  video.addEventListener('play', () => playBtn.textContent = 'Pause')
  video.addEventListener('pause', () => playBtn.textContent = 'Play')

  playBtn.addEventListener('click', () => {
    if (!video) return
    if (video.paused) {
      video.play()
    } else {
      video.pause()
    }
  })

  mainTimeline.addEventListener('mousedown', (e) => {
    dragMode = 'main'
    seekToMainTimeline(e)
  })

  detailTimeline.addEventListener('mousedown', (e) => {
    dragMode = 'detail'
    seekToDetailTimeline(e)
  })

  mainTimeline.addEventListener('wheel', (e) => {
    if (!zoomEnabled) return
    e.preventDefault()
    panZoomWindow(e.deltaY)
  }, { passive: false })

  detailTimeline.addEventListener('wheel', (e) => {
    if (!zoomEnabled) return
    e.preventDefault()
    panZoomWindow(e.deltaY)
  }, { passive: false })

  zoomButtons.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    const zoom = Number(target.dataset.zoom) as ZoomLevel
    if (!zoomLevels.includes(zoom)) return
    setZoomLevel(zoom)
  })

  magnifierToggle.addEventListener('click', () => {
    zoomEnabled = !zoomEnabled
    if (zoomEnabled && video) {
      const windowDuration = getZoomWindowDuration()
      setZoomWindowStart(video.currentTime - (windowDuration / 2))
    } else {
      renderTimelineState()
    }
    renderMagnifierState()
  })

  document.addEventListener('mousemove', (e) => {
    if (!dragMode) return
    if (dragMode === 'main') {
      seekToMainTimeline(e)
    } else {
      seekToDetailTimeline(e)
    }
  })

  document.addEventListener('mouseup', () => {
    dragMode = null
  })

  // Remove previous handler if exists
  if (keydownHandler) {
    document.removeEventListener('keydown', keydownHandler)
  }

  keydownHandler = (e: KeyboardEvent) => {
    if (e.code === 'Space' && video) {
      e.preventDefault()
      addMarker(video.currentTime)
    }
  }
  document.addEventListener('keydown', keydownHandler)

  exportBtn.addEventListener('click', exportFrames)
  renderTimelineState()
}

function seekToMainTimeline(e: MouseEvent) {
  if (!video) return
  const timeline = document.getElementById('main-timeline')!
  const rect = timeline.getBoundingClientRect()
  const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  const nextTime = percent * video.duration
  video.currentTime = nextTime
  if (zoomEnabled) {
    const windowDuration = getZoomWindowDuration()
    setZoomWindowStart(nextTime - (windowDuration / 2))
  } else {
    renderTimelineState()
  }
}

function seekToDetailTimeline(e: MouseEvent) {
  if (!video || !zoomEnabled) return
  const timeline = document.getElementById('detail-timeline')!
  const rect = timeline.getBoundingClientRect()
  const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  video.currentTime = zoomWindowStart + (percent * getZoomWindowDuration())
  renderTimelineState()
}

function addMarker(time: number) {
  const id = `marker-${Date.now()}`
  markers.push({ time, id })
  markers.sort((a, b) => a.time - b.time)
  renderMarkers()
}

function removeMarker(id: string) {
  markers = markers.filter(m => m.id !== id)
  renderMarkers()
}

function renderMarkers() {
  if (!video) return

  const mainMarkersContainer = document.getElementById('main-markers-container')!
  const detailMarkersContainer = document.getElementById('detail-markers-container')!
  const markersList = document.getElementById('markers-list')!

  mainMarkersContainer.innerHTML = markers.map(m => {
    const percent = (m.time / video!.duration) * 100
    return `<div class="marker" style="left: ${percent}%" data-id="${m.id}"></div>`
  }).join('')

  if (zoomEnabled) {
    const detailWindowDuration = getZoomWindowDuration()
    const detailWindowEnd = zoomWindowStart + detailWindowDuration
    detailMarkersContainer.innerHTML = markers
      .filter(m => m.time >= zoomWindowStart && m.time <= detailWindowEnd)
      .map(m => {
        const percent = ((m.time - zoomWindowStart) / detailWindowDuration) * 100
        return `<div class="marker" style="left: ${percent}%" data-id="${m.id}"></div>`
      })
      .join('')
  } else {
    detailMarkersContainer.innerHTML = ''
  }

  markersList.innerHTML = markers.length ? `
    <h3>Markers (${markers.length})</h3>
    <ul>
      ${markers.map((m, i) => `
        <li>
          <span class="marker-time" data-time="${m.time}">${i + 1}. ${formatTime(m.time)}</span>
          <button class="btn-remove" data-id="${m.id}">&times;</button>
        </li>
      `).join('')}
    </ul>
  ` : ''

  markersList.querySelectorAll('.marker-time').forEach(el => {
    el.addEventListener('click', () => {
      if (!video) return
      const time = parseFloat((el as HTMLElement).dataset.time!)
      video.currentTime = time
    })
  })

  markersList.querySelectorAll('.btn-remove').forEach(el => {
    el.addEventListener('click', () => {
      const id = (el as HTMLElement).dataset.id!
      removeMarker(id)
    })
  })
}

function setZoomLevel(level: ZoomLevel) {
  if (!video) return
  const oldWindowDuration = getZoomWindowDuration()
  const centerTime = zoomWindowStart + (oldWindowDuration / 2)
  zoomLevel = level
  const newWindowDuration = getZoomWindowDuration()
  setZoomWindowStart(centerTime - (newWindowDuration / 2))
  renderZoomButtons()
}

function renderZoomButtons() {
  document.querySelectorAll<HTMLButtonElement>('.zoom-btn').forEach(btn => {
    const zoom = Number(btn.dataset.zoom) as ZoomLevel
    btn.classList.toggle('active', zoom === zoomLevel)
  })
}

function renderMagnifierState() {
  const timelineContainer = document.querySelector('.timeline-container')
  const magnifierToggle = document.getElementById('magnifier-toggle')
  if (!timelineContainer || !magnifierToggle) return

  timelineContainer.classList.toggle('zoom-disabled', !zoomEnabled)
  magnifierToggle.textContent = zoomEnabled ? 'Magnifier On' : 'Magnifier Off'
}

function getZoomWindowDuration(): number {
  if (!video || !video.duration) return 0
  return video.duration / zoomLevel
}

function getMaxZoomWindowStart(): number {
  if (!video) return 0
  return Math.max(0, video.duration - getZoomWindowDuration())
}

function setZoomWindowStart(nextStart: number) {
  zoomWindowStart = Math.max(0, Math.min(getMaxZoomWindowStart(), nextStart))
  renderTimelineState()
}

function panZoomWindow(delta: number) {
  const direction = delta > 0 ? 1 : -1
  const panAmount = getZoomWindowDuration() * 0.08 * direction
  setZoomWindowStart(zoomWindowStart + panAmount)
}

function keepZoomWindowVisible() {
  if (!video) return
  const windowDuration = getZoomWindowDuration()
  const windowEnd = zoomWindowStart + windowDuration

  if (video.currentTime < zoomWindowStart) {
    zoomWindowStart = video.currentTime
  } else if (video.currentTime > windowEnd) {
    zoomWindowStart = video.currentTime - windowDuration
  }

  zoomWindowStart = Math.max(0, Math.min(getMaxZoomWindowStart(), zoomWindowStart))
}

function renderTimelineState() {
  if (!video || !video.duration) return

  const mainProgress = document.getElementById('main-progress') as HTMLDivElement | null
  const detailProgress = document.getElementById('detail-progress') as HTMLDivElement | null
  const zoomWindow = document.getElementById('zoom-window') as HTMLDivElement | null
  if (!mainProgress || !detailProgress || !zoomWindow) return

  const mainPercent = (video.currentTime / video.duration) * 100
  mainProgress.style.width = `${mainPercent}%`

  if (zoomEnabled) {
    const windowDuration = getZoomWindowDuration()
    const detailPercent = ((video.currentTime - zoomWindowStart) / windowDuration) * 100
    detailProgress.style.width = `${Math.max(0, Math.min(100, detailPercent))}%`

    const windowLeft = (zoomWindowStart / video.duration) * 100
    const windowWidth = (windowDuration / video.duration) * 100
    zoomWindow.style.left = `${windowLeft}%`
    zoomWindow.style.width = `${windowWidth}%`
  } else {
    detailProgress.style.width = '0%'
    zoomWindow.style.width = '0%'
  }

  renderMarkers()
}

async function exportFrames() {
  if (!video || markers.length === 0) {
    alert('Add at least one marker first')
    return
  }

  const exportProgress = document.getElementById('export-progress')!
  const progressBar = document.getElementById('progress-bar') as HTMLProgressElement
  exportProgress.classList.remove('hidden')

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!

  const maxWidth = 1080
  const maxHeight = 1920

  let width = video.videoWidth
  let height = video.videoHeight

  if (width > maxWidth || height > maxHeight) {
    const ratio = Math.min(maxWidth / width, maxHeight / height)
    width = Math.round(width * ratio)
    height = Math.round(height * ratio)
  }

  canvas.width = width
  canvas.height = height

  const frames: { blob: Blob; time: number }[] = []

  for (let i = 0; i < markers.length; i++) {
    const marker = markers[i]
    video.currentTime = marker.time

    await new Promise<void>(resolve => {
      video!.onseeked = () => resolve()
    })

    ctx.drawImage(video, 0, 0, width, height)

    const blob = await new Promise<Blob>((resolve) => {
      canvas.toBlob(b => resolve(b!), 'image/jpeg', 0.95)
    })

    frames.push({ blob, time: marker.time })
    progressBar.value = ((i + 1) / markers.length) * 100
  }

  for (let i = 0; i < frames.length; i++) {
    const { blob, time } = frames[i]
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `frame_${String(i + 1).padStart(3, '0')}_${formatTimeFilename(time)}.jpg`
    a.click()
    URL.revokeObjectURL(a.href)
    await new Promise(r => setTimeout(r, 100))
  }

  exportProgress.classList.add('hidden')
  progressBar.value = 0
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${String(secs).padStart(2, '0')}`
}

function formatTimeFilename(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  const ms = Math.floor((seconds % 1) * 1000)
  return `${mins}m${String(secs).padStart(2, '0')}s${String(ms).padStart(3, '0')}`
}
