/** @type {import('lint-staged').Configuration} */
module.exports = {
  '*.{js,jsx,ts,tsx}': 'eslint --fix --max-warnings 0',
  '*.{json,md,css,yml,yaml}': 'prettier --write',
  // tsc checks the whole project, so it ignores the staged file list.
  '*.{ts,tsx}': () => 'tsc --noEmit',
};
