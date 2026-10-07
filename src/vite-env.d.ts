/// <reference types="vite/client" />

// Vite's `?worker` imports, used by MonacoEditor to bundle Monaco's language workers
// locally instead of fetching them from a CDN.
declare module '*?worker' {
  const WorkerFactory: new () => Worker
  export default WorkerFactory
}
