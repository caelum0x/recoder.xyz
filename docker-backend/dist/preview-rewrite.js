"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shouldRewritePreviewBody = shouldRewritePreviewBody;
exports.rewritePreviewBody = rewritePreviewBody;
function escapeHtml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
function rewriteViteHmrClient(body, proxyPrefix) {
    const normalizedPrefix = proxyPrefix.replace(/\/+$/, '');
    const socketTarget = normalizedPrefix ? `${normalizedPrefix}/` : '/';
    return body
        .replace(/const serverHost = "[^"]*";/, `const serverHost = \`${'${importMetaUrl.host}'}${socketTarget}\`;`)
        .replace(/const socketHost = `[^`]+`;/, `const socketHost = \`${'${importMetaUrl.host}'}${socketTarget}\`;`)
        .replace(/const directSocketHost = "[^"]*";/, `const directSocketHost = \`${'${importMetaUrl.host}'}${socketTarget}\`;`)
        .replace(/const base = "[^"]*" \|\| "\/";/, `const base = "${socketTarget}" || "/";`);
}
function injectPreviewHeadTags(body, proxyRoot, errorCaptureScript) {
    const hasBaseTag = /<base\b/i.test(body);
    const hasErrorCaptureScript = body.includes('data-recoder-error-handler');
    if (hasBaseTag && hasErrorCaptureScript) {
        return body;
    }
    const injection = `${hasBaseTag ? '' : `<base href="${escapeHtml(proxyRoot)}">`}` +
        `${hasErrorCaptureScript ? '' : errorCaptureScript}`;
    if (!injection) {
        return body;
    }
    if (/<head\b/i.test(body)) {
        return body.replace(/<head\b[^>]*>/i, (match) => match + injection);
    }
    if (/<html\b/i.test(body)) {
        return body.replace(/<html\b[^>]*>/i, (match) => `${match}<head>${injection}</head>`);
    }
    return `<head>${injection}</head>${body}`;
}
function shouldRewritePreviewBody(contentType, requestPath) {
    return contentType.includes('text/html') ||
        contentType.includes('javascript') ||
        contentType.includes('ecmascript') ||
        /\.(?:[cm]?[jt]sx?)$/i.test(requestPath);
}
function rewritePreviewBody(body, options) {
    const { proxyPrefix, contentType, requestPath = '', errorCaptureScript } = options;
    const normalizedPrefix = proxyPrefix.replace(/\/+$/, '');
    const proxyRoot = `${normalizedPrefix}/`;
    const absolutePathGuard = '(?!\\/|preview\\/|api\\/sandbox-preview\\/)';
    let modifiedBody = body;
    if (contentType.includes('text/html')) {
        modifiedBody = modifiedBody
            .replace(new RegExp(`(<script[^>]+src=["'])\\/${absolutePathGuard}`, 'gi'), `$1${proxyRoot}`)
            .replace(new RegExp(`(<link[^>]+href=["'])\\/${absolutePathGuard}`, 'gi'), `$1${proxyRoot}`)
            .replace(new RegExp(`(<img[^>]+src=["'])\\/${absolutePathGuard}`, 'gi'), `$1${proxyRoot}`)
            .replace(new RegExp(`(<source[^>]+src=["'])\\/${absolutePathGuard}`, 'gi'), `$1${proxyRoot}`)
            .replace(new RegExp(`(import\\s+[^"']*["'])\\/${absolutePathGuard}`, 'gi'), `$1${proxyRoot}`)
            .replace(new RegExp(`(new\\s+URL\\s*\\(\\s*["'])\\/${absolutePathGuard}`, 'gi'), `$1${proxyRoot}`);
        modifiedBody = injectPreviewHeadTags(modifiedBody, proxyRoot, errorCaptureScript);
    }
    if (contentType.includes('javascript') || contentType.includes('ecmascript') || !contentType || /\.(?:[cm]?[jt]sx?)$/i.test(requestPath)) {
        modifiedBody = modifiedBody
            .replace(new RegExp(`(from\\s+["'])\\/${absolutePathGuard}`, 'g'), `$1${proxyRoot}`)
            .replace(new RegExp(`(import\\s+["'])\\/${absolutePathGuard}`, 'g'), `$1${proxyRoot}`)
            .replace(new RegExp(`(export\\s+.*from\\s+["'])\\/${absolutePathGuard}`, 'g'), `$1${proxyRoot}`)
            .replace(new RegExp(`(import\\s*\\(\\s*["'])\\/${absolutePathGuard}`, 'g'), `$1${proxyRoot}`)
            .replace(new RegExp(`(new\\s+URL\\s*\\(\\s*["'])\\/${absolutePathGuard}`, 'g'), `$1${proxyRoot}`);
        if (requestPath === '@vite/client') {
            modifiedBody = rewriteViteHmrClient(modifiedBody, normalizedPrefix);
        }
    }
    return modifiedBody;
}
