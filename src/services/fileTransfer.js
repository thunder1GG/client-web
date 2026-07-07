import axios from 'axios'
import SparkMD5 from 'spark-md5'
import { getBaseURL } from '../store/settings'

const api = axios.create({
	timeout: 120000
})

api.interceptors.request.use((config) => {
	const base = getBaseURL()
	if (base) config.baseURL = base
	else delete config.baseURL
	return config
})

// ===== 上传：分片断点续传 =====
let uploadController = { paused: false, cancelTokenSource: null }

export async function computeFileMd5(file) {
	return new Promise((resolve, reject) => {
		const chunkSize = 2 * 1024 * 1024
		const chunks = Math.ceil(file.size / chunkSize)
		let currentChunk = 0
		const spark = new SparkMD5.ArrayBuffer()
		const fileReader = new FileReader()

		fileReader.onload = function (e) {
			spark.append(e.target.result)
			currentChunk++
			if (currentChunk < chunks) {
				loadNext()
			} else {
				resolve(spark.end())
			}
		}

		fileReader.onerror = function () {
			reject(new Error('计算文件MD5失败'))
		}

		function loadNext() {
			const start = currentChunk * chunkSize
			const end = Math.min(start + chunkSize, file.size)
			fileReader.readAsArrayBuffer(file.slice(start, end))
		}

		loadNext()
	})
}

export async function uploadFileInChunks({ file, fileMd5, chunkSize = 2 * 1024 * 1024, onProgress, onSession, onPause, onResume, overrideFileName, originalFileName }) {
	uploadController.paused = false
	uploadController.cancelTokenSource?.cancel('restart')
	uploadController.cancelTokenSource = axios.CancelToken.source()

	// 1) 初始化上传会话，获取sessionId和已上传的字节数
	const initResp = await api.post('/api/upload/init', { filename: overrideFileName || file.name, originalFilename: originalFileName, size: file.size, md5: fileMd5, chunkSize })
	const { sessionId, uploadedBytes = 0 } = initResp.data
	onSession?.(sessionId)

	let offset = uploadedBytes
	const total = file.size
	let lastReported = 0

	while (offset < total) {
		if (uploadController.paused) {
			onPause?.()
			await waitUntilResumed()
			onResume?.()
		}
		const end = Math.min(offset + chunkSize, total)
		const chunk = file.slice(offset, end)
		const headers = {
			'Content-Range': `bytes ${offset}-${end - 1}/${total}`,
			'X-Upload-Session': sessionId,
			'Content-Type': 'application/octet-stream'
		}
		await api.put('/api/upload/chunk', chunk, {
			headers,
			cancelToken: uploadController.cancelTokenSource.token,
			onUploadProgress: (e) => {
				const loaded = Math.min(end, offset + e.loaded)
				const percent = Math.floor((loaded / total) * 100)
				if (percent !== lastReported) {
					lastReported = percent
					onProgress?.(percent)
				}
			}
		})
		offset = end
		onProgress?.(Math.floor((offset / total) * 100))
	}

	await api.post('/api/upload/complete', { sessionId })
	return { sessionId, alreadyUploadedBytes: uploadedBytes }
}

// 新增：完成目录上传后，请求后端创建ZIP压缩包
export async function completeDirectoryUpload(sessionIds) {
	const resp = await api.post('/api/upload/complete-directory', { sessionIds })
	return resp.data // { status: 'processing'|'done', fileName, size, downloadUrl }
}

uploadFileInChunks.pause = function () {
	uploadController.paused = true
}

uploadFileInChunks.resume = function () {
	uploadController.paused = false
}

function waitUntilResumed() {
	return new Promise((resolve) => {
		const timer = setInterval(() => {
			if (!uploadController.paused) {
				clearInterval(timer)
				resolve()
			}
		}, 200)
	})
}

// ===== 轮询处理状态 =====
export async function queryProcessStatus(sessionId) {
	const resp = await api.get('/api/process/status', { params: { sessionId } })
	return resp.data // { status: 'processing'|'done'|'queued', fileName, size, downloadUrl }
}

// ===== 下载：断点续传 =====
let downloadController = { paused: false, currentOffset: 0, contentLength: 0, receivedChunks: [], fileName: '' }

export async function downloadWithResume({ url, fileName, onProgress, onPause, onResume }) {
	downloadController.paused = false
	downloadController.currentOffset = 0
	downloadController.receivedChunks = []
	downloadController.fileName = fileName

	// 先获取文件大小
	const head = await api.head(url)
	const totalSize = Number(head.headers['content-length'] || 0)
	downloadController.contentLength = totalSize

	while (downloadController.currentOffset < totalSize) {
		if (downloadController.paused) {
			onPause?.()
			await waitUntilDownloadResumed()
			onResume?.()
		}
		const end = Math.min(downloadController.currentOffset + 2 * 1024 * 1024 - 1, totalSize - 1)
		const resp = await api.get(url, {
			responseType: 'arraybuffer',
			headers: { Range: `bytes=${downloadController.currentOffset}-${end}` }
		})
		downloadController.receivedChunks.push(resp.data)
		downloadController.currentOffset = end + 1
		onProgress?.(Math.floor((downloadController.currentOffset / totalSize) * 100))
	}

	const blob = new Blob(downloadController.receivedChunks)
	triggerDownload(blob, downloadController.fileName)
}

downloadWithResume.pause = function () {
	downloadController.paused = true
}

downloadWithResume.resume = function () {
	downloadController.paused = false
}

function waitUntilDownloadResumed() {
	return new Promise((resolve) => {
		const timer = setInterval(() => {
			if (!downloadController.paused) {
				clearInterval(timer)
				resolve()
			}
		}, 200)
	})
}

function triggerDownload(blob, fileName) {
	const url = URL.createObjectURL(blob)
	const a = document.createElement('a')
	a.href = url
	a.download = fileName
	document.body.appendChild(a)
	a.click()
	setTimeout(() => {
		URL.revokeObjectURL(url)
		document.body.removeChild(a)
	}, 0)
}


