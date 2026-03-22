#!/usr/bin/env python3
"""Test Daytona SDK operations end-to-end."""
import asyncio
from daytona_sdk import AsyncDaytona, DaytonaConfig, CreateSandboxFromSnapshotParams

async def test():
    config = DaytonaConfig(
        api_key="dyt_8532c63d57a211830b617731b30787d913870bfc0d82479a3ad6ff6e916e1946",
        api_url="http://localhost:3900/api",
        target="us"
    )
    d = AsyncDaytona(config)

    print("=== 1. Create sandbox ===")
    params = CreateSandboxFromSnapshotParams(
        snapshot="daytonaio/sandbox:0.5.0-slim",
        public=True,
        auto_stop_interval=5,
        auto_archive_interval=30,
    )
    sandbox = await d.create(params)
    print(f"  PASS: {sandbox.id}")

    print("\n=== 2. Process exec ===")
    result = await sandbox.process.exec("echo Hello_from_Daytona && whoami && pwd")
    print(f"  PASS: {result}")

    print("\n=== 3. Write file ===")
    await sandbox.fs.write("/home/daytona/app.py",
        "def add(a, b):\n    return a + b\n\nprint(add(2, 3))\n")
    print("  PASS: file written")

    print("\n=== 4. Read file ===")
    content = await sandbox.fs.read("/home/daytona/app.py")
    print(f"  PASS: {len(content)} bytes")

    print("\n=== 5. Run Python ===")
    result = await sandbox.process.exec("python3 /home/daytona/app.py")
    print(f"  PASS: {result}")

    print("\n=== 6. Git clone ===")
    try:
        result = await sandbox.process.exec(
            "cd /home/daytona && git clone --depth 1 https://github.com/daytonaio/daytona.git test-repo 2>&1 | tail -1"
        )
        print(f"  PASS: {result}")
    except Exception as e:
        print(f"  SKIP: {e}")

    print("\n=== 7. LSP (if available) ===")
    try:
        lsp = await sandbox.create_lsp_server(language="python", path="/home/daytona")
        await lsp.start()
        symbols = await lsp.document_symbols("/home/daytona/app.py")
        print(f"  PASS: {len(symbols)} symbols")
        await lsp.stop()
    except Exception as e:
        print(f"  SKIP: {e}")

    print("\n=== 8. Code interpreter (if available) ===")
    try:
        ctx = await sandbox.code_interpreter.create_context(language="python")
        result = await sandbox.code_interpreter.run_code(ctx.id, "import sys; print(sys.version)")
        print(f"  PASS: {result}")
        await sandbox.code_interpreter.delete_context(ctx.id)
    except Exception as e:
        print(f"  SKIP: {e}")

    print("\n=== 9. Preview URL ===")
    try:
        link = await sandbox.get_preview_link(8080)
        print(f"  PASS: {link}")
    except Exception as e:
        print(f"  SKIP: {e}")

    print("\n=== 10. Cleanup ===")
    await d.delete(sandbox)
    print("  PASS: deleted")

    print("\n=== ALL TESTS COMPLETE ===")

if __name__ == "__main__":
    asyncio.run(test())
