/**
 * .NET-specific Debugging - Roslyn Type Inspection
 * Provides rich type information, member inspection, and code analysis
 */

import { TypeInfo, Variable } from '../../types'

/**
 * Rich .NET type information via Roslyn code analysis
 */
export interface RoslynTypeInfo extends TypeInfo {
  // Base type info
  name: string
  namespace: string
  baseName?: string
  interfaces: string[]
  isGeneric: boolean
  genericArguments?: string[]
  isNullable: boolean
  isValueType: boolean

  // Members
  properties: RoslynMember[]
  fields: RoslynMember[]
  methods: RoslynMethod[]
  events: RoslynMember[]

  // Metadata
  attributes: RoslynAttribute[]
  documentation?: string
  assemblyName: string
  version: string
}

export interface RoslynMember {
  name: string
  type: string
  accessibility: 'public' | 'private' | 'protected' | 'internal'
  isStatic: boolean
  isReadOnly: boolean
  hasGetter: boolean
  hasSetter: boolean
  value?: string
}

export interface RoslynMethod {
  name: string
  returnType: string
  parameters: RoslynParameter[]
  accessibility: 'public' | 'private' | 'protected' | 'internal'
  isStatic: boolean
  isAsync: boolean
  isVirtual: boolean
  isAbstract: boolean
  documentation?: string
}

export interface RoslynParameter {
  name: string
  type: string
  isRef: boolean
  isOut: boolean
  isParams: boolean
  defaultValue?: string
}

export interface RoslynAttribute {
  name: string
  assembly?: string
  arguments: Record<string, unknown>
}

/**
 * Analyzes .NET types and objects with Roslyn integration
 */
export class RoslynAnalyzer {
  /**
   * Get comprehensive type information for a variable
   */
  static getTypeInfo(variable: Variable): RoslynTypeInfo {
    // In a real implementation, this would use the debugger's
    // Roslyn API to inspect the actual type at runtime
    // For now, we return a structured template

    const typeMatch = variable.type?.match(/^([^.]+\.)*([^.<]+)/)
    const baseName = typeMatch?.[2] || variable.type

    return {
      name: baseName || 'Unknown',
      namespace: variable.type?.split('.').slice(0, -1).join('.') || '',
      baseName: undefined,
      interfaces: [],
      isGeneric: (variable.type || '').includes('<'),
      genericArguments: this.extractGenericArgs(variable.type),
      isNullable: (variable.type || '').includes('?'),
      isValueType: this.isValueType(variable.type),
      properties: [],
      fields: [],
      methods: [],
      events: [],
      attributes: [],
      assemblyName: 'Unknown',
      version: '1.0.0'
    }
  }

  /**
   * Extract member information from a type
   */
  static getMembers(typeInfo: RoslynTypeInfo): RoslynMember[] {
    return [...typeInfo.properties, ...typeInfo.fields]
  }

  /**
   * Get methods for a type
   */
  static getMethods(typeInfo: RoslynTypeInfo): RoslynMethod[] {
    return typeInfo.methods
  }

  /**
   * Get base class and interface hierarchy
   */
  static getHierarchy(typeInfo: RoslynTypeInfo): string[] {
    const hierarchy: string[] = [typeInfo.name]

    if (typeInfo.baseName) {
      hierarchy.push(typeInfo.baseName)
    }

    hierarchy.push(...typeInfo.interfaces)

    return hierarchy
  }

  /**
   * Check if type is a .NET value type (struct, enum, primitive)
   */
  private static isValueType(typeName?: string): boolean {
    if (!typeName) return false

    const valueTypes = [
      'int',
      'uint',
      'long',
      'ulong',
      'short',
      'ushort',
      'byte',
      'sbyte',
      'float',
      'double',
      'decimal',
      'bool',
      'char',
      'DateTime',
      'TimeSpan',
      'Guid'
    ]

    for (const vt of valueTypes) {
      if (typeName.includes(vt)) return true
    }

    // Structs typically have 'Struct' in their kind
    return false
  }

  /**
   * Extract generic type arguments
   */
  private static extractGenericArgs(typeName?: string): string[] {
    if (!typeName || !typeName.includes('<')) return []

    const match = typeName.match(/<(.+)>/)
    if (!match) return []

    return match[1].split(',').map((arg) => arg.trim())
  }
}

/**
 * Provides method signature and overload information
 */
export class MethodInspector {
  static getSignature(method: RoslynMethod): string {
    const params = method.parameters
      .map((p) => `${p.type} ${p.name}${p.defaultValue ? ` = ${p.defaultValue}` : ''}`)
      .join(', ')

    const asyncPrefix = method.isAsync ? 'async ' : ''
    return `${asyncPrefix}${method.returnType} ${method.name}(${params})`
  }

  static getOverloads(methods: RoslynMethod[], name: string): RoslynMethod[] {
    return methods.filter((m) => m.name === name)
  }

  static canInvoke(method: RoslynMethod): boolean {
    // Can invoke if it's public and not abstract
    return method.accessibility === 'public' && !method.isAbstract
  }
}
