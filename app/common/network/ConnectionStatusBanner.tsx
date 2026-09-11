import { useEffect } from "react";
import { CircleCheck, TriangleAlert, WifiOff } from "lucide-react";
import {
	HEALTHY_PROBE_INTERVAL,
	UNHEALTHY_PROBE_INTERVAL,
	markBrowserOffline,
	probeConnection,
	reportRequestNetworkFailure,
	useConnectionStore,
} from "./connectionStore";
import styles from "./ConnectionStatusBanner.module.less";

export function ConnectionStatusMonitor() {
	const status = useConnectionStore((state) => state.status);
	const lastProbeAt = useConnectionStore((state) => state.lastProbeAt);

	useEffect(() => {
		const handleOnline = () => void probeConnection();
		const handleOffline = () => markBrowserOffline();
		const handleVisibility = () => {
			if (document.visibilityState !== "visible") return;
			const state = useConnectionStore.getState();
			const interval =
				state.status === "online" || state.status === "checking"
					? HEALTHY_PROBE_INTERVAL
					: UNHEALTHY_PROBE_INTERVAL;
			if (Date.now() - state.lastProbeAt >= interval) void probeConnection();
		};
		const handleServiceWorkerMessage = (event: MessageEvent) => {
			if ((event.data as { type?: string } | null)?.type === "API_NETWORK_FAILURE") {
				reportRequestNetworkFailure();
			}
		};

		window.addEventListener("online", handleOnline);
		window.addEventListener("offline", handleOffline);
		document.addEventListener("visibilitychange", handleVisibility);
		navigator.serviceWorker?.addEventListener("message", handleServiceWorkerMessage);
		void probeConnection();

		return () => {
			window.removeEventListener("online", handleOnline);
			window.removeEventListener("offline", handleOffline);
			document.removeEventListener("visibilitychange", handleVisibility);
			navigator.serviceWorker?.removeEventListener("message", handleServiceWorkerMessage);
		};
	}, []);

	useEffect(() => {
		const interval =
			status === "online" || status === "checking"
				? HEALTHY_PROBE_INTERVAL
				: UNHEALTHY_PROBE_INTERVAL;
		const elapsed = Date.now() - lastProbeAt;
		const timer = window.setTimeout(
			() => void probeConnection(),
			Math.max(1000, interval - elapsed),
		);
		return () => window.clearTimeout(timer);
	}, [lastProbeAt, status]);

	return null;
}

export function ConnectionStatusIndicator() {
	const status = useConnectionStore((state) => state.status);

	if (status === "checking" || status === "online") return null;

	const content =
		status === "offline"
			? { icon: WifiOff, text: "网络断开" }
			: status === "unreachable"
				? { icon: TriangleAlert, text: "服务不可达" }
				: { icon: CircleCheck, text: "网络已恢复" };
	const Icon = content.icon;

	return (
		<div
			className={`${styles.indicator} ${status === "recovered" ? styles.recovered : styles.problem}`}
			role="status"
			aria-live="polite"
		>
			<Icon size={16} strokeWidth={2} aria-hidden="true" />
			<span>{content.text}</span>
		</div>
	);
}
