// @ts-nocheck - Skip TypeScript checking for mock implementations

export interface SecurityIssue {
  severity: 'low' | 'medium' | 'high' | 'critical'
  title: string
  description: string
  line?: number
  category: string
  recommendation: string
}

export interface ScanResult {
  contractAddress?: string
  sourceCode?: string
  issues: SecurityIssue[]
  score: number // 0-100, higher is better
  timestamp: number
}

export class SecurityScanner {
  private patterns: Array<{
    regex: RegExp
    severity: SecurityIssue['severity']
    title: string
    description: string
    category: string
    recommendation: string
  }> = []

  constructor() {
    this.initializePatterns()
  }

  private initializePatterns() {
    // Reentrancy vulnerabilities
    this.patterns.push({
      regex: /\.call\s*\(\s*[^)]*\)\s*;?\s*(?!.*require)/gi,
      severity: 'high',
      title: 'Potential Reentrancy Vulnerability',
      description: 'External call without proper checks could lead to reentrancy attacks',
      category: 'Reentrancy',
      recommendation: 'Use the Checks-Effects-Interactions pattern or ReentrancyGuard',
    })

    // Integer overflow/underflow
    this.patterns.push({
      regex: /(?:\+\+|\-\-|\+|\-|\*|\/)\s*(?!.*SafeMath|.*unchecked)/gi,
      severity: 'medium',
      title: 'Potential Integer Overflow/Underflow',
      description: 'Arithmetic operations without SafeMath or proper checks',
      category: 'Integer Overflow',
      recommendation: 'Use SafeMath library or Solidity 0.8+ built-in overflow protection',
    })

    // tx.origin usage
    this.patterns.push({
      regex: /tx\.origin/gi,
      severity: 'high',
      title: 'tx.origin Usage',
      description: 'Using tx.origin for authorization can be vulnerable to phishing attacks',
      category: 'Authorization',
      recommendation: 'Use msg.sender instead of tx.origin for authentication',
    })

