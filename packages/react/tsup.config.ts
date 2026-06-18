import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  treeshake: true,
  // Consumers bring their own React; core is a separate published package.
  external: ["react", "react-dom", "react/jsx-runtime", "@sigsafe/core"],
  esbuildOptions(options) {
    options.jsx = "automatic";
  },
});
