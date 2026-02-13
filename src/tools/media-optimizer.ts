import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'

interface FileItem {
  file: File
  name: string
  type: 'image' | 'video'
  status: 'pending' | 'processing' | 'done' | 'error'
  progress: number
  outputBlob?: Blob
  outputName?: string
  error?: string
}

const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.tif', '.webp']
const VIDEO_EXTS = ['.mp4', '.mov', '.avi', '.mkv', '.wmv', '.flv', '.m4v', '.mpg', '.mpeg', '.webm']

let files: FileItem[] = []
let isProcessing = false
let ffmpeg: FFmpeg | null = null

export function mediaOptimizer() {
  const app = document.querySelector<HTMLDivElement>('#app')!
  app.innerHTML = `
    <div class="media-optimizer">
      <a href="/" class="back-link">&larr; Back</a>
      <h1>Media Optimizer</h1>
      <p class="subtitle">Convert images to WebP, videos to WebM</p>

      <div id="drop-zone" class="drop-zone">
        <p>Drop files or folder here</p>
        <p class="hint">Images → WebP | Videos → WebM</p>
        <input type="file" id="file-input" multiple hidden />
      </div>

      <div id="file-list" class="file-list hidden">
        <div class="file-list-header">
          <span id="file-count">0 files</span>
          <div class="header-actions">
            <button id="clear-btn" class="btn btn-small">Clear</button>
            <button id="start-btn" class="btn btn-primary">Convert All</button>
          </div>
        </div>
        <div id="files-container" class="files-container"></div>
        <div class="file-list-footer">
          <button id="download-all-btn" class="btn btn-primary hidden">Download All</button>
        </div>
      </div>

      <div id="loading-ffmpeg" class="loading-ffmpeg hidden">
        <div class="spinner"></div>
        <p>Loading FFmpeg...</p>
      </div>
    </div>
  `

  files = []
  isProcessing = false
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

  dropZone.addEventListener('drop', async (e) => {
    e.preventDefault()
    dropZone.classList.remove('dragover')

    const items = e.dataTransfer?.items
    if (items) {
      const filePromises: Promise<File[]>[] = []
      for (let i = 0; i < items.length; i++) {
        const item = items[i].webkitGetAsEntry()
        if (item) {
          filePromises.push(traverseEntry(item))
        }
      }
      const allFiles = (await Promise.all(filePromises)).flat()
      addFiles(allFiles)
    }
  })

  fileInput.addEventListener('change', () => {
    if (fileInput.files) {
      addFiles(Array.from(fileInput.files))
    }
  })

  document.getElementById('clear-btn')?.addEventListener('click', () => {
    files = []
    renderFiles()
    document.getElementById('file-list')?.classList.add('hidden')
    document.getElementById('drop-zone')?.classList.remove('hidden')
  })

  document.getElementById('start-btn')?.addEventListener('click', startConversion)
  document.getElementById('download-all-btn')?.addEventListener('click', downloadAll)
}

async function traverseEntry(entry: FileSystemEntry): Promise<File[]> {
  if (entry.isFile) {
    return new Promise((resolve) => {
      (entry as FileSystemFileEntry).file((file) => resolve([file]), () => resolve([]))
    })
  } else if (entry.isDirectory) {
    const dirReader = (entry as FileSystemDirectoryEntry).createReader()
    const entries = await new Promise<FileSystemEntry[]>((resolve) => {
      dirReader.readEntries((entries) => resolve(entries), () => resolve([]))
    })
    const nestedFiles = await Promise.all(entries.map(traverseEntry))
    return nestedFiles.flat()
  }
  return []
}

function getFileType(filename: string): 'image' | 'video' | null {
  const ext = '.' + filename.split('.').pop()?.toLowerCase()
  if (IMAGE_EXTS.includes(ext)) return 'image'
  if (VIDEO_EXTS.includes(ext)) return 'video'
  return null
}

function addFiles(newFiles: File[]) {
  for (const file of newFiles) {
    const type = getFileType(file.name)
    if (type && !files.some(f => f.name === file.name)) {
      files.push({
        file,
        name: file.name,
        type,
        status: 'pending',
        progress: 0
      })
    }
  }

  if (files.length > 0) {
    document.getElementById('drop-zone')?.classList.add('hidden')
    document.getElementById('file-list')?.classList.remove('hidden')
    renderFiles()
  }
}

