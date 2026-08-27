/**
 * 在 wrangler dev 启动前把局域网访问地址打印出来，方便手机直连调试。
 *
 * 端口从 wrangler.json 的 dev.port 读，避免和配置写死两份。
 */
import { readFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function readDevPort() {
	try {
		// wrangler.json 允许注释，这里只做最小清理后再解析
		const raw = readFileSync(resolve(root, "wrangler.json"), "utf8").replace(
			/^\s*\/\/.*$/gm,
			"",
		);
		return JSON.parse(raw)?.dev?.port ?? 8787;
	} catch {
		return 8787;
	}
}

function lanAddresses() {
	const result = [];
	for (const [name, list] of Object.entries(networkInterfaces())) {
		// awdl/llw 是 AirDrop 用的点对点网卡，永远连不上
		if (/^(awdl|llw)/.test(name)) continue;
		for (const info of list ?? []) {
			if (info.family !== "IPv4" || info.internal) continue;
			// 169.254.x.x 是没拿到 DHCP 时的自分配地址，手机连不上
			if (info.address.startsWith("169.254.")) continue;
			// utun/tun 一般是 VPN 隧道，排在真实无线网卡后面
			const virtual = /^(utun|tun|tap|vmnet|bridge)/.test(name);
			result.push({ name, address: info.address, virtual });
		}
	}
	return result.sort((a, b) => Number(a.virtual) - Number(b.virtual));
}

const port = readDevPort();
const addresses = lanAddresses();

console.log("");
console.log("  手机调试地址（需与电脑处于同一 Wi-Fi）");
console.log(`  本机:     http://localhost:${port}`);
if (addresses.length === 0) {
	console.log("  局域网:   未找到可用的 IPv4 网卡，检查 Wi-Fi 是否连接");
} else {
	for (const { name, address, virtual } of addresses) {
		const tag = virtual ? `${name}, 虚拟网卡/VPN` : name;
		console.log(`  局域网:   http://${address}:${port}   (${tag})`);
	}
}
console.log("");
