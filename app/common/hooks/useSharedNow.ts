import { useSyncExternalStore } from "react";

/**
 * 全局共享的「当前时间」，每分钟走一格。
 *
 * 用来驱动「数据已经旧了」这类随时间变化的展示。刻意做成一个模块级的定时器 +
 * 订阅者集合，而不是让每个组件各自 setInterval：首页可能同时渲染十几张卡片，
 * 十几个定时器既浪费又会让重渲染时机彼此错开。没有订阅者时定时器会被清掉。
 */
const TICK_MS = 60_000;

const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let current = Date.now();

function subscribe(listener: () => void) {
	listeners.add(listener);
	if (timer === null) {
		// 定时器刚起来时先对齐一次，避免拿到上一轮遗留的旧快照
		current = Date.now();
		timer = setInterval(() => {
			current = Date.now();
			listeners.forEach((notify) => notify());
		}, TICK_MS);
	}
	return () => {
		listeners.delete(listener);
		if (listeners.size === 0 && timer !== null) {
			clearInterval(timer);
			timer = null;
		}
	};
}

const getSnapshot = () => current;

export function useSharedNow(): number {
	return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
