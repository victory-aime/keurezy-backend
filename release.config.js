module.exports = {
  branches: ['main', { name: 'uat', prerelease: 'uat' }, { name: 'develop', prerelease: 'dev' }],
  plugins: [
    [
      '@semantic-release/commit-analyzer',
      {
        preset: 'conventionalcommits',
        releaseRules: [
          { type: 'refactor', release: 'patch' },
          { type: 'perf', release: 'patch' },
          { type: 'fix', release: 'patch' },
          { type: 'feat', release: 'minor' },
          { type: 'docs', release: false },
          { type: 'chore', release: false },
          { type: 'test', release: false },
          { type: 'style', release: false },
          { type: 'ci', release: false },
          { type: 'build', release: false },
        ],
      },
    ],
    '@semantic-release/release-notes-generator',
    ['@semantic-release/npm', { npmPublish: false }],
    '@semantic-release/github',
  ],
  tagFormat: 'v${version}',
};
