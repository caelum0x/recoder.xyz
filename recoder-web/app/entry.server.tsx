import type { EntryContext } from '@remix-run/node';
import { RemixServer } from '@remix-run/react';
import { isbot } from 'isbot';
import { renderToPipeableStream } from 'react-dom/server';
import { renderHeadToString } from 'remix-island';
import { Head } from './root';
import { themeStore } from '~/lib/stores/theme';
import { PassThrough } from 'node:stream';

const ABORT_DELAY = 5_000;

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  remixContext: EntryContext,
) {
  const prohibitOutOfOrderStreaming = isbot(request.headers.get('user-agent') || '');

  return new Promise((resolve, reject) => {
    let shellRendered = false;
    const head = renderHeadToString({ request, remixContext, Head });

    const { pipe, abort } = renderToPipeableStream(
      <RemixServer context={remixContext} url={request.url} abortDelay={ABORT_DELAY} />,
      {
        onShellReady() {
          if (prohibitOutOfOrderStreaming) return;
          shellRendered = true;

          const body = new PassThrough();
          const stream = createReadableStreamFromReadable(body);

          responseHeaders.set('Content-Type', 'text/html');

          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode,
            }),
          );

          body.write(
            `<!DOCTYPE html><html lang="en" data-theme="${themeStore.value}"><head>${head}</head><body style="background:#0A0A0A"><div id="root" class="w-full h-full">`,
          );
          pipe(body);
          body.write(`</div></body></html>`);
        },
        onShellError(error: unknown) {
          reject(error);
        },
        onAllReady() {
          if (!prohibitOutOfOrderStreaming) return;
          shellRendered = true;

          const body = new PassThrough();
          const stream = createReadableStreamFromReadable(body);

          responseHeaders.set('Content-Type', 'text/html');

          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode,
            }),
          );

          body.write(
            `<!DOCTYPE html><html lang="en" data-theme="${themeStore.value}"><head>${head}</head><body style="background:#0A0A0A"><div id="root" class="w-full h-full">`,
          );
          pipe(body);
          body.write(`</div></body></html>`);
        },
        onError(error: unknown) {
          responseStatusCode = 500;
          if (shellRendered) {
            console.error(error);
          }
        },
      },
    );

    setTimeout(abort, ABORT_DELAY);
  });
}

function createReadableStreamFromReadable(readable: PassThrough): ReadableStream {
  return new ReadableStream({
    start(controller) {
      readable.on('data', (chunk) => {
        controller.enqueue(typeof chunk === 'string' ? new TextEncoder().encode(chunk) : chunk);
      });
      readable.on('end', () => {
        controller.close();
      });
      readable.on('error', (err) => {
        controller.error(err);
      });
    },
    cancel() {
      readable.destroy();
    },
  });
}
