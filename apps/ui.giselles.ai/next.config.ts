import { join } from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	turbopack: {
		root: join(__dirname, "../../"),
	},
	transpilePackages: ["@recoder/ecosystem-config"],
};

export default nextConfig;
