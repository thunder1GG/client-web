<template>
	<div class="app-container">
		<el-card class="card" shadow="hover">
			<div class="header">
				<div class="title-section">
					<h2 class="title-gradient">Client Web工具</h2>
					<span class="subtitle">支持分片与断点续传的极速文件传输助手</span>
				</div>
				<div class="status-badge">
					<span class="pulse-dot"></span>
					在线已连接
				</div>
			</div>
			
			<el-tabs v-model="active" class="tabs">
				<el-tab-pane name="main">
					<template #label>
						<span class="tab-label">
							<i class="el-icon-upload"></i> 传输主页
						</span>
					</template>
					<div class="pane-scroll">
						<resumable-transfer />
					</div>
				</el-tab-pane>
				
				<el-tab-pane name="settings">
					<template #label>
						<span class="tab-label">
							<i class="el-icon-setting"></i> 参数设置
						</span>
					</template>
					<div class="pane-scroll">
						<settings-panel />
					</div>
				</el-tab-pane>
			</el-tabs>
		</el-card>
	</div>
</template>

<script setup>
import { ref } from 'vue'
import ResumableTransfer from './components/ResumableTransfer.vue'
import SettingsPanel from './components/SettingsPanel.vue'

const active = ref('main')
</script>

<style scoped>
.app-container {
	min-height: 100vh;
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 24px;
	box-sizing: border-box;
}

.card {
	width: 100%;
	max-width: 900px;
	height: 80vh;
	min-height: 580px;
	max-height: 780px;
	display: flex;
	flex-direction: column;
	overflow: hidden;
}

:deep(.el-card__body) {
	height: 100%;
	padding: 24px;
	display: flex;
	flex-direction: column;
	box-sizing: border-box;
	min-height: 0;
}

.header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 16px;
	margin-bottom: 20px;
}

.title-section {
	display: flex;
	flex-direction: column;
	gap: 4px;
}

h2.title-gradient {
	margin: 0;
	font-size: clamp(20px, 2.5vw, 24px);
	font-weight: 700;
	background: var(--primary-gradient);
	-webkit-background-clip: text;
	-webkit-text-fill-color: transparent;
	letter-spacing: -0.5px;
}

.subtitle {
	font-size: 12px;
	color: var(--el-text-color-secondary);
}

.status-badge {
	display: flex;
	align-items: center;
	gap: 8px;
	font-size: 12px;
	background: rgba(16, 185, 129, 0.1);
	border: 1px solid rgba(16, 185, 129, 0.2);
	color: #34d399;
	padding: 4px 10px;
	border-radius: 99px;
	font-weight: 500;
}

.pulse-dot {
	width: 6px;
	height: 6px;
	background: #10b981;
	border-radius: 50%;
	box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7);
	animation: pulse 1.6s infinite;
}

@keyframes pulse {
	0% {
		transform: scale(0.95);
		box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7);
	}
	70% {
		transform: scale(1);
		box-shadow: 0 0 0 6px rgba(16, 185, 129, 0);
	}
	100% {
		transform: scale(0.95);
		box-shadow: 0 0 0 0 rgba(16, 185, 129, 0);
	}
}

.tabs {
	flex: 1;
	display: flex;
	flex-direction: column;
	min-height: 0;
}

:deep(.el-tabs__header) {
	margin-bottom: 20px !important;
}

:deep(.el-tabs__content) {
	flex: 1;
	display: flex;
	min-height: 0;
}

:deep(.el-tab-pane) {
	flex: 1;
	display: flex;
}

.pane-scroll {
	flex: 1;
	overflow-y: auto;
	overflow-x: hidden;
	padding-right: 4px;
}

.tab-label {
	display: flex;
	align-items: center;
	gap: 6px;
}

/* 移动端深度适配 */
@media (max-width: 768px) {
	.app-container {
		padding: 0;
	}

	.card {
		height: 100vh;
		min-height: 100vh;
		max-height: 100vh;
		border-radius: 0 !important;
		border: none !important;
		box-shadow: none !important;
	}

	:deep(.el-card__body) {
		padding: 16px;
	}

	.header {
		margin-bottom: 16px;
	}

	.status-badge {
		padding: 3px 8px;
		font-size: 11px;
	}
}
</style>


