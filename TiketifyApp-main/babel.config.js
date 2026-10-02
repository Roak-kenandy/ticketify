module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['module:@react-native/babel-preset'],
    plugins: ['react-native-reanimated/plugin', ['module:react-native-dotenv']],
    env: {
      production: {
        plugins: [['transform-remove-console', {exclude: ['error']}]],
      },
    },
  };
};
