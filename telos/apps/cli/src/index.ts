#!/usr/bin/env node
const cmd = process.argv[2] ?? "help"
const help = `telos <ship|studio|approve|logs>`
if (cmd === "help") console.log(help)
else console.log(cmd, "not implemented")
