import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts']),
  {
    rules: {
      // Too strict for the modal/open lifecycle patterns the lifted components
      // use. `BulkQuestionModal` and `LogsDashboard` both fail without it.
      'react-hooks/set-state-in-effect': 'off',
    },
  },
  // Prettier config should be last to override other configs
  prettier,
]);

export default eslintConfig;
