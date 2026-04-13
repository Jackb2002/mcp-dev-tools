/**
 * Expression Evaluation
 * Handles safe evaluation of debug expressions
 */

import { EvaluationResult, Variable } from '../types'

export interface EvaluationContext {
  frameId?: number
  context?: 'watch' | 'repl' | 'hover'
  variables?: Map<string, Variable>
}

/**
 * Evaluates expressions in a debugging context
 * Supports variable inspection, property access, and method calls
 */
export class Evaluator {
  /**
   * Parse and validate an expression before evaluation
   */
  static validateExpression(expr: string): { valid: boolean; error?: string } {
    // Check for dangerous patterns
    if (
      expr.includes('process.exit') ||
      expr.includes('__dirname') ||
      expr.includes('require(') ||
      expr.includes('import(')
    ) {
      return {
        valid: false,
        error: 'Expression contains restricted operations'
      }
    }

    // Validate basic syntax
    try {
      new Function(`return (${expr})`)
      return { valid: true }
    } catch (e) {
      return {
        valid: false,
        error: (e as Error).message
      }
    }
  }

  /**
   * Safely evaluate an expression
   */
  static async evaluate(
    expr: string,
    context?: EvaluationContext
  ): Promise<EvaluationResult> {
    const validation = this.validateExpression(expr)
    if (!validation.valid) {
      return {
        value: `<error: ${validation.error}>`,
        type: 'error',
        variablesReference: 0
      }
    }

    try {
      // Create a safe scope with available variables
      const scope: Record<string, unknown> = {}

      if (context?.variables) {
        for (const [name, variable] of context.variables) {
          // Try to convert value back to JS value (simple types only)
          scope[name] = this.parseValue(variable.value)
        }
      }

      // Evaluate in restricted scope
      const fn = new Function(...Object.keys(scope), `return (${expr})`)
      const result = fn(...Object.values(scope))

      return {
        value: String(result),
        type: typeof result,
        variablesReference: 0
      }
    } catch (e) {
      return {
        value: `<error: ${(e as Error).message}>`,
        type: 'error',
        variablesReference: 0
      }
    }
  }

  /**
   * Get property access on an object
   */
  static getProperty(
    obj: unknown,
    prop: string
  ): EvaluationResult {
    try {
      if (obj === null || obj === undefined) {
        return {
          value: '<null>',
          type: 'null',
          variablesReference: 0
        }
      }

      const value = (obj as Record<string, unknown>)[prop]

      return {
        value: String(value),
        type: typeof value,
        variablesReference: 0
      }
    } catch (e) {
      return {
        value: `<error: ${(e as Error).message}>`,
        type: 'error',
        variablesReference: 0
      }
    }
  }

  /**
   * Convert string representation back to JS value (simple types)
   */
  private static parseValue(str: string): unknown {
    // Handle common representations
    if (str === 'null' || str === '<null>') return null
    if (str === 'undefined' || str === '<undefined>') return undefined
    if (str === 'true') return true
    if (str === 'false') return false

    // Try number
    const num = parseFloat(str)
    if (!isNaN(num)) return num

    // Default to string
    return str
  }
}

/**
 * Lazy evaluation support for complex expressions
 */
export class LazyEvaluator {
  private cache: Map<string, EvaluationResult> = new Map()
  private ttl: number // milliseconds

  constructor(ttl: number = 5000) {
    this.ttl = ttl
  }

  async evaluate(expr: string, context?: EvaluationContext): Promise<EvaluationResult> {
    const cached = this.cache.get(expr)
    if (cached) {
      return cached
    }

    const result = await Evaluator.evaluate(expr, context)
    this.cache.set(expr, result)

    // Expire cache after TTL
    setTimeout(() => {
      this.cache.delete(expr)
    }, this.ttl)

    return result
  }

  clear(): void {
    this.cache.clear()
  }
}
