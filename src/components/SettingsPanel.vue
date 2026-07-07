<template>
	<div class="settings-root">
		<el-form label-position="top" :model="form" class="settings-form">
			<el-form-item label="通讯地址" class="form-item">
				<el-input 
					v-model="form.baseUrl" 
					placeholder="例如：http://localhost:7780 或 /（使用相对路径）" 
					clearable
				/>
				<div class="input-tip">
					本地址为 API 请求的 baseURL。留空或填入 <code>/</code> 将默认请求当前浏览器部署域名。
				</div>
			</el-form-item>
			
			<div class="effective-address-card">
				<span class="eff-label">当前生效地址</span>
				<code class="eff-val">{{ effectiveBase }}</code>
			</div>

			<el-form-item class="actions-item">
				<div class="btn-group">
					<el-button type="primary" class="btn-primary" @click="save">保存设置</el-button>
					<el-button :loading="testing" class="btn-test" @click="testNetwork">测试网络</el-button>
					<el-button class="btn-reset" @click="reset">重置</el-button>
				</div>
			</el-form-item>
		</el-form>
	</div>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { settings, setBaseUrl, baseURL } from '../store/settings'

const form = reactive({
	baseUrl: settings.baseUrl
})
const testing = ref(false)

const effectiveBase = computed(() => baseURL.value || '(空，使用相对路径)')

function save() {
	setBaseUrl(form.baseUrl)
	ElMessage.success('设置已保存并立即生效')
}

function reset() {
	form.baseUrl = settings.baseUrl
}

/** 测试当前输入的通讯地址能否访问服务端只读接口。 */
async function testNetwork() {
	testing.value = true
	try {
		const base = (form.baseUrl.trim() || '/').replace(/\/+$/, '')
		const url = new URL(`${base}/api/process/status`, window.location.origin)
		url.searchParams.set('sessionId', 'network-test')
		const response = await fetch(url, { signal: AbortSignal.timeout(5000) })
		if (!response.ok) throw new Error(`HTTP ${response.status}`)
		ElMessage.success('网络连接成功，服务端响应正常')
	} catch (error) {
		ElMessage.error(`网络连接失败：${error.message}`)
	} finally {
		testing.value = false
	}
}
</script>

<style scoped>
.settings-root {
	padding: 12px 4px;
}

.settings-form {
	display: flex;
	flex-direction: column;
	gap: 16px;
}

.form-item :deep(.el-form-item__label) {
	font-weight: 600 !important;
	color: var(--el-text-color-primary) !important;
	padding-bottom: 6px !important;
}

.input-tip {
	margin-top: 8px;
	font-size: 12px;
	color: var(--el-text-color-secondary);
	line-height: 1.4;
}

.input-tip code {
	background: var(--code-bg);
	padding: 2px 4px;
	border-radius: 4px;
	color: var(--tip-code-color);
}

/* 浮动地址显示卡片 */
.effective-address-card {
	background: var(--card-bg-subtle);
	border: 1px solid var(--border-subtle);
	padding: 14px 16px;
	border-radius: 12px;
	display: flex;
	justify-content: space-between;
	align-items: center;
	gap: 12px;
	flex-wrap: wrap;
	margin-bottom: 8px;
}

.eff-label {
	font-size: 13px;
	color: var(--el-text-color-secondary);
	font-weight: 500;
}

.eff-val {
	font-family: monospace;
	font-size: 13px;
	background: rgba(99, 102, 241, 0.08);
	color: var(--tip-code-color);
	padding: 4px 10px;
	border-radius: 6px;
	border: 1px solid rgba(99, 102, 241, 0.15);
	word-break: break-all;
}

.actions-item {
	margin-top: 8px;
	margin-bottom: 0;
}

.btn-group {
	display: flex;
	gap: 10px;
	flex-wrap: wrap;
	width: 100%;
}

.btn-primary {
	min-width: 100px;
}

/* 响应式适配 */
@media (max-width: 576px) {
	.effective-address-card {
		flex-direction: column;
		align-items: flex-start;
		gap: 6px;
	}

	.btn-group {
		flex-direction: column;
		align-items: stretch;
	}

	.btn-group .el-button {
		width: 100%;
		margin-left: 0 !important;
	}
}
</style>
