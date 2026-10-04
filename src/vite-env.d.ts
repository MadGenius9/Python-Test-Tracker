/// <reference types="vite/client" />

declare module '*.wasm?url' {
  const url: string;
  export default url;
}

declare module 'zxing-wasm/reader/zxing_reader.wasm?url' {
  const url: string;
  export default url;
}

declare module 'zxing-wasm/full/zxing_full.wasm?url' {
  const url: string;
  export default url;
}
