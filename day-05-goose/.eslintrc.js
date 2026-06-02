module.exports = {
  env: {
    es6: true,
    browser: true,
    node: true,
  },
  ecmaFeatures: {
    modules: true,
  },
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
  },
  globals: {
    wx: true,
    BABYLON: true,
    GameGlobal: true,
    canvas: true,
    App: true,
    Page: true,
    getCurrentPages: true,
    getApp: true,
    Component: true,
    requirePlugin: true,
    requireMiniProgram: true,
  },
  rules: {},
};
