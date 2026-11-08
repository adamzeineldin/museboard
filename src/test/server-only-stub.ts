// Vitest runs outside React Server Components, where the real `server-only` package throws.
// vitest.config.ts aliases `server-only` to this empty module.
export {};
