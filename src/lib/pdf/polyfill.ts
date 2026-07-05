// pdf.js v6 uses the very recent TC39 `Map.prototype.getOrInsert(Computed)`
// proposal, which most browsers (and the build sandbox Chromium) don't ship yet.
// Polyfill it so PDF rendering works everywhere.
function install(proto: any) {
  if (typeof proto.getOrInsert !== "function") {
    proto.getOrInsert = function (key: any, defaultValue: any) {
      if (this.has(key)) return this.get(key);
      this.set(key, defaultValue);
      return defaultValue;
    };
  }
  if (typeof proto.getOrInsertComputed !== "function") {
    proto.getOrInsertComputed = function (key: any, callback: (k: any) => any) {
      if (this.has(key)) return this.get(key);
      const value = callback(key);
      this.set(key, value);
      return value;
    };
  }
}

install(Map.prototype);
install(WeakMap.prototype);

export {};
