/**
 * Assertion Evaluators Index
 *
 * Exports all type-specific assertion evaluators.
 *
 * @module evaluators/index
 */

const { BaseEvaluator } = require('./base-evaluator')
const { FileExistsEvaluator } = require('./file-exists')
const { FileContainsEvaluator } = require('./file-contains')
const { JsonPropertyEvaluator } = require('./json-property')
const { ExportExistsEvaluator } = require('./export-exists')
const { ClassStructureEvaluator } = require('./class-structure')
const { FunctionSignatureEvaluator } = require('./function-signature')
const { ImportExistsEvaluator } = require('./import-exists')
const { IpcHandlerEvaluator } = require('./ipc-handler')
const { CssSelectorEvaluator } = require('./css-selector')
const { PatternMatchEvaluator } = require('./pattern-match')

module.exports = {
  BaseEvaluator,
  FileExistsEvaluator,
  FileContainsEvaluator,
  JsonPropertyEvaluator,
  ExportExistsEvaluator,
  ClassStructureEvaluator,
  FunctionSignatureEvaluator,
  ImportExistsEvaluator,
  IpcHandlerEvaluator,
  CssSelectorEvaluator,
  PatternMatchEvaluator
}
