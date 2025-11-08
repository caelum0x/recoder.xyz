import { JSDOM } from 'jsdom';

describe('Greeting App', () => {
  let dom: JSDOM;

  beforeEach(() => {
    dom = new JSDOM(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Greeting App</title>
        <link rel="stylesheet" href="../src/styles/main.css">
      </head>
      <body>
        <div id="app">
          <h1>Hello, welcome to the Greeting App!</h1>
        </div>
        <script src="../dist/bundle.js"></script>
      </body>
      </html>
    `);
    global.document = dom.window.document;
    global.window = dom.window as unknown as Window & typeof globalThis;
  });

  it('should display the greeting message', () => {
    const appDiv = document.getElementById('app');
    expect(appDiv?.innerHTML).toContain('Hello, welcome to the Greeting App!');
  });

  it('should have a valid app container', () => {
    const appDiv = document.getElementById('app');
    expect(appDiv).toBeTruthy();
    expect(appDiv?.tagName).toBe('DIV');
  });
});