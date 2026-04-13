/**
 * .NET-specific Debugging - LINQ Query Evaluation
 * Evaluates LINQ queries and inspects IEnumerable states
 */

import { Variable, EvaluationResult } from '../../types'

/**
 * LINQ query execution stage
 */
export enum LINQStage {
  Source = 'Source',
  WhereClause = 'WhereClause',
  SelectClause = 'SelectClause',
  OrderBy = 'OrderBy',
  Grouping = 'Grouping',
  Join = 'Join',
  Aggregation = 'Aggregation'
}

/**
 * Information about an IEnumerable at a point in LINQ chain
 */
export interface LINQEnumerableInfo {
  variableName: string
  type: string
  isIEnumerable: boolean
  isIQueryable: boolean
  isAsync: boolean

  // Enumeration details
  elementType?: string
  isEnumerated: boolean
  enumeratedCount: number
  enumeratedElements?: unknown[]

  // LINQ chain
  chainLength: number
  stages: LINQStage[]

  // Query tree (for IQueryable)
  queryExpression?: string
  compiledQuery?: boolean
}

/**
 * Evaluates LINQ queries and collections
 */
export class LINQEvaluator {
  /**
   * Analyze an IEnumerable variable
   */
  static analyzeLINQVariable(variable: Variable): LINQEnumerableInfo {
    const isQueryable = (variable.type || '').includes('IQueryable')
    const isAsync = (variable.type || '').includes('Async')
    const isEnumerable = (variable.type || '').includes('IEnumerable')

    const elementType = this.extractElementType(variable.type)

    return {
      variableName: variable.name,
      type: variable.type || 'Unknown',
      isIEnumerable: isEnumerable,
      isIQueryable: isQueryable,
      isAsync,
      elementType,
      isEnumerated: false,
      enumeratedCount: 0,
      chainLength: 1,
      stages: [LINQStage.Source]
    }
  }

  /**
   * Detect LINQ operators in a query expression
   */
  static detectOperators(expression: string): string[] {
    const operators = [
      'Where',
      'Select',
      'SelectMany',
      'OrderBy',
      'OrderByDescending',
      'ThenBy',
      'ThenByDescending',
      'GroupBy',
      'Join',
      'GroupJoin',
      'Distinct',
      'Skip',
      'Take',
      'Union',
      'Intersect',
      'Except',
      'Concat',
      'First',
      'FirstOrDefault',
      'Last',
      'LastOrDefault',
      'Single',
      'SingleOrDefault',
      'Count',
      'Sum',
      'Average',
      'Min',
      'Max',
      'Any',
      'All',
      'Contains',
      'OfType',
      'Cast',
      'ToList',
      'ToArray',
      'ToDictionary',
      'ToLookup'
    ]

    const found: string[] = []
    for (const op of operators) {
      if (expression.includes(`.${op}(`)) {
        found.push(op)
      }
    }

    return found
  }

  /**
   * Parse query and suggest optimizations
   */
  static suggestOptimizations(info: LINQEnumerableInfo): string[] {
    const suggestions: string[] = []

    // Multiple enumerations
    if (info.chainLength > 3) {
      suggestions.push('Consider materializing with ToList() to avoid multiple enumerations')
    }

    // Async patterns
    if (info.isAsync) {
      suggestions.push('Use await foreach for async LINQ operations')
    }

    // Queryable efficiency
    if (info.isIQueryable) {
      suggestions.push('IQueryable will be translated to the data source query language')
      suggestions.push('Use .AsEnumerable() to switch to LINQ to Objects when needed')
    }

    return suggestions
  }

  /**
   * Extract element type from IEnumerable<T>
   */
  private static extractElementType(type?: string): string | undefined {
    if (!type) return undefined

    const match = type.match(/IEnumerable<(.+?)>|IQueryable<(.+?)>/)
    return match ? match[1] || match[2] : undefined
  }
}

/**
 * Evaluates LINQ query expressions
 */
export class LINQQueryEvaluator {
  /**
   * Safely evaluate a LINQ query
   */
  static async evaluateQuery(
    query: string,
    variables: Map<string, Variable>
  ): Promise<EvaluationResult> {
    // Validate query syntax
    if (!this.isValidLINQQuery(query)) {
      return {
        value: '<error: Invalid LINQ query syntax>',
        type: 'error',
        variablesReference: 0
      }
    }

    try {
      // Build safe evaluation context
      const scope: Record<string, unknown> = {}

      for (const [name, variable] of variables) {
        // Only include IEnumerable variables
        if ((variable.type || '').includes('IEnumerable') || (variable.type || '').includes('IQueryable')) {
          scope[name] = [] // Placeholder
        }
      }

      // Note: In a real implementation, this would execute against the debuggee's
      // runtime using the debug adapter API, not eval()
      return {
        value: '<query result>',
        type: 'IEnumerable',
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
   * Validate LINQ query syntax
   */
  private static isValidLINQQuery(query: string): boolean {
    // Check for dangerous patterns
    if (query.includes('process') || query.includes('System.Diagnostics')) {
      return false
    }

    // Check for basic LINQ pattern
    return /\.(Where|Select|OrderBy|GroupBy|Join|Count|Any|First|Last)\(/.test(query)
  }

  /**
   * Format LINQ results for display
   */
  static formatResults(results: unknown[], _elementType?: string): string {
    if (results.length === 0) {
      return '(empty sequence)'
    }

    if (results.length > 100) {
      return `[${results.length} items] (first 100 shown)`
    }

    return `[${results.length} items]`
  }
}
