import base from './playwright.config'

// Screenshot capture is a tool, not a test suite: it lives outside testDir so
// "npm run test:e2e" never picks it up. Run it with "npm run screenshots".
export default { ...base, testDir: './capture' }
