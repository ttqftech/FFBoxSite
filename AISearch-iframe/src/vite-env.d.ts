/// <reference types="vite-svg-loader" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<{}, {}, any>;
  export default component;
}

declare module '*.svg' {
  const component: any;
  export default component;
}

declare module '*.svg?skipsvgo' {
  const component: any;
  export default component;
}

declare module '*.module.less' {
  const classes: { readonly [key: string]: string };
  export default classes;
}
