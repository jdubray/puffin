/**
 * SAM FSM - ES Module Wrapper
 * Wraps the UMD bundle for use in browser ES modules
 */

const tpFSM = (function() {
  'use strict';

  function a(a, b) {
    const c = n(a);
    return c.includes(b)
  }

  function b(b, c) {
    return function(d, e) {
      if (a(b, e) && l(d)) {
        const a = async function() {
          const a = await d.apply(this, arguments);
          return a.__actionName = e, a.__stateMachineId = c, a
        };
        return a.__actionName = e, a.__stateMachineId = c, a
      }
      throw new Error(`addAction invalid action: ${e}`)
    }
  }

  function c({ pc0: a, actions: b, transitions: c, states: e, composite: f, pc: i = "pc", id: g, componentName: h, deterministic: j = !1, lax: l = !0, enforceAllowedTransitions: o = !1, blockUnexpectedActions: p = !1 }) {
    const q = d(e, c), r = n(q.states), s = [a => () => {
      const b = u(a, h, `${i}_1`), c = u(a, h, i), d = a.__actionName, e = a.__stateMachineIdForLastAction;
      if (!l && !r.includes(c)) a.__error = `unexpected state: ${c}`;
      else try {
        d && b && !q.states[b].transitions.includes(d) && e === g && (a.__error = `unexpected action ${d} for state: ${c}`)
      } catch (b) {
        a.__error = `unexpected error: ${b.message} for action ${d} and state: ${c}`
      }
    }];
    return p && s.push(a => () => {
      const b = u(a, h, i), { transitions: c = [], guards: d = [] } = q.states[b];
      a.__blockUnexpectedActions = !0, a.__allowedActions = m(a.__allowedActions).concat(c.filter(b => d.reduce((d, e) => (e.action || k(c)) === b ? d && e.condition(a) : d && !0, !0))), 0 === a.allowedActions().length && (a.__allowedActions = ["__EMPTY"])
    }), f && s.push(a => () => {
      const c = u(a, f.onState.component, f.onState.pc);
      c !== f.onState?.label && (a.__disallowedActions = m(a.__disallowedActions).concat(n(b)))
    }), s
  }

  function d(a, b) {
    if (!a) {
      let a;
      switch (typeof b) {
        case "object": a = s(t(b)); break;
        default: a = s(b);
      }
      return a
    }
    return { states: a }
  }

  function e({ pc0: a, actions: b, states: c, composite: e, transitions: f, pc: g, id: h, componentName: i, deterministic: j, lax: k, enforceAllowedTransitions: l, stateDiagram: m }) {
    const o = d(c, f), p = n(o.states);
    b = b || o.actions;
    const q = j ? [a => c => {
      if (!c.__stateMachineId || c.__stateMachineId === h) {
        const d = u(a, i, g);
        if (!l || l && o.states[d].transitions.includes(c.__actionName)) v(a, i, `${g}_1`, d), v(a, i, g, r(b, c.__actionName)), y(m, u(a, i, g), d, c.__actionName);
        else if (e) {
          const g = n(w(b, f)).map(a => a === c.__actionName).reduce((a, b) => b || a, !1);
          g && u(a, e.onState?.component, e.onState?.pc) === e.onState?.label && (a.__error = `unexpected action ${c.__actionName} for state: ${d}`)
        } else a.__error = `unexpected action ${c.__actionName} for state: ${d}`
      }
    }] : p.map(a => o.states[a].acceptor);
    return q.unshift(a => b => { a.__actionName = b.__actionName, a.__stateMachineIdForLastAction = b.__stateMachineId }, a => () => { a.__allowedActions = [], a.__disallowedActions = [] }), q
  }

  function f({ states: a, composite: b, transitions: c, pc: e, componentName: f }) {
    const g = d(a, c), h = n(g.states), i = h.map(a => m(g.states[a].naps).map(b => ({ state: a, condition: b.condition, nextAction: b.nextAction }))).flat().map(a => b => () => {
      if (b[e] === a.state && a.condition(b)) return a.nextAction(b), !1
    });
    return b ? i.concat(b.transitions.map(a => b => () => {
      if (b[e] === a.onState) return a.action(a.proposal.reduce((a, c) => p(a, { [c]: b[c] }), {})), !1
    })) : i
  }

  function g({ pc0: a, actions: b, states: c, transitions: e, deterministic: f }) {
    const g = d(c, e);
    b = b || g.actions;
    let h;
    const i = n(c).map(a => (h = l(h) || l(c[a]?.transitions) && l(k(c[a].transitions)) ? void 0 : a, m(c[a].transitions).map(d => {
      const e = m(c[a].guards).reduce((b, a) => a.action === d ? k(a.condition.toString().split("return")[1]).split(";") : b, void 0);
      return z(a, k(b[d]), d, e)
    }).join("\n"))).join("\n"), j = `
digraph fsm_diagram {
rankdir=LR;
size="8,5"
${a} [shape = circle margin=0 fixedsize=true width=0.33 fontcolor=black style=filled color=black label="\\n\\n\\n${a}"]
${h ? `${h} [shape = doublecircle margin=0 style=filled fontcolor=white color=black]` : "\n"}
node [shape = Mrecord];
${i}
}
    `;
    return j
  }

  function h(a, b, c) {
    return b.actions = {}, b.states = { [a]: { transitions: [] } }, b.step = 0, () => g({ pc0: a, actions: b.actions, states: b.states, deterministic: c })
  }

  function i({ componentName: a, pc0: d, actions: i, transitions: j, states: k, composite: l, pc: m = "pc", deterministic: n = !1, lax: o = !0, enforceAllowedTransitions: p = !1, blockUnexpectedActions: q = !1, stateDiagram: r = {}, id: s = Date.now() + Math.floor(1e8 * Math.random()) }) {
    return {
      id: s,
      initialState: b => (v(b, a, m, d), b.__actionName = void 0, b),
      addAction: b(i, s),
      stateMachine: c({ id: s, componentName: a, pc0: d, actions: i, states: k, composite: l, transitions: j, pc: m, deterministic: n, lax: o, enforceAllowedTransitions: p, blockUnexpectedActions: q, stateDiagram: r }),
      acceptors: e({ id: s, componentName: a, pc0: d, actions: i, states: k, composite: l, transitions: j, pc: m, deterministic: n, lax: o, enforceAllowedTransitions: p, stateDiagram: r }),
      naps: f({ id: s, states: k, componentName: a, composite: l, pc: m }),
      event: a => { const b = () => ({ __actionName: a, __stateMachineId: s }); return b.__actionName = a, b.__stateMachineId = s, b },
      stateDiagram: g({ pc0: d, actions: i, transitions: j, states: k, deterministic: n }),
      runtimeStateDiagram: h(d, r, n)
    }
  }

  const j = (b, c) => (b.push(c), b);
  const k = a => a ? a[0] : void 0;
  const l = a => a !== void 0;
  const m = (a = []) => a;
  const n = (a = {}) => Object.keys(a);
  const p = (c, a = {}) => Object.assign(c, a);
  const q = a => "function" == typeof a;
  const r = (a, b) => k(a[b]);
  const s = a => ({
    pc0: k(a).from,
    states: a.reduce((a, b) => p(a, {
      [b.from]: { transitions: a[b.from] && a[b.from].transitions && k(a[b.from].transitions) ? j(a[b.from].transitions, b.on) : [b.on] },
      [b.to]: a[b.to] && k(a[b.to].transitions) ? a[b.to] : { transitions: b.to === b.from ? [b.on] : [] }
    }), {}),
    actions: a.reduce((b, a) => p(b, { [a.on]: [a.to] }), {}),
    deterministic: !0,
    enforceAllowedTransitions: !0
  });
  const t = a => n(a).reduce((b, c) => {
    const d = a[c], e = n(d);
    return b.concat(e.map(b => ({ from: c, to: d[b], on: b })))
  }, []);
  const u = (a, b, c = "pc") => b ? q(a.localState) ? a.localState(b)[c] : a.__components ? a.__components[b][c] : void 0 : a[c];
  const v = (a, b, c, d) => (b ? q(a.localState) ? a.localState(b)[c] = d : a.__components = { [b]: { [c]: d } } : a[c] = d, d);
  const w = (a, b) => a ? a : s(b).actions;
  const x = (a = 0, b = "other") => `${a}. ${b}`;
  const y = (b, c, d, e = "other") => {
    b.step = 1 + (b.step || 0);
    const f = x(b.step, e);
    b.states[c] || (b.states[c] = { transitions: [] });
    const g = b.actions[f];
    if (l(g) ? -1 === g.indexOf(c) && g.push(c) : b.actions[f] = [c], d) {
      const a = b.states[d];
      l(a) && -1 === a.transitions.indexOf(f) && a.transitions.push(f)
    }
  };
  const z = (a, b, c = "", d) => `${a} -> ${b} [label = "${c}${d ? `\\n${d}` : ""}"];`;

  i.flattenTransitions = t;
  i.actionsAndStatesFor = s;

  return { fsm: i };
})();

// ES Module exports
export const fsm = tpFSM.fsm;
export default tpFSM;
