declare module 'screenshot-desktop' {
  interface ScreenshotOptions {
    format?: string;
    filename?: string;
  }

  /**
   * Capture a screenshot and return it as a Buffer.
   * If a filename is provided it will also write the file to disk.
   */
  function screenshot(options?: ScreenshotOptions): Promise<Buffer>;

  export = screenshot;
} 