import fs from "fs/promises"
import path from "path"

interface ReadFileParams {
	filePath: string
	startLine?: number
	endLine?: number
	maxLines?: number
}

interface ReadFileResult {
	success: boolean
	message: string
	content?: string
	lineCount?: number
	totalLines?: number
	isBinary?: boolean
	isImage?: boolean
	truncated?: boolean
	errorType?: 'file_not_found' | 'permission_error' | 'invalid_range' | 'directory_error'
}

export async function readFileEnhanced(params: ReadFileParams, projectPath: string): Promise<ReadFileResult> {
	const { filePath, startLine, endLine, maxLines } = params

	try {
		// Validate parameters
		if (!filePath) {
			return { 
				success: false, 
				message: "Missing required parameter: filePath",
				errorType: 'file_not_found'
			}
		}

		// Validate line range
		if (startLine !== undefined && endLine !== undefined) {
			if (startLine > endLine) {
				return {
					success: false,
					message: "Invalid line range: start line cannot be greater than end line",
					errorType: 'invalid_range'
				}
			}
			if (startLine < 1 || endLine < 1) {
				return {
					success: false,
					message: "Invalid line range: line numbers must be positive",
					errorType: 'invalid_range'
				}
			}
		}

		// Resolve path
		let relPath: string
		if (path.isAbsolute(filePath)) {
			relPath = path.relative(projectPath, filePath)
		} else {
			relPath = filePath
		}

		const absolutePath = path.resolve(projectPath, relPath)

		// Check if file exists and get stats
		let stats
		try {
			stats = await fs.stat(absolutePath)
		} catch {
			return {
				success: false,
				message: `File not found: ${relPath}`,
				errorType: 'file_not_found'
			}
		}

		// Check if it's a directory
		if (stats.isDirectory()) {
			return {
				success: false,
				message: `Cannot read '${relPath}' because it is a directory. Use listFiles tool instead.`,
				errorType: 'directory_error'
			}
		}

		// Check if file is binary
		const isBinary = await isFileBinary(absolutePath)
		
		if (isBinary) {
			const fileExtension = path.extname(relPath).toLowerCase()
			const isImage = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg'].includes(fileExtension)
			
			return {
				success: true,
				message: `Binary file detected: ${relPath} (${fileExtension})`,
				isBinary: true,
				isImage,
				content: isImage ? `[Image file: ${fileExtension}]` : `[Binary file: ${fileExtension}]`
			}
		}

		// Read file content
		let fileContent: string
		try {
			fileContent = await fs.readFile(absolutePath, "utf8")
		} catch (error) {
			return {
				success: false,
				message: `Failed to read file '${relPath}': ${error instanceof Error ? error.message : String(error)}`,
				errorType: 'permission_error'
			}
		}

		// Normalize line endings
		fileContent = fileContent.replace(/\r\n/g, "\n")
		const lines = fileContent.split('\n')
		const totalLines = lines.length

		// Handle line range reading
		if (startLine !== undefined || endLine !== undefined) {
			const start = (startLine || 1) - 1 // Convert to 0-based
			const end = endLine ? endLine - 1 : lines.length - 1

			// Validate range against actual file
			if (start >= totalLines) {
				return {
					success: false,
					message: `Start line ${startLine} exceeds file length (${totalLines} lines)`,
					totalLines,
					errorType: 'invalid_range'
				}
			}

			const selectedLines = lines.slice(start, end + 1)
			const numberedContent = selectedLines
				.map((line, index) => `${start + index + 1}: ${line}`)
				.join('\n')

			return {
				success: true,
				message: `Read lines ${start + 1}-${Math.min(end + 1, totalLines)} from '${relPath}'`,
				content: numberedContent,
				lineCount: selectedLines.length,
				totalLines
			}
		}

		// Handle max lines truncation
		if (maxLines && totalLines > maxLines) {
			const truncatedLines = lines.slice(0, maxLines)
			const numberedContent = truncatedLines
				.map((line, index) => `${index + 1}: ${line}`)
				.join('\n')

			return {
				success: true,
				message: `Read first ${maxLines} lines from '${relPath}' (truncated from ${totalLines} total lines)`,
				content: numberedContent,
				lineCount: maxLines,
				totalLines,
				truncated: true
			}
		}

		// Read full file with line numbers
		const numberedContent = lines
			.map((line, index) => `${index + 1}: ${line}`)
			.join('\n')

		return {
			success: true,
			message: `Read complete file '${relPath}'`,
			content: numberedContent,
			lineCount: totalLines,
			totalLines
		}

	} catch (error) {
		return {
			success: false,
			message: `Error reading file: ${error instanceof Error ? error.message : String(error)}`
		}
	}
}

// Simple binary file detection
async function isFileBinary(filePath: string): Promise<boolean> {
	try {
		const buffer = await fs.readFile(filePath)
		
		// Check first 8000 bytes for null bytes (common in binary files)
		const chunk = buffer.subarray(0, Math.min(8000, buffer.length))
		
		for (let i = 0; i < chunk.length; i++) {
			if (chunk[i] === 0) {
				return true
			}
		}
		
		return false
	} catch {
		return false
	}
}
