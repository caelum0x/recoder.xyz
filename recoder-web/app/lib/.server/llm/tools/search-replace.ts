import fs from "fs/promises"
import path from "path"

interface SearchReplaceParams {
	file_path: string
	old_string: string
	new_string: string
}

interface SearchReplaceResult {
	success: boolean
	message: string
	diff?: string
	diffStats?: {
		additions: number
		deletions: number
		changes: number
	}
	consecutiveMistakeCount?: number
	errorType?: 'no_match' | 'multiple_matches' | 'file_not_found' | 'permission_error'
}

export async function searchReplace(params: SearchReplaceParams, projectPath: string): Promise<SearchReplaceResult> {
	const { file_path, old_string, new_string } = params

	try {
		// Validate required parameters with detailed error tracking
		if (!file_path) {
			return { 
				success: false, 
				message: "Missing required parameter: file_path",
				consecutiveMistakeCount: 1,
				errorType: 'file_not_found'
			}
		}

		if (!old_string) {
			return { 
				success: false, 
				message: "Missing required parameter: old_string",
				consecutiveMistakeCount: 1
			}
		}

		if (new_string === undefined) {
			return { 
				success: false, 
				message: "Missing required parameter: new_string",
				consecutiveMistakeCount: 1
			}
		}

		// Validate that old_string and new_string are different
		if (old_string === new_string) {
			return { 
				success: false, 
				message: "The 'old_string' and 'new_string' parameters must be different.",
				consecutiveMistakeCount: 1
			}
		}

		// Determine relative path - file_path can be absolute or relative
		let relPath: string
		if (path.isAbsolute(file_path)) {
			relPath = path.relative(projectPath, file_path)
		} else {
			relPath = file_path
		}

		const absolutePath = path.resolve(projectPath, relPath)

		// Enhanced file existence check
		let fileExists = false
		try {
			const stats = await fs.stat(absolutePath)
			fileExists = stats.isFile()
		} catch {
			return { 
				success: false, 
				message: `File not found: ${relPath}. Cannot perform search and replace on a non-existent file.`,
				consecutiveMistakeCount: 1,
				errorType: 'file_not_found'
			}
		}

		let fileContent: string
		try {
			fileContent = await fs.readFile(absolutePath, "utf8")
			// Normalize line endings to LF for consistent matching
			fileContent = fileContent.replace(/\r\n/g, "\n")
		} catch (error) {
			return { 
				success: false, 
				message: `Failed to read file '${relPath}'. Please verify file permissions and try again.`,
				consecutiveMistakeCount: 1,
				errorType: 'permission_error'
			}
		}

		// Normalize line endings in search/replace strings to match file content
		const normalizedOldString = old_string.replace(/\r\n/g, "\n")
		const normalizedNewString = new_string.replace(/\r\n/g, "\n")

		// Check for exact match (literal string, not regex) with enhanced error reporting
		const matchCount = fileContent.split(normalizedOldString).length - 1

		if (matchCount === 0) {
			// Enhanced no-match error with context
			const lines = fileContent.split('\n')
			const searchLines = normalizedOldString.split('\n')
			const firstSearchLine = searchLines[0]
			
			// Find similar lines for better error reporting
			const similarLines = lines
				.map((line, index) => ({ line: line.trim(), index }))
				.filter(({ line }) => line.includes(firstSearchLine.trim()) || firstSearchLine.trim().includes(line))
				.slice(0, 3)
			
			let errorMessage = `No match found for the specified 'old_string'. Please ensure it matches the file contents exactly, including whitespace and indentation.`
			
			if (similarLines.length > 0) {
				errorMessage += `\n\nSimilar lines found:\n${similarLines.map(({ line, index }) => `Line ${index + 1}: ${line}`).join('\n')}`
			}

			return { 
				success: false, 
				message: errorMessage,
				consecutiveMistakeCount: 1,
				errorType: 'no_match'
			}
		}

		if (matchCount > 1) {
			// Enhanced multiple matches error with context
			const matches = []
			let searchIndex = 0
			for (let i = 0; i < matchCount; i++) {
				const matchIndex = fileContent.indexOf(normalizedOldString, searchIndex)
				if (matchIndex !== -1) {
					const lineNumber = fileContent.substring(0, matchIndex).split('\n').length
					matches.push(`Line ${lineNumber}`)
					searchIndex = matchIndex + normalizedOldString.length
				}
			}

			return { 
				success: false, 
				message: `Found ${matchCount} matches for the specified 'old_string' at: ${matches.join(', ')}. This tool can only replace ONE occurrence at a time. Please provide more context (3-5 lines before and after) to uniquely identify the specific instance you want to change.`,
				consecutiveMistakeCount: 1,
				errorType: 'multiple_matches'
			}
		}

		// Apply the single replacement
		const newContent = fileContent.replace(normalizedOldString, normalizedNewString)

		// Check if any changes were made
		if (newContent === fileContent) {
			return { 
				success: true, 
				message: `No changes needed for '${relPath}'`,
				consecutiveMistakeCount: 0
			}
		}

		// Write the file with error handling
		try {
			await fs.writeFile(absolutePath, newContent, "utf8")
		} catch (error) {
			return { 
				success: false, 
				message: `Failed to write file '${relPath}': ${error instanceof Error ? error.message : String(error)}`,
				consecutiveMistakeCount: 1,
				errorType: 'permission_error'
			}
		}

		// Generate enhanced diff with statistics
		const { diff, diffStats } = createEnhancedDiff(fileContent, newContent, relPath)

		return { 
			success: true, 
			message: `Successfully updated '${relPath}'`,
			diff,
			diffStats,
			consecutiveMistakeCount: 0
		}

	} catch (error) {
		return { 
			success: false, 
			message: `Error during search and replace: ${error instanceof Error ? error.message : String(error)}`,
			consecutiveMistakeCount: 1
		}
	}
}

function createEnhancedDiff(oldContent: string, newContent: string, filePath: string): { 
	diff: string; 
	diffStats: { additions: number; deletions: number; changes: number } 
} {
	const oldLines = oldContent.split('\n')
	const newLines = newContent.split('\n')
	
	let diff = `--- ${filePath}\n+++ ${filePath}\n`
	let additions = 0
	let deletions = 0
	let changes = 0
	
	// Simple line-by-line diff with context
	const maxLines = Math.max(oldLines.length, newLines.length)
	let contextStart = -1
	let contextEnd = -1
	
	// Find changed regions
	for (let i = 0; i < maxLines; i++) {
		const oldLine = oldLines[i] || ''
		const newLine = newLines[i] || ''
		
		if (oldLine !== newLine) {
			if (contextStart === -1) contextStart = Math.max(0, i - 2)
			contextEnd = Math.min(maxLines - 1, i + 2)
		}
	}
	
	// Generate diff with context
	if (contextStart !== -1) {
		diff += `@@ -${contextStart + 1},${contextEnd - contextStart + 1} +${contextStart + 1},${contextEnd - contextStart + 1} @@\n`
		
		for (let i = contextStart; i <= contextEnd; i++) {
			const oldLine = oldLines[i] || ''
			const newLine = newLines[i] || ''
			
			if (i < oldLines.length && i < newLines.length && oldLine === newLine) {
				diff += ` ${oldLine}\n`
			} else {
				if (i < oldLines.length) {
					diff += `-${oldLine}\n`
					deletions++
				}
				if (i < newLines.length) {
					diff += `+${newLine}\n`
					additions++
				}
			}
		}
	}
	
	changes = Math.max(additions, deletions)
	
	return {
		diff,
		diffStats: { additions, deletions, changes }
	}
}
