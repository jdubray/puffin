// polyrun config for Puffin's verified kanban board.
// The task-card machine is the unit of work; instances ARE the cards.
// Executed by board-runtime.js as a Puffin-managed child process under the
// system node (polyrun's store needs node:sqlite, which Electron's bundled
// Node predates).
'use strict';

export default {
  store: { sqlite: '.puffin/board.sqlite' },
  machines: [{
    machineId: 'task-card',
    module: 'machines/task-card/next.cjs',
    contract: 'machines/task-card/contract.json',
    invariants: 'machines/task-card/invariants.mjs',
  }],
  handlers: {},
  worker: { leaseMs: 4000 },
  poll: { effectPollMs: 250, timerPollMs: 250 },
};
