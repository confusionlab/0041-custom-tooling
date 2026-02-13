interface Marker {
  time: number
  id: string
}

let video: HTMLVideoElement | null = null
let markers: Marker[] = []
let isDragging = false
let keydownHandler: ((e: KeyboardEvent) => void) | null = null

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
          <div id="timeline" class="timeline">
            <div id="progress" class="progress"></div>
            <div id="markers-container" class="markers-container"></div>
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

  const timeline = document.getElementById('timeline')!
  const progress = document.getElementById('progress')!
  const timeDisplay = document.getElementById('time-display')!
  const playBtn = document.getElementById('play-btn')!
  const exportBtn = document.getElementById('export-btn')!

  video.addEventListener('timeupdate', () => {
    if (!video) return
    const percent = (video.currentTime / video.duration) * 100
    progress.style.width = `${percent}%`
    timeDisplay.textContent = `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`
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

  timeline.addEventListener('mousedown', (e) => {
    isDragging = true
    seekToPosition(e)
  })

  document.addEventListener('mousemove', (e) => {
    if (isDragging) {
      seekToPosition(e)
    }
  })

  document.addEventListener('mouseup', () => {
    isDragging = false
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
}

function seekToPosition(e: MouseEvent) {
  if (!video) return
  const timeline = document.getElementById('timeline')!
  const rect = timeline.getBoundingClientRect()
  const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  video.currentTime = percent * video.duration
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

  const markersContainer = document.getElementById('markers-container')!
  const markersList = document.getElementById('markers-list')!

  markersContainer.innerHTML = markers.map(m => {
    const percent = (m.time / video!.duration) * 100
    return `<div class="marker" style="left: ${percent}%" data-id="${m.id}"></div>`
  }).join('')

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
