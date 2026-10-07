import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'src/generated', 'node_modules'] },

  /* ------------------------------------------------------------ app code */
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.worker },
      parserOptions: {
        project: ['./tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Floating promises are the most common real bug in this codebase's shape —
      // every progress write is async and fire-and-forget by design, so they must be
      // marked with `void` deliberately rather than forgotten.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports',
          fixStyle: 'inline-type-imports',
          // `typeof import('sucrase')` is how the lazily loaded module is typed
          // without pulling it into the bundle. That is the point, not a mistake.
          disallowTypeAnnotations: false,
        },
      ],

      /*
       * Off deliberately. `Store`, `CodeRunner` and `ProgressEngine` are async
       * interfaces with synchronous implementations — MemoryStore does not need to
       * await anything, and SqlRunner computes in process. Satisfying an async
       * contract synchronously is correct, and the rule would push us to add
       * meaningless awaits or drop the `async` keyword and hand-roll
       * `Promise.resolve()` everywhere.
       */
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-explicit-any': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },

  /*
   * ------------------------------------------------- the layering rule
   *
   * ARCHITECTURE.md says engines are pure logic with no React, and that ui/ knows
   * nothing about lessons or progress. A claim like that is worth nothing unless it is
   * enforced, so it is enforced here. These were the two violations most likely to
   * creep in, and both would quietly make the engines untestable without a DOM.
   */
  {
    files: ['src/engines/**/*.ts', 'src/runners/**/*.ts', 'src/storage/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'react',
              message:
                'Engines, runners and storage must stay free of React so they can be ' +
                'tested without a DOM and reused by a future backend. Put the hook in src/hooks/.',
            },
            {
              name: 'react-dom',
              message: 'Engines must not touch the DOM.',
            },
          ],
          patterns: [
            {
              group: ['@/features/*', '@/routes/*', '@/ui/*'],
              message:
                'A lower layer must not import from a higher one. Invert the dependency: ' +
                'pass the data in, or move the shared type into src/content/types.ts.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/ui/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/engines/*', '@/features/*', '@/routes/*', '@/content/catalog'],
              message:
                'src/ui is the design system: primitives must not know about lessons, ' +
                'progress or routes. Take what you need as props.',
            },
          ],
        },
      ],
    },
  },

  /*
   * Files that deliberately export more than components.
   *
   * `react-refresh/only-export-components` protects hot-reload granularity. These four
   * files genuinely need mixed exports — a context provider lives next to the hooks that
   * read it, the router exports its router object, and the design system exports `cx`
   * alongside its primitives. Splitting them to satisfy a dev-time warning would make
   * the code worse, so the rule is off here rather than warning forever.
   */
  {
    files: [
      'src/hooks/useProgress.tsx',
      'src/router.tsx',
      'src/ui/primitives.tsx',
      'src/features/RouteError.tsx',
    ],
    rules: { 'react-refresh/only-export-components': 'off' },
  },

  /* -------------------------------------------------------------- tests */
  {
    files: ['src/**/*.{test,spec}.{ts,tsx}', 'src/test/**/*.ts'],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      // Tests are allowed to be blunt.
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      'no-console': 'off',
      'no-restricted-imports': 'off',
    },
  },

  /* --------------------------------------------------- build-time scripts */
  {
    files: ['scripts/**/*.mjs', '*.config.ts', 'src/engines/search/tokenize.mjs', 'src/runners/seed.mjs'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      // Build scripts report progress on stdout; that is their interface.
      'no-console': 'off',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
)
