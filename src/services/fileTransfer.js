import SparkMD5 from 'spark-md5'
import { getBaseURL } from '../store/settings'

/** 根据当前通讯地址生成完整请求地址。 */
function resolveUrl(path, params) {
	const base = (getBaseURL() || '').replace(/\/+$/, '')
	const url = /^https?:\/\//i.test(path)
		? new URL(path)
		: new URL(`${base}${path}`, window.location.origin)
	for (const [key, value] of Object.entries(params || {})) url.searchParams.set(key, value)
	return url
}

/** 使用 fetch 发起带超时、取消和 HTTP 状态检查的请求。 */
async function request(path, { params, timeout = 120000, signal, ...options } = {}) {
	const controller = new AbortController()
	const abort = () => controller.abort(signal.reason)
	if (signal?.aborted) abort()
	else signal?.addEventListener('abort', abort, { once: true })
	const timer = setTimeout(() => controller.abort(new Error('请求超时')), timeout)
	try {
		const response = await fetch(resolveUrl(path, params), { ...options, signal: controller.signal })
		if (!response.ok) {
			const message = await response.text()
			throw new Error(`HTTP ${response.status}${message ? `: ${message}` : ''}`)
		}
		return response
	} finally {
		clearTimeout(timer)
		signal?.removeEventListener('abort', abort)
	}
}

// ===== 上传：分片断点续传 =====
let uploadController = { paused: false, abortController: null }

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
	uploadController.abortController?.abort(new Error('restart'))
	uploadController.abortController = new AbortController()
	const signal = uploadController.abortController.signal

	// 1) 初始化上传会话，获取sessionId和已上传的字节数
	const initResp = await request('/api/upload/init', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ filename: overrideFileName || file.name, originalFilename: originalFileName, size: file.size, md5: fileMd5, chunkSize }),
		signal
	})
	const { sessionId, uploadedBytes = 0 } = await initResp.json()
	onSession?.(sessionId)

	let offset = uploadedBytes
	const total = file.size

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
		await request('/api/upload/chunk', {
			method: 'PUT',
			headers,
			body: chunk,
			signal
		})
		offset = end
		onProgress?.(Math.floor((offset / total) * 100))
	}

	await request('/api/upload/complete', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ sessionId }),
		signal
	})
	return { sessionId, alreadyUploadedBytes: uploadedBytes }
}

// 新增：完成目录上传后，请求后端创建ZIP压缩包
export async function completeDirectoryUpload(sessionIds) {
	const resp = await request('/api/upload/complete-directory', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ sessionIds })
	})
	return resp.json() // { status: 'processing'|'done', fileName, size, downloadUrl }
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
	const resp = await request('/api/process/status', { params: { sessionId } })
	return resp.json() // { status: 'processing'|'done'|'queued', fileName, size, downloadUrl }
}

// ===== 下载：断点续传 =====
let downloadController = { paused: false, currentOffset: 0, contentLength: 0, receivedChunks: [], fileName: '' }

export async function downloadWithResume({ url, fileName, onProgress, onPause, onResume }) {
	downloadController.paused = false
	downloadController.currentOffset = 0
	downloadController.receivedChunks = []
	downloadController.fileName = fileName

	// 先获取文件大小
	const head = await request(url, { method: 'HEAD' })
	const totalSize = Number(head.headers.get('content-length') || 0)
	downloadController.contentLength = totalSize

	while (downloadController.currentOffset < totalSize) {
		if (downloadController.paused) {
			onPause?.()
			await waitUntilDownloadResumed()
			onResume?.()
		}
		const end = Math.min(downloadController.currentOffset + 2 * 1024 * 1024 - 1, totalSize - 1)
		const resp = await request(url, {
			headers: { Range: `bytes=${downloadController.currentOffset}-${end}` }
		})
		downloadController.receivedChunks.push(await resp.arrayBuffer())
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

