// Patch a known bug in Matter.js bundled with Phaser 3.60.0-beta.13.
// Plugin.use accesses `plugin.silent` after the loop, where `plugin` may be
// undefined (when the dependencies list is empty), throwing
// "Cannot read properties of undefined (reading 'silent')".
//
// We replace Plugin.use with a safe implementation that mirrors the original
// behavior but guards the final `silent` check.
//
// Additionally, Phaser 3.60 has a regression where Body.ignoreGravity is no
// longer respected by Engine._bodiesApplyGravity. We patch that too so that
// suspended fruits stay still until the player taps them.
// See: https://github.com/phaserjs/phaser/issues/6473

(function patchMatterPlugin() {
  function tryPatch() {
    if (typeof Phaser === 'undefined') return false;
    var P = Phaser.Physics && Phaser.Physics.Matter && Phaser.Physics.Matter.Matter;
    if (!P || !P.Plugin) return false;
    if (P.__patched) return true;

    var Plugin = P.Plugin;
    var Common = P.Common;
    var Engine = P.Engine;

    Plugin.use = function (module, plugins) {
      module.uses = (module.uses || []).concat(plugins || []);

      if (module.uses.length === 0) {
        if (Common && Common.warn) {
          Common.warn('Plugin.use:', (Plugin.toString && Plugin.toString(module)) || module.name, 'does not specify any dependencies to install.');
        }
        return;
      }

      var dependencies = Plugin.dependencies(module);
      var sortedDependencies = Common && Common.topologicalSort ? Common.topologicalSort(dependencies) : Object.keys(dependencies || {});
      var status = [];
      var lastPlugin;

      for (var i = 0; i < sortedDependencies.length; i += 1) {
        if (sortedDependencies[i] === module.name) continue;
        var plugin = Plugin.resolve(sortedDependencies[i]);
        if (!plugin) {
          status.push('❌ ' + sortedDependencies[i]);
          continue;
        }
        lastPlugin = plugin;
        if (Plugin.isUsed(module, plugin.name)) continue;
        if (!Plugin.isFor(plugin, module)) {
          if (Common && Common.warn) Common.warn('Plugin.use:', Plugin.toString(plugin), 'is for', plugin.for, 'but installed on', Plugin.toString(module) + '.');
          plugin._warned = true;
        }
        if (plugin.install) {
          plugin.install(module);
        } else {
          if (Common && Common.warn) Common.warn('Plugin.use:', Plugin.toString(plugin), 'does not specify an install function.');
          plugin._warned = true;
        }
        if (plugin._warned) {
          status.push('🔶 ' + Plugin.toString(plugin));
          delete plugin._warned;
        } else {
          status.push('✅ ' + Plugin.toString(plugin));
        }
        module.used.push(plugin.name);
      }

      if (status.length > 0 && lastPlugin && !lastPlugin.silent) {
        if (Common && Common.info) Common.info(status.join('  '));
      }
    };

    // Fix ignoreGravity not honored in Phaser 3.60.
    if (Engine && Engine._bodiesApplyGravity) {
      Engine._bodiesApplyGravity = function (bodies, gravity) {
        var gravityScale = typeof gravity.scale !== 'undefined' ? gravity.scale : 0.001;
        var bodiesLength = bodies.length;
        if ((gravity.x === 0 && gravity.y === 0) || gravityScale === 0) return;
        for (var i = 0; i < bodiesLength; i += 1) {
          var body = bodies[i];
          if (body.ignoreGravity || body.isStatic || body.isSleeping) continue;
          body.force.y += body.mass * gravity.y * gravityScale;
          body.force.x += body.mass * gravity.x * gravityScale;
        }
      };
    }

    P.__patched = true;
    return true;
  }

  if (!tryPatch()) {
    if (typeof Promise !== 'undefined') {
      Promise.resolve().then(tryPatch);
    } else {
      setTimeout(tryPatch, 0);
    }
  }
})();
