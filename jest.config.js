const packageName = require('./package.json')
  .name.split('@nodite/')
  .pop();

module.exports = {
  moduleFileExtensions: ['ts', 'js', 'node'],
  transform: {
    '^.+\\.ts?$': ['ts-jest', { tsconfig: `<rootDir>/tsconfig.json` }],
  },
  displayName: packageName,
  rootDir: './',
  roots: [`<rootDir>`],
  testRegex: `(.*/__tests__/.*|\\.(test|spec))\\.(js?|ts?)$`,
};
