import '@testing-library/jest-dom/vitest'

// jsdom does not implement layout, so scrollIntoView is missing. The citation
// highlight uses it purely as a convenience.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {}
}
