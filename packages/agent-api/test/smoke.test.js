'use strict';

const pkg = require('../src/index.js');

describe('package loads', () => {
  it('exports an object', () => {
    expect(typeof pkg).toBe('object');
  });
});