function renderFiles() {
  const container = document.getElementById('files-container')!
  const countEl = document.getElementById('file-count')!
  const downloadBtn = document.getElementById('download-all-btn')!
  const startBtn = document.getElementById('start-btn')!

  const images = files.filter(f => f.type === 'image').length
  const videos = files.filter(f => f.type === 'video').length
  countEl.textContent = `${files.length} files (${images} images, ${videos} videos)`

  const allDone = files.length > 0 && files.every(f => f.status === 'done')
  downloadBtn.classList.toggle('hidden', !allDone)
  startBtn.classList.toggle('hidden', isProcessing || allDone)

  container.innerHTML = files.map((f, i) => `
    <div class="file-item ${f.status}">
      <span class="file-type ${f.type}">${f.type === 'image' ? '🖼' : '🎬'}</span>
      <span class="file-name">${f.name}</span>
      <span class="file-arrow">→</span>
      <span class="file-output">${f.outputName || (f.type === 'image' ? f.name.replace(/\.[^.]+$/, '.webp') : f.name.replace(/\.[^.]+$/, '.webm'))}</span>
      <div class="file-status">
        ${f.status === 'pending' ? '<span class="status-pending">Pending</span>' : ''}
        ${f.status === 'processing' ? `<div class="mini-progress"><div class="mini-progress-bar" style="width: ${f.progress}%"></div></div>` : ''}
        ${f.status === 'done' ? '<span class="status-done">✓</span>' : ''}
        ${f.status === 'error' ? `<span class="status-error" title="${f.error}">✗</span>` : ''}
      </div>
      ${f.status === 'done' && f.outputBlob ? `<button class="btn-download" data-index="${i}">↓</button>` : ''}
    </div>
  `).join('')

  container.querySelectorAll('.btn-download').forEach(btn => {
    btn.addEventListener('click', () => {
      const index = parseInt((btn as HTMLElement).dataset.index!)
      downloadFile(files[index])
    })
  })
}

async function loadFFmpeg() {
  if (ffmpeg) return ffmpeg

  const loading = document.getElementById('loading-ffmpeg')!
  loading.classList.remove('hidden')

  try {
    ffmpeg = new FFmpeg()

    ffmpeg.on('log', ({ message }) => {
      console.log('[ffmpeg]', message)
    })

    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm'
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    })

    loading.classList.add('hidden')
    return ffmpeg
  } catch (err) {
    console.error('FFmpeg load error:', err)
    loading.classList.add('hidden')
    throw err
  }
}

async function startConversion() {
  if (isProcessing) return
  isProcessing = true

  const startBtn = document.getElementById('start-btn')!
  startBtn.classList.add('hidden')

  try {
    await loadFFmpeg()
  } catch (err) {
    alert('Failed to load FFmpeg. Please try again.')
    isProcessing = false
    startBtn.classList.remove('hidden')
    return
  }

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    if (file.status !== 'pending') continue

    file.status = 'processing'
    file.progress = 0
    renderFiles()

    try {
      await convertFile(file)
      file.status = 'done'
    } catch (err) {
      file.status = 'error'
      file.error = err instanceof Error ? err.message : 'Conversion failed'
      console.error('Conversion error:', err)
    }

    renderFiles()
  }

  isProcessing = false
  renderFiles()
}

async function convertFile(item: FileItem) {
  if (!ffmpeg) throw new Error('FFmpeg not loaded')

  const inputName = 'input_' + item.file.name.replace(/[^a-zA-Z0-9.]/g, '_')
  const outputExt = item.type === 'image' ? '.webp' : '.webm'
  const outputName = item.name.replace(/\.[^.]+$/, outputExt)
  const outputFileName = 'output' + outputExt

  item.outputName = outputName

  const fileData = await fetchFile(item.file)
  await ffmpeg.writeFile(inputName, fileData)

  ffmpeg.on('progress', ({ progress }) => {
    item.progress = Math.round(progress * 100)
    renderFiles()
  })

  let args: string[]
  if (item.type === 'image') {
    args = ['-i', inputName, '-q:v', '80', outputFileName]
  } else {
    args = [
      '-i', inputName,
      '-c:v', 'libvpx-vp9',
      '-crf', '30',
      '-b:v', '0',
      '-c:a', 'libopus',
      '-b:a', '128k',
      outputFileName
    ]
  }

  await ffmpeg.exec(args)

  const data = await ffmpeg.readFile(outputFileName)
  const mimeType = item.type === 'image' ? 'image/webp' : 'video/webm'
  const blobData = data instanceof Uint8Array ? new Uint8Array(data) : data
  item.outputBlob = new Blob([blobData], { type: mimeType })

  // Cleanup
  await ffmpeg.deleteFile(inputName)
  await ffmpeg.deleteFile(outputFileName)
}

function downloadFile(item: FileItem) {
  if (!item.outputBlob || !item.outputName) return
  const a = document.createElement('a')
  a.href = URL.createObjectURL(item.outputBlob)
  a.download = item.outputName
  a.click()
  URL.revokeObjectURL(a.href)
}

async function downloadAll() {
  for (const file of files) {
    if (file.status === 'done' && file.outputBlob) {
      downloadFile(file)
      await new Promise(r => setTimeout(r, 200))
    }
  }
}
