module.exports = {
    apps : [{
      name      : 'manojsinghnegi.ai-server',
      script    : 'index.js',
      instances: 'max',
      autorestart: true,
    }],
  }