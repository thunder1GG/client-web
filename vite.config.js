import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
	plugins: [vue(), mockApiPlugin()],
	server: {
		host: true,
		port: 5173
	}
})

function mockApiPlugin() {
	const sessions = new Map()
	const processMap = new Map()
	return {
		name: 'mock-api-plugin',
		configureServer(server) {
			server.middlewares.use(async (req, res, next) => {
				if (!req.url?.startsWith('/api')) return next()
				res.setHeader('Access-Control-Allow-Origin', '*')
				res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Upload-Session, Content-Range')
				res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,HEAD,OPTIONS')
				if (req.method === 'OPTIONS') {
					res.statusCode = 204
					return res.end()
				}

				const readJson = async () => {
					const chunks = []
					for await (const chunk of req) chunks.push(Buffer.from(chunk))
					return JSON.parse(Buffer.concat(chunks).toString('utf-8') || '{}')
				}
				const readBuffer = async () => {
					const chunks = []
					for await (const chunk of req) chunks.push(Buffer.from(chunk))
					return Buffer.concat(chunks)
				}

				if (req.url === '/api/upload/init' && req.method === 'POST') {
					const body = await readJson()
					const sessionId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
					sessions.set(sessionId, { filename: body.filename, size: body.size, chunkSize: body.chunkSize, data: [], uploadedBytes: 0 })
					res.setHeader('Content-Type', 'application/json')
					return res.end(JSON.stringify({ sessionId, uploadedBytes: 0 }))
				}

				if (req.url === '/api/upload/chunk' && req.method === 'PUT') {
					const sessionId = req.headers['x-upload-session']
					if (!sessionId || !sessions.has(sessionId)) {
						res.statusCode = 400
						return res.end('invalid session')
					}
					const buf = await readBuffer()
					const meta = sessions.get(sessionId)
					meta.data.push(buf)
					meta.uploadedBytes += buf.length
					res.statusCode = 204
					return res.end()
				}

				if (req.url === '/api/upload/complete' && req.method === 'POST') {
					const body = await readJson()
					const { sessionId } = body
					if (!sessions.has(sessionId)) {
						res.statusCode = 400
						return res.end('invalid session')
					}
					processMap.set(sessionId, { status: 'processing' })
					setTimeout(() => {
						const meta = sessions.get(sessionId)
						const buffer = Buffer.concat(meta.data)
						processMap.set(sessionId, {
							status: 'done',
							fileName: `processed_${meta.filename || 'file.bin'}`,
							size: buffer.length,
							downloadUrl: `/api/download?sessionId=${sessionId}`,
							buffer
						})
					}, 1000)
					res.statusCode = 204
					return res.end()
				}

				if (req.url?.startsWith('/api/process/status') && req.method === 'GET') {
					const url = new URL(req.url, 'http://localhost')
					const sessionId = url.searchParams.get('sessionId')
					const info = processMap.get(sessionId)
					res.setHeader('Content-Type', 'application/json')
					return res.end(JSON.stringify(info || { status: 'queued' }))
				}

				if (req.url?.startsWith('/api/download')) {
					const urlObj = new URL(req.url, 'http://localhost')
					const sessionId = urlObj.searchParams.get('sessionId')
					const meta = processMap.get(sessionId)
					if (!meta || meta.status !== 'done') {
						res.statusCode = 404
						return res.end('not ready')
					}
					const buffer = meta.buffer
					const total = buffer.length
					if (req.method === 'HEAD') {
						res.setHeader('Content-Length', String(total))
						res.statusCode = 200
						return res.end()
					}
					if (req.method === 'GET') {
						const range = req.headers['range']
						if (range) {
							const match = /bytes=(\d+)-(\d+)?/.exec(range)
							const start = Number(match?.[1] || 0)
							const end = Number(match?.[2] ?? total - 1)
							const chunk = buffer.subarray(start, end + 1)
							res.statusCode = 206
							res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`)
							res.setHeader('Content-Length', String(chunk.length))
							res.setHeader('Content-Type', 'application/octet-stream')
							return res.end(chunk)
						}
						res.setHeader('Content-Type', 'application/octet-stream')
						res.setHeader('Content-Length', String(total))
						return res.end(buffer)
					}
				}

				return next()
			})
		}
	}
}


