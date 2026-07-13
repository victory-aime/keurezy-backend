const Configuration = {
  /*
   * Resolve and load @commitlint/config-conventional from node_modules.
   * Referenced packages must be installed
   */
  extends: ['@commitlint/config-conventional'],
  ignores: [(message) => message.startsWith('Merge')],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat',
        'fix',
        'docs',
        'style',
        'refactor',
        'perf',
        'test',
        'build',
        'ci',
        'chore',
        'revert',
      ],
    ],

    'subject-empty': [2, 'never'],
    'type-empty': [2, 'never'],
    'header-max-length': [0],
    'body-max-line-length': [0],
    'footer-max-line-length': [0],
    'subject-case': [0],
    'subject-full-stop': [0],
  },
};
module.exports = Configuration;
