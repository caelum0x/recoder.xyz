/** Build a host-preserving, exact-revision source link from a canonical PR URL. */
export function githubFindingSourceUrl(input: {
    prUrl: string;
    headSha: string;
    file: string;
    line: number;
}): string | null {
    if (!Number.isInteger(input.line) || input.line < 1 || !/^[0-9a-f]{7,64}$/i.test(input.headSha)) return null;
    const file = input.file.trim().replace(/^\.\//, "");
    const fileParts = file.split("/");
    if (fileParts.length == 0 || fileParts.some((part) => part == "" || part == "." || part == "..")) return null;
    try {
        const url = new URL(input.prUrl);
        if (url.protocol != "https:" && url.protocol != "http:") return null;
        const parts = url.pathname.split("/").filter(Boolean);
        const pullIndex = parts.lastIndexOf("pull");
        if (pullIndex < 2 || !/^\d+$/.test(parts[pullIndex + 1] ?? "")) return null;
        const root = parts.slice(0, pullIndex - 2);
        const owner = parts[pullIndex - 2]!;
        const repo = parts[pullIndex - 1]!;
        url.pathname = `/${[
            ...root,
            owner,
            repo,
            "blob",
            input.headSha,
            ...fileParts,
        ].map(encodeURIComponent).join("/")}`;
        url.search = "";
        url.hash = `L${input.line}`;
        return url.toString();
    } catch {
        return null;
    }
}
