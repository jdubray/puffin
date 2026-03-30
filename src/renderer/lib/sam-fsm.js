/**
 * SAM FSM - ES Module Wrapper
 * Wraps the UMD bundle for use in browser ES modules
 * @cognitive-fab/sam-fsm@1.0.0
 */

const tpFSM = (function () { 'use strict';

    // ISC License (ISC)
    // Copyright 2021 Jean-Jacques Dubray

    // Permission to use, copy, modify, and/or distribute this software for any purpose
    // with or without fee is hereby granted, provided that the above copyright notice
    // and this permission notice appear in all copies.

    // THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
    // REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND
    // FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT,
    // OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA
    // OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION,
    // ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

    function checkAction(actions, action) {
      const actionLabels = keys(actions);
      return actionLabels.includes(action);
    }
    const pushAction = (s, a) => {
      s.push(a);
      return s;
    };
    const first = arr => arr ? arr[0] : undefined;
    const keys = (o = {}) => Object.keys(o);
    const assign = (a, b = {}) => Object.assign(a, b);
    const isFunction = v => typeof v === 'function';
    const stateForAction = (actions, action) => first(actions[action]);
    const actionsAndStatesFor = transitions => ({
      pc0: first(transitions).from,
      states: transitions.reduce((s, t) => assign(s, {
        [t.from]: {
          transitions: s[t.from] && s[t.from].transitions && first(s[t.from].transitions) ? pushAction(s[t.from].transitions, t.on) : [t.on]
        },
        [t.to]: s[t.to] && first(s[t.to].transitions) ? s[t.to] : {
          transitions: t.to === t.from ? [t.on] : []
        }
      }), {}),
      actions: transitions.reduce((a, t) => assign(a, {
        [t.on]: [t.to]
      }), {}),
      deterministic: true,
      enforceAllowedTransitions: true
    });
    const flattenTransitions = transitions => keys(transitions).reduce((ft, t) => {
      const state = transitions[t];
      const actions = keys(state);
      return ft.concat(actions.map(a => ({
        from: t,
        to: state[a],
        on: a
      })));
    }, []);
    function addAction(actions, id) {
      return function (intent, action) {
        if (checkAction(actions, action) && intent != null) {
          const wrapped = async function () {
            const proposal = (await intent.apply(this, arguments)) || {};
            proposal.__actionName = action;
            proposal.__stateMachineId = id;
            return proposal;
          };
          wrapped.__actionName = action;
          wrapped.__stateMachineId = id;
          return wrapped;
        }
        throw new Error(`addAction invalid action: ${action}`);
      };
    }
    const modelGetValue = (model, componentName, key = 'pc') => componentName ? isFunction(model.localState) ? model.localState(componentName)[key] : model.__components ? model.__components[componentName][key] : undefined : model[key];
    const modelSetValue = (model, componentName, key, value) => {
      if (componentName) {
        if (isFunction(model.localState)) {
          model.localState(componentName)[key] = value;
        } else {
          model.__components = model.__components || {};
          model.__components[componentName] = model.__components[componentName] || {};
          model.__components[componentName][key] = value;
        }
      } else {
        model[key] = value;
      }
      return value;
    };
    function stateMachineReactor({
      pc0,
      actions,
      transitions,
      states,
      composite,
      pc = 'pc',
      id,
      componentName,
      deterministic = false,
      lax = true,
      enforceAllowedTransitions = false,
      blockUnexpectedActions = false
    }) {
      const specification = getStatesFrom(states, transitions);
      const stateLabels = keys(specification.states);
      const smr = [model => () => {
        const previousState = modelGetValue(model, componentName, `${pc}_1`);
        const currentState = modelGetValue(model, componentName, pc);
        const actionName = model.__actionName;
        const stateMachineId = model.__stateMachineIdForLastAction;
        if (!lax && !stateLabels.includes(currentState)) {
          model.__error = `unexpected state: ${currentState}`;
        } else {
          try {
            if (actionName && previousState && !specification.states[previousState].transitions.includes(actionName)) {
              if (stateMachineId === id) {
                model.__error = `unexpected action ${actionName} for state: ${previousState}`;
              }
            }
          } catch (e) {
            model.__error = `unexpected error: ${e.message} for action ${actionName} and state: ${currentState}`;
          }
        }
      }];
      if (blockUnexpectedActions) {
        smr.push(model => () => {
          var _model$__allowedActio;
          const currentState = modelGetValue(model, componentName, pc);
          const {
            transitions = [],
            guards = []
          } = specification.states[currentState];
          model.__blockUnexpectedActions = true;
          model.__allowedActions = ((_model$__allowedActio = model.__allowedActions) !== null && _model$__allowedActio !== void 0 ? _model$__allowedActio : []).concat(transitions.filter(t => guards.reduce((f, g) => g.action === '*' || (g.action || first(transitions)) === t ? f && g.condition(model) : f, true)));
          if (model.allowedActions().length === 0) {
            model.__allowedActions = ['__EMPTY'];
          }
        });
      }
      if (composite) {
        smr.push(model => () => {
          var _composite$onState;
          const currentParentState = modelGetValue(model, composite.onState.component, composite.onState.pc);
          if (currentParentState !== ((_composite$onState = composite.onState) === null || _composite$onState === void 0 ? void 0 : _composite$onState.label)) {
            var _model$__disallowedAc;
            model.__disallowedActions = (_model$__disallowedAc = model.__disallowedActions) !== null && _model$__disallowedAc !== void 0 ? _model$__disallowedAc : [].concat(keys(actions));
          }
        });
      }
      return smr;
    }
    function getStatesFrom(states, transitions) {
      if (!states) {
        let specification;
        switch (typeof transitions) {
          case 'object':
            specification = actionsAndStatesFor(flattenTransitions(transitions));
            break;
          default:
            specification = actionsAndStatesFor(transitions);
        }
        return specification;
      } else {
        return {
          states
        };
      }
    }
    const actionsFor = (actions, transitions) => actions ? actions : actionsAndStatesFor(transitions).actions;
    const step = (step = 0, value = 'other') => `${step}. ${value}`;
    const updateRuntime = (stateMachine, currentState, previousState, action = 'other') => {
      stateMachine.step = 1 + (stateMachine.step || 0);
      const actionLabel = step(stateMachine.step, action);
      if (!stateMachine.states[currentState]) {
        stateMachine.states[currentState] = {
          transitions: []
        };
      }
      const a = stateMachine.actions[actionLabel];
      if (a == null) {
        stateMachine.actions[actionLabel] = [currentState];
      } else {
        a.indexOf(currentState) === -1 && a.push(currentState);
      }
      if (previousState) {
        const p = stateMachine.states[previousState];
        if (p != null) {
          p.transitions.indexOf(actionLabel) === -1 && p.transitions.push(actionLabel);
        }
      }
    };
    function stateMachineAcceptors({
      pc0,
      actions,
      states,
      composite,
      transitions,
      pc,
      id,
      componentName,
      deterministic,
      lax,
      enforceAllowedTransitions,
      stateDiagram
    }) {
      const specification = getStatesFrom(states, transitions);
      const stateLabels = keys(specification.states);
      actions = actions || specification.actions;
      const acceptors = deterministic ? [model => proposal => {
        if (!proposal.__stateMachineId || proposal.__stateMachineId === id) {
          const currentState = modelGetValue(model, componentName, pc);
          if (!enforceAllowedTransitions || enforceAllowedTransitions && specification.states[currentState].transitions.includes(proposal.__actionName)) {
            modelSetValue(model, componentName, `${pc}_1`, currentState);
            modelSetValue(model, componentName, pc, stateForAction(actions, proposal.__actionName));
            updateRuntime(stateDiagram, modelGetValue(model, componentName, pc), currentState, proposal.__actionName);
          } else {
            if (composite) {
              var _composite$onState2, _composite$onState3, _composite$onState4;
              const actionFromComposite = keys(actionsFor(actions, transitions)).map(action => action === proposal.__actionName).reduce((acc, v) => v || acc, false);
              if (actionFromComposite && modelGetValue(model, (_composite$onState2 = composite.onState) === null || _composite$onState2 === void 0 ? void 0 : _composite$onState2.component, (_composite$onState3 = composite.onState) === null || _composite$onState3 === void 0 ? void 0 : _composite$onState3.pc) === ((_composite$onState4 = composite.onState) === null || _composite$onState4 === void 0 ? void 0 : _composite$onState4.label)) {
                model.__error = `unexpected action ${proposal.__actionName} for state: ${currentState}`;
              }
            } else {
              model.__error = `unexpected action ${proposal.__actionName} for state: ${currentState}`;
            }
          }
        }
      }] : stateLabels.map(label => specification.states[label].acceptor);
      acceptors.unshift(model => proposal => {
        model.__actionName = proposal.__actionName;
        model.__stateMachineIdForLastAction = proposal.__stateMachineId;
      }, model => proposal => {
        if (model.__lastAllowedActionsReset !== proposal) {
          model.__allowedActions = [];
          model.__disallowedActions = [];
          model.__lastAllowedActionsReset = proposal;
        }
      });
      return acceptors;
    }
    function stateMachineNaps({
      states,
      composite,
      transitions,
      pc,
      componentName
    }) {
      const specification = getStatesFrom(states, transitions);
      const stateLabels = keys(specification.states);
      const fsmNaps = stateLabels.map(state => {
        var _specification$states, _specification$states2;
        return (_specification$states = (_specification$states2 = specification.states[state]) === null || _specification$states2 === void 0 || (_specification$states2 = _specification$states2.naps) === null || _specification$states2 === void 0 ? void 0 : _specification$states2.map(nap => ({
          state,
          condition: nap.condition,
          nextAction: nap.nextAction
        }))) !== null && _specification$states !== void 0 ? _specification$states : [];
      }).flat().map(predicate => state => () => {
        if (modelGetValue(state, componentName, pc) === predicate.state && predicate.condition(state)) {
          predicate.nextAction(state);
          return true;
        }
      });
      if (composite) {
        return fsmNaps.concat(composite.transitions.map(t => state => () => {
          if (modelGetValue(state, componentName, pc) === t.onState) {
            t.action(t.proposal.reduce((o, key) => assign(o, {
              [key]: state[key]
            }), {}));
            return true;
          }
        }));
      }
      return fsmNaps;
    }
    const gvt = (start, end, action = '', condition) => `${start} -> ${end} [label = "${action}${condition ? `\\n${condition}` : ''}"];`;
    function renderGraphViz({
      pc0,
      actions,
      states,
      transitions,
      deterministic
    }) {
      const specification = getStatesFrom(states, transitions);
      actions = actions || specification.actions;
      let pcEnd;
      const graphVizTransitions = keys(states).map(state => {
        var _states$state, _states$state2;
        pcEnd = pcEnd == null && (((_states$state = states[state]) === null || _states$state === void 0 ? void 0 : _states$state.transitions) == null || first(states[state].transitions) == null) ? state : undefined;
        return (_states$state2 = states[state]) === null || _states$state2 === void 0 || (_states$state2 = _states$state2.transitions) === null || _states$state2 === void 0 ? void 0 : _states$state2.map(transition => {
          var _states$state3;
          const condition = (_states$state3 = states[state]) === null || _states$state3 === void 0 || (_states$state3 = _states$state3.guards) === null || _states$state3 === void 0 ? void 0 : _states$state3.reduce((a, c) => {
            if (c.action !== transition) return a;
            const parts = c.condition.toString().split('return');
            return parts.length > 1 ? first(parts[1]).split(';') : [c.condition.toString()];
          }, undefined);
          return gvt(state, first(actions[transition]), transition, condition);
        }).join('\n');
      }).join('\n');
      const output = `
digraph fsm_diagram {
rankdir=LR;
size="8,5"
${pc0} [shape = circle margin=0 fixedsize=true width=0.33 fontcolor=black style=filled color=black label="\\n\\n\\n${pc0}"]
${pcEnd ? `${pcEnd} [shape = doublecircle margin=0 style=filled fontcolor=white color=black]` : '\n'}
node [shape = Mrecord];
${graphVizTransitions}
}
    `;
      return output;
    }
    function runTimeStateDiagram(pc0, stateDiagram, deterministic) {
      stateDiagram.actions = {};
      stateDiagram.states = {
        [pc0]: {
          transitions: []
        }
      };
      stateDiagram.step = 0;
      return () => renderGraphViz({
        pc0,
        actions: stateDiagram.actions,
        states: stateDiagram.states,
        deterministic
      });
    }
    function fsm({
      componentName,
      pc0,
      actions,
      transitions,
      states,
      composite,
      pc = 'pc',
      deterministic = false,
      lax = true,
      enforceAllowedTransitions = false,
      blockUnexpectedActions = false,
      stateDiagram = {},
      id = Date.now() + Math.floor(Math.random() * 100000000)
    }) {
      return {
        id,
        initialState: model => {
          modelSetValue(model, componentName, pc, pc0);
          model.__actionName = undefined;
          return model;
        },
        addAction: addAction(actions, id),
        stateMachine: stateMachineReactor({
          id,
          componentName,
          pc0,
          actions,
          states,
          composite,
          transitions,
          pc,
          deterministic,
          lax,
          enforceAllowedTransitions,
          blockUnexpectedActions}),
        acceptors: stateMachineAcceptors({
          id,
          componentName,
          pc0,
          actions,
          states,
          composite,
          transitions,
          pc,
          deterministic,
          lax,
          enforceAllowedTransitions,
          stateDiagram
        }),
        naps: stateMachineNaps({
          states,
          componentName,
          composite,
          pc
        }),
        event: eventName => {
          const action = () => ({
            __actionName: eventName,
            __stateMachineId: id
          });
          action.__actionName = eventName;
          action.__stateMachineId = id;
          return action;
        },
        stateDiagram: renderGraphViz({
          pc0,
          actions,
          transitions,
          states,
          deterministic
        }),
        runtimeStateDiagram: runTimeStateDiagram(pc0, stateDiagram, deterministic)
      };
    }
    fsm.flattenTransitions = flattenTransitions;
    fsm.actionsAndStatesFor = actionsAndStatesFor;

    // ISC License (ISC)
    // Copyright 2019 Jean-Jacques Dubray

    var index = {
      fsm
    };

    return index;

})();

// ES Module exports
export const fsm = tpFSM.fsm;
export default tpFSM;
