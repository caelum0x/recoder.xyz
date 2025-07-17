const ora = require('ora');

class Spinner {
  constructor(text = 'Loading...', options = {}) {
    this.spinner = ora({
      text,
      color: 'cyan',
      spinner: 'dots',
      ...options
    });
  }

  start() {
    this.spinner.start();
    return this;
  }

  stop() {
    this.spinner.stop();
    return this;
  }

  succeed(text) {
    this.spinner.succeed(text);
    return this;
  }

  fail(text) {
    this.spinner.fail(text);
    return this;
  }

  warn(text) {
    this.spinner.warn(text);
    return this;
  }

  info(text) {
    this.spinner.info(text);
    return this;
  }

  setText(text) {
    this.spinner.text = text;
    return this;
  }

  setColor(color) {
    this.spinner.color = color;
    return this;
  }

  setSpinner(spinner) {
    this.spinner.spinner = spinner;
    return this;
  }
}

// Factory function for easy usage
function spinner(text, options) {
  return new Spinner(text, options);
}

module.exports = { spinner, Spinner };