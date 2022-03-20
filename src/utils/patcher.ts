import { Mdl, PatchCallback } from 'enmity-api/patcher';

const patches: Patch[] = [];

interface Patch {
  caller: string;
  mdl: Mdl;
  func: string;
  original: Function;
  unpatch: () => void;
  patches: Patcher[];
}

interface Unpatchable {
  unpatch: () => void;
}
interface Patcher {
  caller: string;
  type: Type;
  id: number;
  callback: PatchCallback;
  unpatch: () => void;
}

enum Type {
  Before = 'before',
  Instead = 'instead',
  After = 'after',
}

function getPatchesByCaller(id: string): Patcher[] {
  const _patches: Patcher[] = [];

  for (const patch of patches) {
    for (const child of patch.patches) {
      if (child.caller === id) _patches.push(child);
    }
  }

  return _patches;
}

function unpatchAll(caller: string): void {
  const patches = getPatchesByCaller(caller);
  if (!patches.length) return;

  for (const patch of patches) patch.unpatch();
}

function override(patch: Patch) {
  return function(): void {
    if (!patch.patches.length) return patch.original.apply(this, arguments);

    let res;
    let args: any = arguments;

    for (const before of patch.patches.filter(p => p.type === Type.Before)) {
      try {
        const tempArgs = before.callback(this, args, patch.original.bind(this));
        if (Array.isArray(tempArgs)) args = tempArgs;
      } catch (error) {
        console.error(`Could not fire before patch for ${patch.func} of ${before.caller}`);
        console.error(error);
      }
    }

    const insteads = patch.patches.filter(p => p.type === Type.Instead);
    if (!insteads.length) res = patch.original.apply(this, args);

    else {
      for (const instead of insteads) {
        try {
          const ret = instead.callback(this, args, patch.original.bind(this));
          if (ret !== undefined) res = ret;
        } catch (error) {
          console.error(`Could not fire instead patch for ${patch.func} of ${instead.caller}`);
          console.error(error);
        }
      }
    }

    for (const after of patch.patches.filter(p => p.type === Type.After)) {
      try {
        const ret = after.callback(this, args, res);
        if (ret !== undefined) res = ret;
      } catch (error) {
        console.error(`Could not fire after patch for ${patch.func} of ${after.caller}`);
        console.error(error);
      }
    }

    return res;
  };
}

function push([caller, mdl, func]): Patch {
  const patch: Patch = {
    caller,
    mdl,
    func,
    original: mdl[func],
    unpatch: () => {
      patch.mdl[patch.func] = patch.original;
      patch.patches = [];
    },
    patches: [],
  };

  mdl[func] = override(patch);
  Object.assign(mdl[func], patch.original, {
    toString: () => patch.original.toString(),
    '__original': patch.original,
  });

  patches.push(patch);
  return patch;
}

function get(caller, mdl, func): Patch {
  const patch = patches.find(p => p.mdl === mdl && p.func === func);
  if (patch) return patch;

  return push([caller, mdl, func]);
}

function patch(caller: string, mdl: Mdl, func: string, callback: PatchCallback, type = Type.After): () => void {
  const _patches = get(caller, mdl, func);

  const patch: Patcher = {
    caller,
    type,
    id: _patches.patches.length,
    callback,
    unpatch: () => {
      _patches.patches.splice(_patches.patches.findIndex(p => p.id === patch.id && p.type === type), 1);

      if (_patches.patches.length <= 0) {
        const index = patches.findIndex(p => p.mdl === mdl && p.func === func);
        patches[index].unpatch();
        patches.splice(index, 1);
      }
    },
  };

  _patches.patches.push(patch);
  return patch.unpatch;
}

function before(caller: string, mdl: Mdl, func: string, callback: PatchCallback): Unpatchable {
  const unpatch = patch(caller, mdl, func, callback, Type.Before);
  return {
    unpatch,
  };
}

function instead(caller: string, mdl: Mdl, func: string, callback: PatchCallback): Unpatchable {
  const unpatch = patch(caller, mdl, func, callback, Type.Instead);
  return {
    unpatch,
  };
}

function after(caller: string, mdl: Mdl, func: string, callback: PatchCallback): Unpatchable {
  const unpatch = patch(caller, mdl, func, callback, Type.After);
  return {
    unpatch,
  };
}

function create(name: string): Record<string, any> {
  return {
    getPatchesByCaller: getPatchesByCaller,
    before: (mdl: Mdl, func: string, callback: PatchCallback) => before(name, mdl, func, callback),
    instead: (mdl: Mdl, func: string, callback: PatchCallback) => instead(name, mdl, func, callback),
    after: (mdl: Mdl, func: string, callback: PatchCallback) => after(name, mdl, func, callback),
    unpatchAll: () => unpatchAll(name),
  };
}

export {
  create,
  before,
  instead,
  after,
  unpatchAll,
};
