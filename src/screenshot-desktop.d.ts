declare module 'screenshot-desktop' {
  interface DisplayInfo {
    id: number | string;
    name?: string;
    width?: number;
    height?: number;
  }
  interface ScreenshotOptions {
    screen?: number | string;
    format?: 'png' | 'jpg';
    filename?: string;
  }
  function screenshot(options?: ScreenshotOptions): Promise<Buffer>;
  namespace screenshot {
    function listDisplays(): Promise<DisplayInfo[]>;
    function all(): Promise<Buffer[]>;
  }
  export default screenshot;
}
