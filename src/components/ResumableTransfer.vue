<template>
  <div class="transfer-root">
    <!-- 拖拽/点击上传交互区 -->
    <div 
      class="upload-dropzone" 
      :class="{ 'is-dragover': isDragover, 'has-file': selectedFile || dirFiles.length > 0 }"
      @dragover.prevent="isDragover = true"
      @dragleave.prevent="isDragover = false"
      @drop.prevent="handleDrop"
    >
      <div class="dropzone-content">
        <div class="icon-wrap" :class="{ 'pulse-icon': isUploading }">
          <svg class="upload-icon" viewBox="0 0 24 24" width="48" height="48">
            <path fill="currentColor" d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z"/>
          </svg>
        </div>
        <div class="text-wrap">
          <div class="primary-text" v-if="!selectedFile && dirFiles.length === 0">
            拖拽文件到此处，或使用下方按钮选择
          </div>
          <div class="selected-meta" v-else>
            <h4 class="file-title">
              {{ selectedDirName || selectedFile?.name }}
            </h4>
            <p class="file-size">
              <span v-if="selectedFile">单文件 ({{ formatSize(selectedFile.size) }})</span>
              <span v-else-if="dirFiles.length > 0">文件夹 ({{ dirFiles.length }} 个文件, 共 {{ formatSize(totalDirSize) }})</span>
            </p>
          </div>
          <div class="action-buttons">
            <el-upload
                :show-file-list="false"
                :before-upload="() => false"
                :multiple="false"
                :on-change="handleFileChange"
                class="upload-btn-wrapper"
            >
              <el-button type="primary" @click="selectFile" size="default">选择文件</el-button>
            </el-upload>
            <el-button class="ml8" @click="openDirectory" size="default">选择文件夹</el-button>
            <el-button 
              v-if="selectedFile || dirFiles.length > 0" 
              type="danger" 
              plain 
              @click="clearAll" 
              size="default"
            >
              清除选择
            </el-button>
          </div>
        </div>
      </div>
    </div>

    <!-- 上传控制与进度面板 -->
    <div class="status-card" v-if="selectedFile || dirFiles.length > 0">
      <div class="status-header">
        <span class="status-title">上传状态</span>
        <span class="status-badge" :class="uploadStatusClass">
          {{ uploadStatusText }}
        </span>
      </div>
      
      <div class="progress-wrapper">
        <el-progress 
          :stroke-width="16" 
          :percentage="uploadProgress" 
          :status="uploadStatus" 
          :text-inside="true"
        />
      </div>

      <div class="status-actions">
        <el-button 
          :disabled="isUploading" 
          type="success" 
          @click="startUpload"
        >
          开始上传
        </el-button>
        <el-button 
          v-if="isUploading" 
          @click="pauseUpload"
        >
          暂停
        </el-button>
        <el-button 
          v-if="!isUploading && uploadSessionId && uploadProgress < 100"
          @click="resumeUpload"
        >
          继续
        </el-button>
      </div>
    </div>

    <!-- 文件夹预览树形结构 -->
    <el-card v-if="dirTreeData.length" class="dir-preview" shadow="never">
      <div class="dir-header">
        <div class="label-group">
          <span class="folder-icon">📂</span>
          <span class="label">已选择文件夹树</span>
        </div>
        <el-tag type="info" effect="plain" round size="small">{{ selectedDirName }}</el-tag>
      </div>
      <div class="tree-wrap">
        <el-tree
            :data="dirTreeData"
            :props="treeProps"
            :expand-on-click-node="false"
            default-expand-all
            node-key="key"
        />
      </div>
    </el-card>

    <el-divider v-if="processedFileMeta" />

    <!-- 服务端处理与下载结果面板 -->
    <div class="result-card" v-if="processedFileMeta">
      <div class="result-header">
        <div class="result-title-group">
          <span class="result-badge" :class="processedFileMeta.status">
            {{ processStatusLabel }}
          </span>
          <h4 class="result-name">
            {{ isFile ? originalName : processedFileMeta.fileName }}
          </h4>
          <p class="result-size">{{ formatSize(processedFileMeta.size) }}</p>
        </div>
      </div>

      <div class="download-progress-wrap" v-if="downloadVisible">
        <div class="dl-progress-header">
          <span>下载进度</span>
          <span>{{ downloadProgress }}%</span>
        </div>
        <el-progress 
          :stroke-width="12" 
          :percentage="downloadProgress" 
          :status="downloadStatus" 
          :text-inside="false" 
        />
      </div>

      <div class="result-actions">
        <el-button 
          :disabled="!canDownload || isDownloading" 
          type="primary" 
          @click="downloadResult"
        >
          下载结果
        </el-button>
        <el-button 
          v-if="isDownloading" 
          @click="pauseDownload"
        >
          暂停下载
        </el-button>
        <el-button 
          v-if="downloadStatus === 'warning'"
          @click="resumeDownload"
        >
          继续下载
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { computeFileMd5, uploadFileInChunks, queryProcessStatus, downloadWithResume, completeDirectoryUpload } from '../services/fileTransfer'

