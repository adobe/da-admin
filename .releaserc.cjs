module.exports = {
  plugins: [
    '@semantic-release/commit-analyzer',
    '@semantic-release/release-notes-generator',
    ['@semantic-release/changelog', {
      changelogFile: 'CHANGELOG.md',
    }],
    ["@semantic-release/npm", {
      npmPublish: false,
    }],
    ['@semantic-release/git', {
      assets: ['package.json', 'package-lock.json', 'CHANGELOG.md'],
      message: 'chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}'
    }],
    ['@semantic-release/exec', {
      prepareCmd: 'npm run deploy:ci && npm run test:postdeploy',
      publishCmd: 'npm run deploy:prod',
      successCmd: 'echo "${nextRelease.version}" > released.txt',
    }],
    '@semantic-release/github',
    ["semantic-release-slack-bot", {
      notifyOnSuccess: true,
      notifyOnFail: true,
      markdownReleaseNotes: true,
      slackChannel: "helix-escalations",
    }
    ]
  ],
  branches: ['main'],
};
