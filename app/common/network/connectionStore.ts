import { create } from "zustand";

export type ConnectionStatus =
	| "checking"
	| "online"
	| "offline"
	| "unreachable"
	| "recovered";

interface ConnectionState {
	status: ConnectionStatus;
	lastProbeAt: number;
	setStatus: (status: ConnectionStatus) => void;
	setProbeResult: (status: ConnectionStatus, checkedAt: number) => void;
}

export const HEALTHY_PROBE_INTERVAL = 5 * 60 * 1000;
export const UNHEALTHY_PROBE_INTERVAL = 60 * 1000;
const FAILURE_PROBE_MIN_INTERVAL = 30 * 1000;
const PING_TIMEOUT = 5 * 1000;
const RECOVERED_VISIBLE_TIME = 3 * 1000;

export const useConnectionStore = create<ConnectionState>((set) => ({
	status:
		typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "checking",
	lastProbeAt: 0,
	setStatus: (status) => set({ status }),
	setProbeResult: (status, lastProbeAt) => set({ status, lastProbeAt }),
}));

let probeInFlight: Promise<boolean> | null = null;
let lastProbeStartedAt = 0;
let pendingFailureProbe: ReturnType<typeof setTimeout> | null = null;
let recoveredTimer: ReturnType<typeof setTimeout> | null = null;

function clearRecoveredTimer() {
	if (recoveredTimer) clearTimeout(recoveredTimer);
	recoveredTimer = null;
}

function applyReachable(checkedAt: number) {
	const previous = useConnectionStore.getState().status;
	clearRecoveredTimer();

	if (previous === "offline" || previous === "unreachable") {
		useConnectionStore.getState().setProbeResult("recovered", checkedAt);
		recoveredTimer = setTimeout(() => {
			useConnectionStore.getState().setStatus("online");
			recoveredTimer = null;
		}, RECOVERED_VISIBLE_TIME);
		return;
	}

	useConnectionStore.getState().setProbeResult("online", checkedAt);
}

export function markBrowserOffline() {
	clearRecoveredTimer();
	useConnectionStore.getState().setStatus("offline");
}

/**
 * 直连 Worker 的轻量探测。Service Worker 对 /api/ping 单独走网络，不会回放缓存。
 * 同一时刻只允许一条探测，避免多个页面请求失败时并发 ping。
 */
export function probeConnection(): Promise<boolean> {
	if (typeof window === "undefined") return Promise.resolve(true);
	if (!navigator.onLine) {
		markBrowserOffline();
		return Promise.resolve(false);
	}
	if (probeInFlight) return probeInFlight;

	lastProbeStartedAt = Date.now();
	const controller = new AbortController();
	const timeout = window.setTimeout(() => controller.abort(), PING_TIMEOUT);

	probeInFlight = fetch(`/api/ping?_=${lastProbeStartedAt}`, {
		cache: "no-store",
		credentials: "same-origin",
		headers: { Accept: "application/json" },
		signal: controller.signal,
	})
		.then(() => {
			// 能收到任何 HTTP 响应都说明网络与 Worker 路径可达；4xx/5xx 属于服务端问题，
			// 不能误报成客户端断网。ping 正常情况下固定返回 200。
			applyReachable(Date.now());
			return true;
		})
		.catch(() => {
			clearRecoveredTimer();
			const status = navigator.onLine ? "unreachable" : "offline";
			useConnectionStore.getState().setProbeResult(status, Date.now());
			return false;
		})
		.finally(() => {
			window.clearTimeout(timeout);
			probeInFlight = null;
		});

	return probeInFlight;
}

/**
 * 普通 API 只有在 fetch 本身失败时才调用这里；HTTP 4xx/5xx 说明 Worker 可达，
 * 不应误报成网络问题。30 秒内的多次失败会合并为一次探测。
 */
export function reportRequestNetworkFailure() {
	if (typeof window === "undefined") return;
	if (!navigator.onLine) {
		markBrowserOffline();
		return;
	}
	if (probeInFlight || pendingFailureProbe) return;

	const delay = Math.max(0, FAILURE_PROBE_MIN_INTERVAL - (Date.now() - lastProbeStartedAt));
	pendingFailureProbe = setTimeout(() => {
		pendingFailureProbe = null;
		void probeConnection();
	}, delay);
}