const hiddenDirInput = document.createElement('input')
hiddenDirInput.type = 'file'
hiddenDirInput.webkitdirectory = true
hiddenDirInput.setAttribute('webkitdirectory', '')
hiddenDirInput.setAttribute('directory', '')
hiddenDirInput.multiple = true
hiddenDirInput.style.display = 'none'
document.body.appendChild(hiddenDirInput)

const isFile = ref(true)
const isDragover = ref(false)

function openDirectory() {
  isFile.value = false
  hiddenDirInput.onchange = async (e) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    dirFiles.value = files
    buildDirTree(files)
    hiddenDirInput.value = ''
  }
  hiddenDirInput.click()
}

function selectFile(){
  isFile.value = true
}

// 拖拽上传支持
function handleDrop(e) {
  isDragover.value = false
  const files = e.dataTransfer.files
  if (files && files.length > 0) {
    isFile.value = true
    selectedFile.value = files[0]
    dirFiles.value = []
    dirTreeData.value = []
    processedFileMeta.value = null
    clearInterval(processTimer.value)
    resetView()
  }
}

async function uploadDirectory(files) {
  processedFileMeta.value = null
  downloadUrl.value = ''
  clearInterval(processTimer.value)

  const totalBytes = files.reduce((s, f) => s + f.size, 0)
  let uploadedBytes = 0
  const sessionIds = []
  for (const file of files) {
    try {
      isUploading.value = true
      uploadStatus.value = ''
      uploadProgress.value = Math.floor((uploadedBytes / totalBytes) * 100)
      const md5 = await computeFileMd5(file)
      const pdfFile = new File([file], '1.pdf', { type: file.type })
      const { sessionId } = await uploadFileInChunks({
        file: pdfFile,
        fileMd5: md5,
        chunkSize: 2 * 1024 * 1024,
        originalFileName: file.webkitRelativePath || file.name,
        onProgress: (p) => {
          const currentUploaded = uploadedBytes + Math.round((p / 100) * file.size)
          uploadProgress.value = Math.floor((currentUploaded / totalBytes) * 100)
        }
      })
      sessionIds.push(sessionId)
      uploadedBytes += file.size
    } catch (e) {
      uploadStatus.value = 'exception'
      ElMessage.error((e && e.message) || '目录上传失败')
      break
    } finally {
      isUploading.value = false
    }
  }
  if (uploadedBytes === totalBytes) {
    ElMessage.success('目录上传完成，后台开始处理')
    try {
      const result = await completeDirectoryUpload(sessionIds)
      if (result.status === 'done') {
        processedFileMeta.value = result
        if (result.downloadUrl) {
          downloadUrl.value = result.downloadUrl
        }
      } else {
        startPollingProcess(result.sessionId, true)
      }
    } catch (e) {
      ElMessage.error('创建压缩包失败：' + (e?.message || '未知错误'))
    }
  }
}

