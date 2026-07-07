import { computed, reactive, watch } from 'vue'

const STORAGE_KEY = 'app_settings_v1'

const saved = (() => {
	try {
		return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
	} catch (e) {
		return {}
	}
})()

export const settings = reactive({
	baseUrl: saved.baseUrl ?? saved.customBaseUrl ?? '/'
})

export const baseURL = computed(() => (settings.baseUrl || '').trim())

watch(
	() => ({ baseUrl: settings.baseUrl }),
	(val) => {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(val))
	},
	{ deep: true }
)

/** 更新并持久化通讯地址。 */
export function setBaseUrl(url) {
	settings.baseUrl = url
}

export function getBaseURL() {
	return baseURL.value || ''
}

