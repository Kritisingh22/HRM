/// <reference types="vite/client" />

/* Static asset imports (the payslip header logo ships as an SVG). */
declare module '*.svg' {
  const src: string;
  export default src;
}