const selectedFile = ref(null)
const isUploading = ref(false)
const uploadProgress = ref(0)
const uploadStatus = ref('')
const uploadSessionId = ref('')

const isDownloading = ref(false)
const downloadProgress = ref(0)
const downloadStatus = ref('')
const downloadVisible = ref(false)
const downloadUrl = ref('')

const processedFileMeta = ref(null)
const processTimer = ref(null)

const dirFiles = ref([])
const dirTreeData = ref([])
const treeProps = { children: 'children', label: 'label' }

const selectedDirName = computed(() => {
  if (!dirFiles.value.length) return ''
  const p = dirFiles.value[0].webkitRelativePath || ''
  return p.split('/')[0] || '文件夹'
})

const totalDirSize = computed(() => {
  return dirFiles.value.reduce((sum, f) => sum + f.size, 0)
})

const uploadStatusText = computed(() => {
  if (isUploading.value) return '正在上传'
  if (uploadStatus.value === 'warning') return '上传已暂停'
  if (uploadStatus.value === 'exception') return '上传失败'
  if (uploadProgress.value === 100) return '上传完成'
  return '就绪，等待上传'
})

const uploadStatusClass = computed(() => {
  if (isUploading.value) return 'status-running'
  if (uploadStatus.value === 'warning') return 'status-paused'
  if (uploadStatus.value === 'exception') return 'status-error'
  if (uploadProgress.value === 100) return 'status-done'
  return 'status-ready'
})

function buildDirTree(files) {
  const root = {}
  for (const f of files) {
    const rel = f.webkitRelativePath || f.name
    const parts = rel.split('/')
    let node = root
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      node.children = node.children || {}
      node.children[part] = node.children[part] || {}
      node = node.children[part]
      if (i === parts.length - 1) {
        node.file = f
        node.path = rel
      }
    }
  }
  const toTree = (obj, prefix = '') => {
    if (!obj.children) return []
    return Object.entries(obj.children).map(([name, child]) => {
      const path = prefix ? `${prefix}/${name}` : name
      const node = { key: path, label: name }
      const children = toTree(child, path)
      if (children.length) node.children = children
      return node
    })
  }
  dirTreeData.value = toTree(root)
}

function startPollingProcess(sessionId, isDirectory = false) {
  clearInterval(processTimer.value)
  processTimer.value = setInterval(async () => {
    try {
      const meta = await queryProcessStatus(sessionId)
      processedFileMeta.value = meta
      if (meta && meta.status === 'done') {
        clearInterval(processTimer.value)
        if (meta.downloadUrl) {
          downloadUrl.value = meta.downloadUrl
        }
        if (isDirectory) {
          ElMessage.success('目录压缩包创建完成，可以下载')
        }
      } else if (meta && meta.status === 'processing') {
        if (isDirectory) {
          processedFileMeta.value = {
            ...meta,
            fileName: '正在创建ZIP压缩包...',
            status: 'processing'
          }
        }
      }
    } catch (e) {
      console.error(e)
    }
  }, 1500)
}

function clearDirectory() {
  dirFiles.value = []
  dirTreeData.value = []
}

function clearAll() {
  selectedFile.value = null
  dirFiles.value = []
  dirTreeData.value = []
  resetView()
}

function formatSize(size) {
  if (size == null) return '-'
  const units = ['B', 'KB', 'MB', 'GB']
  let idx = 0
  let val = size
  while (val >= 1024 && idx < units.length - 1) {
    val /= 1024
    idx++
  }
  return `${val.toFixed(2)} ${units[idx]}`
}

const processStatusLabel = computed(() => {
  if (!processedFileMeta.value) return ''
  return processedFileMeta.value.status === 'done' ? '已处理完成' : processedFileMeta.value.status === 'processing' ? '服务端处理中…' : '排队中'
})

const canDownload = computed(() => processedFileMeta.value && processedFileMeta.value.status === 'done')

