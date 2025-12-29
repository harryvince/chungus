#!/usr/bin/env bun

const port = process.env.HEALTH_CHECK_PORT || "3000";

fetch(`http://localhost:${port}/health`)
	.then((r) => (r.ok ? process.exit(0) : process.exit(1)))
	.catch(() => process.exit(1));
