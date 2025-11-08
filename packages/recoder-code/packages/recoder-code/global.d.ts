declare namespace NodeJS {
  interface Global {
    window: Window & typeof globalThis;
  }
}