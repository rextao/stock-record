import type { Route } from "./+types/home";
import App from "~/src/App";

export default function Home({ loaderData }: Route.ComponentProps) {
	return <App  />;
}