    // Unchecked external calls
    this.patterns.push({
      regex: /\.call\s*\(\s*[^)]*\)\s*;(?!\s*require)/gi,
      severity: 'medium',
      title: 'Unchecked External Call',
      description: 'External call return value is not checked',
      category: 'External Calls',
      recommendation: 'Always check the return value of external calls',
    })

    // Deprecated functions
    this.patterns.push({
      regex: /(throw|suicide|sha3|block\.blockhash)/gi,
      severity: 'medium',
      title: 'Deprecated Function Usage',
      description: 'Using deprecated Solidity functions',
      category: 'Deprecated',
      recommendation: 'Replace with current alternatives (revert, selfdestruct, keccak256, blockhash)',
    })

    // Timestamp dependence
    this.patterns.push({
      regex: /(block\.timestamp|now)\s*[<>=]/gi,
      severity: 'low',
      title: 'Timestamp Dependence',
      description: 'Contract behavior depends on block timestamp which can be manipulated',
      category: 'Timestamp',
      recommendation: 'Avoid using timestamps for critical logic or use with caution',
    })

    // Uninitialized storage pointers
    this.patterns.push({
      regex: /struct\s+\w+\s+\w+\s*;(?!\s*\w+\s*=)/gi,
      severity: 'high',
      title: 'Uninitialized Storage Pointer',
      description: 'Uninitialized storage pointer can overwrite arbitrary storage slots',
      category: 'Storage',
      recommendation: 'Initialize storage variables properly',
    })

    // Delegatecall vulnerabilities
    this.patterns.push({
      regex: /\.delegatecall\s*\(/gi,
      severity: 'high',
      title: 'Delegatecall Usage',
      description: 'Delegatecall can be dangerous if target address is not trusted',
      category: 'Delegatecall',
      recommendation: 'Ensure delegatecall target is trusted and properly validated',
    })

    // Weak randomness
    this.patterns.push({
      regex: /(block\.timestamp|block\.difficulty|block\.number|blockhash).*random/gi,
      severity: 'medium',
      title: 'Weak Randomness',
      description: 'Using block properties for randomness is predictable',
      category: 'Randomness',
      recommendation: 'Use commit-reveal schemes or oracle-based randomness',
    })

    // Missing access controls
    this.patterns.push({
      regex: /function\s+\w+\s*\([^)]*\)\s+(?:public|external)(?!.*(?:onlyOwner|require\(|modifier))/gi,
      severity: 'medium',
      title: 'Missing Access Control',
      description: 'Public/external function without access control',
      category: 'Access Control',
      recommendation: 'Add appropriate access control modifiers or require statements',
    })
  }

  async scanSourceCode(sourceCode: string): Promise<ScanResult> {
    const issues: SecurityIssue[] = []
    const lines = sourceCode.split('\n')

    // Pattern-based scanning
    for (const pattern of this.patterns) {
      const matches = sourceCode.matchAll(pattern.regex)
      
      for (const match of matches) {
        if (match.index !== undefined) {
          const lineNumber = this.getLineNumber(sourceCode, match.index)
          
          issues.push({
            severity: pattern.severity,
            title: pattern.title,
            description: pattern.description,
            line: lineNumber,
            category: pattern.category,
            recommendation: pattern.recommendation,
          })
        }
      }
    }

    // Additional custom checks
    issues.push(...this.checkCustomVulnerabilities(sourceCode, lines))

    const score = this.calculateScore(issues)

    return {
      sourceCode,
      issues,
      score,
      timestamp: Date.now(),
    }
  }

  async scanDeployedContract(
    contractAddress: string,
    chainId: number,
    rpcUrl: string
  ): Promise<ScanResult> {
    try {
      const provider = new ethers.providers.JsonRpcProvider(rpcUrl)
      
      // Get contract bytecode
      const bytecode = await provider.getCode(contractAddress)
      
      if (bytecode === '0x') {
        throw new Error('No contract found at the given address')
      }

      // Analyze bytecode for common patterns
      const issues = this.analyzeBytecode(bytecode)
      const score = this.calculateScore(issues)

      return {
        contractAddress,
        issues,
        score,
        timestamp: Date.now(),
      }
    } catch (error) {
      throw new Error(`Failed to scan contract: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private checkCustomVulnerabilities(sourceCode: string, lines: string[]): SecurityIssue[] {
    const issues: SecurityIssue[] = []

    // Check for missing events on critical functions
    const transferRegex = /function\s+transfer\s*\(/gi
    const transferMatches = sourceCode.matchAll(transferRegex)
    
    for (const match of transferMatches) {
      if (match.index !== undefined) {
        const lineNumber = this.getLineNumber(sourceCode, match.index)
        const functionEnd = this.findFunctionEnd(sourceCode, match.index)
        const functionBody = sourceCode.slice(match.index, functionEnd)
        
        if (!functionBody.includes('emit')) {
          issues.push({
            severity: 'low',
            title: 'Missing Event Emission',
            description: 'Transfer function should emit events for transparency',
            line: lineNumber,
            category: 'Events',
            recommendation: 'Add appropriate event emissions for state changes',
          })
        }
      }
    }

    // Check for hardcoded addresses
    const addressRegex = /0x[a-fA-F0-9]{40}/g
    const addressMatches = sourceCode.matchAll(addressRegex)
    
    for (const match of addressMatches) {
      if (match.index !== undefined) {
        const lineNumber = this.getLineNumber(sourceCode, match.index)
        issues.push({
          severity: 'low',
          title: 'Hardcoded Address',
          description: 'Hardcoded addresses reduce contract flexibility',
          line: lineNumber,
          category: 'Hardcoded Values',
          recommendation: 'Consider using configurable addresses or constants',
        })
      }
    }

    // Check for gas optimization issues
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      
      // Check for state variable reads in loops
      if (line.includes('for') && (line.includes('.length') || line.includes('storage'))) {
        issues.push({
          severity: 'low',
          title: 'Gas Optimization Issue',
          description: 'Reading storage variables in loops can be gas expensive',
          line: i + 1,
          category: 'Gas Optimization',
          recommendation: 'Cache storage variables in memory before loops',
        })
      }
    }

    return issues
  }

  private analyzeBytecode(bytecode: string): SecurityIssue[] {
    const issues: SecurityIssue[] = []

    // Check for common vulnerability patterns in bytecode
    const patterns = [
      {
        pattern: '3d602d80600a3d3981f3363d3d373d3d3d363d73',
        title: 'Proxy Pattern Detected',
        description: 'Contract uses proxy pattern which may have upgrade risks',
        severity: 'medium' as const,
        category: 'Proxy',
        recommendation: 'Ensure proxy upgrade mechanisms are secure',
      },
      {
        pattern: 'f4',
        title: 'Delegatecall Usage',
        description: 'Contract uses delegatecall which can be risky',
        severity: 'high' as const,
        category: 'Delegatecall',
        recommendation: 'Verify delegatecall targets are secure',
      },
      {
        pattern: 'ff',
        title: 'Selfdestruct Usage',
        description: 'Contract can be destroyed using selfdestruct',
        severity: 'high' as const,
        category: 'Selfdestruct',
        recommendation: 'Ensure selfdestruct is properly protected',
      },
    ]

    for (const pattern of patterns) {
      if (bytecode.toLowerCase().includes(pattern.pattern)) {
        issues.push({
          severity: pattern.severity,
          title: pattern.title,
          description: pattern.description,
          category: pattern.category,
          recommendation: pattern.recommendation,
        })
      }
    }

    return issues
  }

  private getLineNumber(sourceCode: string, index: number): number {
    return sourceCode.slice(0, index).split('\n').length
  }

  private findFunctionEnd(sourceCode: string, startIndex: number): number {
    let braceCount = 0
    let inFunction = false
    
    for (let i = startIndex; i < sourceCode.length; i++) {
      const char = sourceCode[i]
      
      if (char === '{') {
        braceCount++
        inFunction = true
      } else if (char === '}') {
        braceCount--
        if (inFunction && braceCount === 0) {
          return i + 1
        }
      }
    }
    
    return sourceCode.length
  }

  private calculateScore(issues: SecurityIssue[]): number {
    let score = 100
    
    for (const issue of issues) {
      switch (issue.severity) {
        case 'critical':
          score -= 25
          break
        case 'high':
          score -= 15
          break
        case 'medium':
          score -= 8
          break
        case 'low':
          score -= 3
          break
      }
    }
    
    return Math.max(0, score)
  }

  async generateReport(scanResult: ScanResult): Promise<string> {
    const { issues, score, timestamp } = scanResult
    
    let report = `# Security Scan Report\n\n`
    report += `**Scan Date:** ${new Date(timestamp).toISOString()}\n`
    report += `**Security Score:** ${score}/100\n\n`
    
    if (scanResult.contractAddress) {
      report += `**Contract Address:** ${scanResult.contractAddress}\n\n`
    }
    
    // Group issues by severity
    const issuesBySeverity = issues.reduce((acc, issue) => {
      if (!acc[issue.severity]) {
        acc[issue.severity] = []
      }
      acc[issue.severity].push(issue)
      return acc
    }, {} as Record<string, SecurityIssue[]>)
    
    const severityOrder: Array<SecurityIssue['severity']> = ['critical', 'high', 'medium', 'low']
    
    for (const severity of severityOrder) {
      const severityIssues = issuesBySeverity[severity]
      if (severityIssues && severityIssues.length > 0) {
        report += `## ${severity.toUpperCase()} Issues (${severityIssues.length})\n\n`
        
        for (let i = 0; i < severityIssues.length; i++) {
          const issue = severityIssues[i]
          report += `### ${i + 1}. ${issue.title}\n\n`
          report += `**Category:** ${issue.category}\n`
          if (issue.line) {
            report += `**Line:** ${issue.line}\n`
          }
          report += `**Description:** ${issue.description}\n`
          report += `**Recommendation:** ${issue.recommendation}\n\n`
        }
      }
    }
    
    if (issues.length === 0) {
      report += `## No Issues Found\n\nThe contract appears to be secure based on the static analysis.\n`
    }
    
    report += `---\n\n`
    report += `*This report was generated by Recoder.xyz Security Scanner*\n`
    
    return report
  }

  async scanMultipleContracts(
    contracts: Array<{ address: string; chainId: number; rpcUrl: string }>
  ): Promise<ScanResult[]> {
    const results: ScanResult[] = []
    
    for (const contract of contracts) {
      try {
        const result = await this.scanDeployedContract(
          contract.address,
          contract.chainId,
          contract.rpcUrl
        )
        results.push(result)
      } catch (error) {
        console.error(`Failed to scan contract ${contract.address}:`, error)
        results.push({
          contractAddress: contract.address,
          issues: [{
            severity: 'critical',
            title: 'Scan Failed',
            description: `Failed to scan contract: ${error instanceof Error ? error.message : String(error)}`,
            category: 'System',
            recommendation: 'Verify contract address and network connectivity',
          }],
          score: 0,
          timestamp: Date.now(),
        })
      }
    }
    
    return results
  }

  getVulnerabilityCategories(): string[] {
    return [
      'Reentrancy',
      'Integer Overflow',
      'Authorization',
      'External Calls',
      'Deprecated',
      'Timestamp',
      'Storage',
      'Delegatecall',
      'Randomness',
      'Access Control',
      'Events',
      'Hardcoded Values',
      'Gas Optimization',
      'Proxy',
      'Selfdestruct',
    ]
  }

  getSeverityInfo(): Record<SecurityIssue['severity'], { color: string; weight: number }> {
    return {
      critical: { color: '#dc2626', weight: 4 },
      high: { color: '#ea580c', weight: 3 },
      medium: { color: '#d97706', weight: 2 },
      low: { color: '#65a30d', weight: 1 },
    }
  }
}