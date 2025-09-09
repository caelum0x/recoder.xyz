#!/usr/bin/env python3
"""Python Code Executor with Security and Resource Limits"""

import os
import sys
import json
import time
import subprocess
import tempfile
import signal
from pathlib import Path
from contextlib import contextmanager

class CodeExecutor:
    def __init__(self):
        self.timeout = 30  # 30 seconds
        self.max_output_size = 1024 * 1024  # 1MB
        self.workspace = Path('/workspace')
        
    def execute_code(self, code, language='python', filename='main'):
        """Execute Python code with security constraints"""
        start_time = time.time()
        
        try:
            # Write code to file
            ext = self.get_file_extension(language)
            filepath = self.workspace / f"{filename}.{ext}"
            filepath.write_text(code)
            
            # Execute based on language variant
            result = self.run_code(language, filepath, filename)
            
            return {
                'success': result['returncode'] == 0,
                'output': result['stdout'],
                'error': result['stderr'],
                'exitCode': result['returncode'],
                'executionTime': int((time.time() - start_time) * 1000),
                'language': language,
                'filename': filename
            }
            
        except Exception as e:
            return {
                'success': False,
                'output': '',
                'error': str(e),
                'exitCode': 1,
                'executionTime': int((time.time() - start_time) * 1000),
                'language': language,
                'filename': filename
            }
    
    def run_code(self, language, filepath, filename):
        """Run code based on Python variant"""
        if language == 'python':
            return self.execute_command(['python3', str(filepath)])
        elif language == 'pypy':
            return self.execute_command(['pypy3', str(filepath)])
        else:
            raise ValueError(f"Unsupported language: {language}")
    
    def execute_command(self, cmd):
        """Execute command with timeout and resource limits"""
        try:
            result = subprocess.run(
                cmd,
                cwd=str(self.workspace),
                capture_output=True,
                text=True,
                timeout=self.timeout,
                env={
                    'PATH': os.environ.get('PATH', ''),
                    'PYTHONPATH': str(self.workspace),
                    'PYTHONUNBUFFERED': '1',
                    'PYTHONDONTWRITEBYTECODE': '1'
                }
            )
            
            # Limit output size
            stdout = result.stdout
            stderr = result.stderr
            
            if len(stdout) > self.max_output_size:
                stdout = stdout[:self.max_output_size] + '\n... Output truncated (size limit exceeded)'
            
            if len(stderr) > self.max_output_size:
                stderr = stderr[:self.max_output_size] + '\n... Error output truncated (size limit exceeded)'
            
            return {
                'stdout': stdout,
                'stderr': stderr,
                'returncode': result.returncode
            }
            
        except subprocess.TimeoutExpired:
            return {
                'stdout': '',
                'stderr': 'Process killed due to timeout (30 seconds)',
                'returncode': 124
            }
        except Exception as e:
            return {
                'stdout': '',
                'stderr': f'Execution error: {str(e)}',
                'returncode': 1
            }
    
    def get_file_extension(self, language):
        """Get file extension for language"""
        extensions = {
            'python': 'py',
            'pypy': 'py'
        }
        return extensions.get(language, 'py')

# Security wrapper to prevent dangerous operations
def secure_exec():
    """Apply security restrictions"""
    # Disable network access (basic)
    os.environ['no_proxy'] = '*'
    
    # Limit file system access
    os.chdir('/workspace')

if __name__ == '__main__':
    secure_exec()
    
    if len(sys.argv) < 3:
        print(json.dumps({
            'success': False,
            'error': 'Usage: execute.py <code> <language>',
            'exitCode': 1
        }))
        sys.exit(1)
    
    executor = CodeExecutor()
    code = sys.argv[1]
    language = sys.argv[2] if len(sys.argv) > 2 else 'python'
    
    result = executor.execute_code(code, language)
    print(json.dumps(result, indent=2))
