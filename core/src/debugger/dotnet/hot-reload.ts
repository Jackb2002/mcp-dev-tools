/**
 * .NET-specific Debugging - Hot Reload Integration
 * Supports live code editing and hot reload during debugging
 */

import { CodeEdit } from '../../types'

/**
 * Hot reload capability information
 */
export interface HotReloadCapability {
  supportsApplyChanges: boolean
  supportsEditAndContinue: boolean
  supportsRuntimeUpdates: boolean
  restrictedEdits: string[]
  maximumFileSize: number
  supportedLanguages: string[]
}

/**
 * Represents a pending hot reload change
 */
export interface HotReloadChange {
  id: string
  file: string
  originalContent: string
  newContent: string
  status: 'pending' | 'applied' | 'failed' | 'reverted'
  errorMessage?: string
  timestamp: number
}

/**
 * Hot reload session for tracking changes
 */
export interface HotReloadSession {
  id: string
  startTime: number
  changes: HotReloadChange[]
  isActive: boolean
}

/**
 * Manages hot reload operations
 */
export class HotReloadManager {
  private sessions: Map<string, HotReloadSession> = new Map()
  private sessionCount = 0

  /**
   * Create a new hot reload session
   */
  createSession(): HotReloadSession {
    const id = `session-${++this.sessionCount}`
    const session: HotReloadSession = {
      id,
      startTime: Date.now(),
      changes: [],
      isActive: true
    }

    this.sessions.set(id, session)
    return session
  }

  /**
   * Get active hot reload session
   */
  getActiveSession(): HotReloadSession | null {
    for (const session of this.sessions.values()) {
      if (session.isActive) {
        return session
      }
    }
    return null
  }

  /**
   * Apply a code edit via hot reload
   */
  async applyEdit(sessionId: string, edit: CodeEdit): Promise<HotReloadChange> {
    const session = this.sessions.get(sessionId)
    if (!session) {
      throw new Error(`Session ${sessionId} not found`)
    }

    const change: HotReloadChange = {
      id: `edit-${Date.now()}`,
      file: edit.file,
      originalContent: edit.oldContent || '',
      newContent: edit.newContent,
      status: 'pending',
      timestamp: Date.now()
    }

    // Validate the change
    const validation = this.validateEdit(edit)
    if (!validation.valid) {
      change.status = 'failed'
      change.errorMessage = validation.error
      session.changes.push(change)
      return change
    }

    // In a real implementation, send to debug adapter
    // For now, mark as pending
    session.changes.push(change)
    return change
  }

  /**
   * Apply all pending changes in a session
   */
  async applyAllChanges(sessionId: string): Promise<{ successful: number; failed: number }> {
    const session = this.sessions.get(sessionId)
    if (!session) {
      throw new Error(`Session ${sessionId} not found`)
    }

    let successful = 0
    let failed = 0

    for (const change of session.changes) {
      if (change.status === 'pending') {
        // In a real implementation, apply via debug adapter
        change.status = 'applied'
        successful++
      }
    }

    return { successful, failed }
  }

  /**
   * Revert a specific change
   */
  revertChange(sessionId: string, changeId: string): boolean {
    const session = this.sessions.get(sessionId)
    if (!session) return false

    const change = session.changes.find((c) => c.id === changeId)
    if (!change) return false

    change.status = 'reverted'
    return true
  }

  /**
   * Validate an edit before applying
   */
  private validateEdit(edit: CodeEdit): { valid: boolean; error?: string } {
    // Check file extension
    if (!this.isSupportedFile(edit.file)) {
      return { valid: false, error: 'Unsupported file type' }
    }

    // Check content length
    if (edit.newContent.length > 1024 * 1024) {
      return { valid: false, error: 'Edit too large (> 1MB)' }
    }

    // Validate syntax (simplified)
    if (!this.hasSyntax(edit.newContent)) {
      return { valid: false, error: 'Invalid C# syntax' }
    }

    return { valid: true }
  }

  /**
   * Check if file type supports hot reload
   */
  private isSupportedFile(file: string): boolean {
    return file.endsWith('.cs') || file.endsWith('.xaml.cs')
  }

  /**
   * Basic syntax validation
   */
  private hasSyntax(content: string): boolean {
    // Very basic check - in reality would use a proper parser
    const openBraces = (content.match(/{/g) || []).length
    const closeBraces = (content.match(/}/g) || []).length
    return openBraces === closeBraces
  }

  /**
   * End a hot reload session
   */
  endSession(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (session) {
      session.isActive = false
    }
  }

  /**
   * Get session history
   */
  getSessions(): HotReloadSession[] {
    return Array.from(this.sessions.values())
  }
}

/**
 * Validates edits against Edit and Continue restrictions
 */
export class EditAndContinueValidator {
  /**
   * Get capabilities for a specific .NET runtime version
   */
  static getCapabilities(runtimeVersion: string): HotReloadCapability {
    // .NET 6+ has rich hot reload capabilities
    const isModern = parseFloat(runtimeVersion) >= 6

    return {
      supportsApplyChanges: true,
      supportsEditAndContinue: isModern,
      supportsRuntimeUpdates: isModern,
      restrictedEdits: [
        'Adding methods to types',
        'Adding fields to types',
        'Changing method signatures',
        'Removing methods or fields',
        'Changing generic parameters',
        'Changing base types',
        'Adding interfaces'
      ],
      maximumFileSize: 1024 * 1024, // 1 MB
      supportedLanguages: ['C#']
    }
  }

  /**
   * Check if an edit is allowed by Edit and Continue rules
   */
  static isEditAllowed(oldCode: string, newCode: string): { allowed: boolean; reason?: string } {
    // Simple heuristic checks
    if (this.addedMethods(oldCode, newCode)) {
      return { allowed: false, reason: 'Cannot add methods during debugging' }
    }

    if (this.changedMethodSignature(oldCode, newCode)) {
      return { allowed: false, reason: 'Cannot change method signatures' }
    }

    if (this.changedInheritance(oldCode, newCode)) {
      return { allowed: false, reason: 'Cannot change base types or interfaces' }
    }

    return { allowed: true }
  }

  private static addedMethods(oldCode: string, newCode: string): boolean {
    const oldMethodCount = (oldCode.match(/\b(public|private|protected|internal)\s+\w+\s+\w+\s*\(/g) || [])
      .length
    const newMethodCount = (newCode.match(/\b(public|private|protected|internal)\s+\w+\s+\w+\s*\(/g) || [])
      .length

    return newMethodCount > oldMethodCount
  }

  private static changedMethodSignature(oldCode: string, newCode: string): boolean {
    // Extract method signatures and compare
    const oldSigs = this.extractMethodSignatures(oldCode)
    const newSigs = this.extractMethodSignatures(newCode)

    // Very simple check - real implementation would use parser
    return oldSigs.some((sig) => !newSigs.includes(sig))
  }

  private static changedInheritance(oldCode: string, newCode: string): boolean {
    const oldInherit = (oldCode.match(/class\s+\w+\s*:\s*\w+/g) || []).join()
    const newInherit = (newCode.match(/class\s+\w+\s*:\s*\w+/g) || []).join()

    return oldInherit !== newInherit
  }

  private static extractMethodSignatures(code: string): string[] {
    const regex = /\b(public|private|protected|internal)\s+\w+\s+\w+\s*\([^)]*\)/g
    return (code.match(regex) || []).map((sig) => sig.trim())
  }
}