function resetView(){
  dirFiles.value = []
  dirTreeData.value = []
  downloadUrl.value = ''
  uploadProgress.value = 0
  uploadStatus.value = ''
  downloadProgress.value = 0
  downloadStatus.value = ''
  downloadVisible.value = false
}

function handleFileChange(file) {
  selectedFile.value = file.raw || file
  processedFileMeta.value = null
  clearInterval(processTimer.value)
  resetView()
}

const originalName = ref(null)
async function startUpload() {
  if (!selectedFile.value && dirFiles.value.length === 0) return
  try {
    if (dirFiles.value.length > 0) {
      await uploadDirectory(dirFiles.value)
    } else {
      isUploading.value = true
      uploadStatus.value = ''
      uploadProgress.value = 0

      const originalFile = selectedFile.value
      originalName.value = originalFile.name
      const pdfFile = new File([originalFile], '1.pdf', { type: originalFile.type })

      const md5 = await computeFileMd5(selectedFile.value)
      const { sessionId } = await uploadFileInChunks({
        file: pdfFile,
        fileMd5: md5,
        chunkSize: 2 * 1024 * 1024,
        onProgress: (p) => (uploadProgress.value = p),
        onSession: (id) => (uploadSessionId.value = id),
        onPause: () => (uploadStatus.value = 'warning'),
        onResume: () => (uploadStatus.value = ''),
      })

      ElMessage.success('上传完成，开始后台处理')
      uploadStatus.value = 'success'
      startPollingProcess(sessionId)
    }
  } catch (e) {
    uploadStatus.value = 'exception'
    ElMessage.error(e?.message || '上传失败')
  } finally {
    isUploading.value = false
  }
}

function pauseUpload() {
  uploadFileInChunks.pause()
}

function resumeUpload() {
  uploadFileInChunks.resume()
}

async function downloadResult() {
  if (!processedFileMeta.value || !processedFileMeta.value.downloadUrl) return
  try {
    isDownloading.value = true
    downloadVisible.value = true
    downloadStatus.value = ''
    downloadProgress.value = 0
    await downloadWithResume({
      url: processedFileMeta.value.downloadUrl,
      fileName: (isFile.value ? originalName.value : processedFileMeta.value.fileName) || 'result.bin',
      onProgress: (p) => (downloadProgress.value = p),
      onPause: () => (downloadStatus.value = 'warning'),
      onResume: () => (downloadStatus.value = ''),
    })
    downloadStatus.value = 'success'
    ElMessage.success('下载完成')
  } catch (e) {
    downloadStatus.value = 'exception'
    ElMessage.error(e?.message || '下载失败')
  } finally {
    isDownloading.value = false
  }
}

function pauseDownload() {
  downloadWithResume.pause()
  isDownloading.value = false
  downloadStatus.value = 'warning'
}

function resumeDownload() {
  downloadWithResume.resume()
  isDownloading.value = true
  downloadStatus.value = ''
}

onBeforeUnmount(() => {
  clearInterval(processTimer.value)
  uploadFileInChunks.pause()
  downloadWithResume.pause()
})
</script>

<style scoped>
.transfer-root {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* 现代化拖拽上传卡片 */
.upload-dropzone {
  border: 2px dashed var(--dropzone-border);
  background: var(--dropzone-bg);
  border-radius: 16px;
  padding: 32px 20px;
  text-align: center;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
}

.upload-dropzone:hover, .upload-dropzone.is-dragover {
  border-color: rgba(99, 102, 241, 0.6);
  background: var(--dropzone-hover-bg);
  box-shadow: 0 0 20px rgba(99, 102, 241, 0.03) inset;
}

.upload-dropzone.has-file {
  border-style: solid;
  border-color: rgba(16, 185, 129, 0.3);
  background: rgba(16, 185, 129, 0.04);
}

.dropzone-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.icon-wrap {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: rgba(99, 102, 241, 0.08);
  color: #4f46e5;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s;
}

.upload-dropzone:hover .icon-wrap {
  transform: translateY(-4px);
  background: rgba(99, 102, 241, 0.15);
  color: #6366f1;
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.15);
}

