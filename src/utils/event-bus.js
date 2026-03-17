// src/utils/event-bus.js
'use strict';

const EventEmitter2 = require('eventemitter2');

const eventBus = new EventEmitter2({
  wildcard: true,
  delimiter: '.',
  maxListeners: 50,
});

module.exports = eventBus;
