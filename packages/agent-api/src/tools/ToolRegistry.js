class ToolRegistry {
  constructor() {
    this._tools = new Map();
  }

  register(...tools) {
    for (const tool of tools) {
      if (this._tools.has(tool.name)) {
        throw new Error(`tool already registered: ${tool.name}`);
      }
      this._tools.set(tool.name, tool);
    }
  }

  get(name) {
    return this._tools.get(name);
  }

  list() {
    return Array.from(this._tools.values());
  }

  allowlist(names) {
    return names
      .map((n) => this._tools.get(n))
      .filter(Boolean);
  }
}

module.exports = { ToolRegistry };
