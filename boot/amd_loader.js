if (typeof define !== 'function' && typeof requireModule !== 'function') {
  var define, requireModule;

  (function() {
    var registry = {}, seen = {};

    define = function(name, deps, callback) {
      registry[name] = { deps: deps, callback: callback };
    };

    requireModule = function(name, opt_fromList) {
      if (seen[name]) { return seen[name]; }
      var fromList = opt_fromList || [];

      var mod = registry[name];

      if (!mod) {
        throw new Error("Module: '" + name +
                        "' not found, referenced from: " +
                        fromList[fromList.length - 1]);
      }

      var deps = mod.deps,
      callback = mod.callback,
      reified = [],
      exports;

      fromList.push(name);

      for (var i = 0, l = deps.length; i<l; i++) {
        if (deps[i] === 'exports') {
          reified.push(exports = {});
        } else {
          if (fromList.indexOf(deps[i]) != -1)
            throw new Error('Circular dependency: ' + name + ' -> ' + deps[i]);
          reified.push(requireModule(deps[i], fromList));
        }
      }

      fromList.pop(name);

      var value = callback.apply(this, reified);

      return seen[name] = exports || value;
    };

    define.registry = registry;
    define.seen = seen;
  })();
}