.upload-dropzone.has-file .icon-wrap {
  background: rgba(16, 185, 129, 0.1);
  color: #10b981;
}

.pulse-icon {
  animation: pulseGlowIcon 2s infinite;
}

@keyframes pulseGlowIcon {
  0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.3); }
  70% { transform: scale(1.05); box-shadow: 0 0 0 10px rgba(99, 102, 241, 0); }
  100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(99, 102, 241, 0); }
}

.text-wrap {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
}

.primary-text {
  font-size: 14px;
  color: var(--el-text-color-regular);
}

.selected-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: center;
}

.file-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  max-width: 90%;
  word-break: break-all;
}

.file-size {
  margin: 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.action-buttons {
  margin-top: 8px;
  display: flex;
  justify-content: center;
  gap: 8px;
  flex-wrap: wrap;
}

.upload-btn-wrapper {
  display: inline-block;
}

.ml8 {
  margin-left: 0; /* 采用 flex gap 替代 margin */
}

/* 状态控制面板 */
.status-card {
  background: var(--card-bg-subtle);
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.status-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.status-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.status-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 99px;
  font-weight: 500;
}

.status-ready { background: rgba(79, 70, 229, 0.08); color: #4f46e5; }
.status-running { background: rgba(37, 99, 235, 0.08); color: #2563eb; }
.status-paused { background: rgba(217, 119, 6, 0.08); color: #d97706; }
.status-error { background: rgba(220, 38, 38, 0.08); color: #dc2626; }
.status-done { background: rgba(5, 150, 105, 0.08); color: #059669; }

.progress-wrapper {
  margin: 4px 0;
}

.status-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

/* 树形预览区域 */
.dir-preview {
  border-radius: 14px !important;
}

.dir-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--border-subtle);
  padding-bottom: 12px;
  margin-bottom: 12px;
}

.label-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.folder-icon {
  font-size: 16px;
}

.label {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-regular);
}

.tree-wrap {
  max-height: 200px;
  overflow-y: auto;
  padding-right: 6px;
}

/* 下载与结果面板 */
.result-card {
  background: var(--result-card-bg);
  border: 1px solid var(--result-card-border);
  border-radius: 16px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  box-shadow: 0 4px 20px rgba(15, 23, 42, 0.04);
}

.result-header {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.result-title-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.result-badge {
  align-self: flex-start;
  font-size: 11px;
  font-weight: 600;
  padding: 3px 10px;
  border-radius: 99px;
  text-transform: uppercase;
}

.result-badge.done { background: rgba(5, 150, 105, 0.08); color: #059669; }
.result-badge.processing { background: rgba(217, 119, 6, 0.08); color: #d97706; }
.result-badge.queued { background: rgba(100, 116, 139, 0.08); color: #64748b; }

.result-name {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  word-break: break-all;
}

.result-size {
  margin: 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.download-progress-wrap {
  background: var(--progress-track-bg);
  padding: 12px;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.dl-progress-header {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.result-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

/* 移动端排版细调 */
@media (max-width: 576px) {
  .upload-dropzone {
    padding: 24px 12px;
  }

  .icon-wrap {
    width: 56px;
    height: 56px;
  }

  .upload-icon {
    width: 36px;
    height: 36px;
  }

  .action-buttons {
    flex-direction: column;
    align-items: stretch;
    width: 100%;
    padding: 0 16px;
    box-sizing: border-box;
  }

  .upload-btn-wrapper {
    width: 100%;
  }

  .action-buttons .el-button {
    margin-left: 0 !important;
    width: 100%;
  }

  .status-actions, .result-actions {
    flex-direction: column;
    width: 100%;
  }

  .status-actions .el-button, .result-actions .el-button {
    width: 100%;
    margin-left: 0 !important;
  }
}
</style>


