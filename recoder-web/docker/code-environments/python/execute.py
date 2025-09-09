#!/usr/bin/env python3
"""
Python Code Execution Engine
Secure sandboxed execution with resource limits and timeout protection
"""

import json
import os
import sys
import time
import traceback
import subprocess
import multiprocessing
import signal
import resource
from pathlib import Path
from io import StringIO
import contextlib
import ast
import re
import tempfile
import shutil

# Configuration
CONFIG = {
    'timeout': int(os.environ.get('EXECUTION_TIMEOUT', 30)),
    'max_output_size': int(os.environ.get('MAX_OUTPUT_SIZE', 1048576)),  # 1MB
    'max_memory': 512 * 1024 * 1024,  # 512MB
    'workspace_dir': '/workspace',
    'output_dir': '/tmp/code-output'
}

class SecurityError(Exception):
    """Raised when potentially unsafe code is detected"""
    pass

class CodeExecutor:
    def __init__(self):
        self.start_time = time.time()
        self.execution_id = os.environ.get('EXECUTION_ID', 'default')
        self.restricted_imports = {
            'os', 'sys', 'subprocess', 'multiprocessing', 'threading',
            'socket', 'urllib', 'http', 'ftplib', 'smtplib', 'poplib',
            'imaplib', 'nntplib', 'telnetlib', 'xmlrpc', 'webbrowser',
            'code', 'codeop', 'compile', 'exec', 'eval', 'execfile',
            'file', 'open', '__import__', 'reload', 'input', 'raw_input'
        }

    def execute(self):
        """Main execution entry point"""
        try:
            # Set resource limits
            self.set_resource_limits()
            
            # Read execution parameters
            input_file = Path(CONFIG['workspace_dir']) / 'input.json'
            if not input_file.exists():
                raise FileNotFoundError('No input file found')

            with open(input_file, 'r') as f:
                input_data = json.load(f)

            code = input_data.get('code', '')
            language = input_data.get('language', 'python')
            packages = input_data.get('packages', [])
            execution_type = input_data.get('executionType', 'run')

            # Validate input
            self.validate_input(code, language)

            # Install packages if needed
            if packages:
                self.install_packages(packages)

            # Execute based on type
            if execution_type == 'compile':
                result = self.compile_code(code)
            elif execution_type == 'run':
                result = self.run_code(code)
            elif execution_type == 'test':
                result = self.test_code(code)
            elif execution_type == 'lint':
                result = self.lint_code(code)
            else:
                raise ValueError(f'Unknown execution type: {execution_type}')

            self.save_result(result)

        except Exception as error:
            self.save_result({
                'success': False,
                'error': str(error),
                'traceback': traceback.format_exc(),
                'execution_time': time.time() - self.start_time
            })

    def set_resource_limits(self):
        """Set system resource limits for security"""
        try:
            # Set memory limit
            resource.setrlimit(resource.RLIMIT_AS, (CONFIG['max_memory'], CONFIG['max_memory']))
            
            # Set CPU time limit
            resource.setrlimit(resource.RLIMIT_CPU, (CONFIG['timeout'] * 2, CONFIG['timeout'] * 2))
            
            # Set file size limit
            resource.setrlimit(resource.RLIMIT_FSIZE, (10 * 1024 * 1024, 10 * 1024 * 1024))  # 10MB
            
            # Set process limit
            resource.setrlimit(resource.RLIMIT_NPROC, (10, 10))
            
        except Exception:
            # Resource limits not supported on all systems
            pass

    def validate_input(self, code, language):
        """Validate and sanitize input code"""
        if not code or not isinstance(code, str):
            raise ValueError('Code is required and must be a string')

        if len(code) > 100000:  # 100KB limit
            raise ValueError('Code size exceeds maximum limit')

        # Security checks for dangerous patterns
        dangerous_patterns = [
            r'import\s+os\b',
            r'import\s+sys\b',
            r'import\s+subprocess\b',
            r'import\s+socket\b',
            r'from\s+os\s+import',
            r'from\s+sys\s+import',
            r'from\s+subprocess\s+import',
            r'__import__\s*\(',
            r'exec\s*\(',
            r'eval\s*\(',
            r'compile\s*\(',
            r'open\s*\(',
            r'file\s*\(',
            r'input\s*\(',
            r'raw_input\s*\(',
            r'exit\s*\(',
            r'quit\s*\(',
            r'globals\s*\(',
            r'locals\s*\(',
            r'vars\s*\(',
            r'dir\s*\(',
            r'help\s*\(',
            r'breakpoint\s*\(',
        ]

        for pattern in dangerous_patterns:
            if re.search(pattern, code, re.IGNORECASE):
                raise SecurityError(f'Potentially unsafe code detected: {pattern}')

        # Check AST for dangerous nodes
        try:
            tree = ast.parse(code)
            for node in ast.walk(tree):
                if isinstance(node, (ast.Import, ast.ImportFrom)):
                    for alias in node.names:
                        module_name = alias.name.split('.')[0]
                        if module_name in self.restricted_imports:
                            raise SecurityError(f'Import of restricted module: {module_name}')
        except SyntaxError:
            # Will be caught during execution
            pass

    def install_packages(self, packages):
        """Install Python packages securely"""
        # Validate package names
        valid_package_pattern = re.compile(r'^[a-zA-Z0-9][a-zA-Z0-9\-_.]*$')
        for pkg in packages:
            if not valid_package_pattern.match(pkg):
                raise ValueError(f'Invalid package name: {pkg}')

        # Install packages using pip
        try:
            cmd = [sys.executable, '-m', 'pip', 'install', '--no-deps', '--no-cache-dir'] + packages
            result = subprocess.run(
                cmd,
                cwd=CONFIG['workspace_dir'],
                capture_output=True,
                text=True,
                timeout=60  # 1 minute timeout
            )
            
            if result.returncode != 0:
                raise Exception(f'Package installation failed: {result.stderr}')
                
        except subprocess.TimeoutExpired:
            raise Exception('Package installation timed out')

    def compile_code(self, code):
        """Compile Python code to check for syntax errors"""
        try:
            compile(code, '<string>', 'exec')
            
            return {
                'success': True,
                'compiled': True,
                'output': 'Python code compiled successfully',
                'execution_time': time.time() - self.start_time
            }
        except SyntaxError as error:
            return {
                'success': False,
                'error': f'Syntax error: {error.msg}',
                'line_number': error.lineno,
                'execution_time': time.time() - self.start_time
            }

    def run_code(self, code):
        """Execute Python code in a sandboxed environment"""
        # Capture stdout and stderr
        old_stdout = sys.stdout
        old_stderr = sys.stderr
        
        stdout_buffer = StringIO()
        stderr_buffer = StringIO()
        
        try:
            sys.stdout = stdout_buffer
            sys.stderr = stderr_buffer
            
            # Create restricted execution environment
            restricted_globals = {
                '__builtins__': self.get_restricted_builtins(),
                '__name__': '__main__',
                '__doc__': None,
                'print': print,
                'len': len,
                'range': range,
                'enumerate': enumerate,
                'zip': zip,
                'map': map,
                'filter': filter,
                'sorted': sorted,
                'sum': sum,
                'min': min,
                'max': max,
                'abs': abs,
                'round': round,
                'int': int,
                'float': float,
                'str': str,
                'bool': bool,
                'list': list,
                'dict': dict,
                'tuple': tuple,
                'set': set,
                'type': type,
                'isinstance': isinstance,
                'hasattr': hasattr,
                'getattr': getattr,
                'setattr': setattr,
            }
            
            # Add allowed imports
            self.add_safe_imports(restricted_globals)
            
            # Execute with timeout
            def execute_with_timeout():
                exec(code, restricted_globals, {})
            
            process = multiprocessing.Process(target=execute_with_timeout)
            process.start()
            process.join(timeout=CONFIG['timeout'])
            
            if process.is_alive():
                process.terminate()
                process.join()
                raise TimeoutError('Code execution timed out')
            
            if process.exitcode != 0:
                raise RuntimeError(f'Code execution failed with exit code {process.exitcode}')
            
            output = stdout_buffer.getvalue()
            stderr_output = stderr_buffer.getvalue()
            
            # Limit output size
            if len(output) > CONFIG['max_output_size']:
                output = output[:CONFIG['max_output_size']] + '\n... (output truncated)'
            
            return {
                'success': True,
                'output': output,
                'stderr': stderr_output,
                'execution_time': time.time() - self.start_time
            }
            
        except TimeoutError:
            return {
                'success': False,
                'error': 'Code execution timed out',
                'execution_time': CONFIG['timeout']
            }
        except Exception as error:
            return {
                'success': False,
                'error': str(error),
                'traceback': traceback.format_exc(),
                'stderr': stderr_buffer.getvalue(),
                'execution_time': time.time() - self.start_time
            }
        finally:
            sys.stdout = old_stdout
            sys.stderr = old_stderr

    def test_code(self, code):
        """Run Python code with basic test framework"""
        test_framework = '''
import re

class TestResult:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.tests = []

    def add_result(self, name, status, error=None):
        self.tests.append({'name': name, 'status': status, 'error': error})
        if status == 'passed':
            self.passed += 1
            print(f"  ✅ {name}")
        else:
            self.failed += 1
            print(f"  ❌ {name}: {error}")

test_results = TestResult()

def test(name):
    def decorator(func):
        try:
            func()
            test_results.add_result(name, 'passed')
        except Exception as e:
            test_results.add_result(name, 'failed', str(e))
        return func
    return decorator

def assert_equal(actual, expected):
    if actual != expected:
        raise AssertionError(f"Expected {expected}, got {actual}")

def assert_true(value):
    if not value:
        raise AssertionError(f"Expected truthy value, got {value}")

def assert_false(value):
    if value:
        raise AssertionError(f"Expected falsy value, got {value}")

def assert_in(item, container):
    if item not in container:
        raise AssertionError(f"Expected {item} to be in {container}")

def assert_raises(exception_type, func, *args, **kwargs):
    try:
        func(*args, **kwargs)
        raise AssertionError(f"Expected {exception_type.__name__} to be raised")
    except exception_type:
        pass

''' + code + '''

print(f"\\n📊 Test Results: {test_results.passed} passed, {test_results.failed} failed")
'''

        result = self.run_code(test_framework)
        return {
            **result,
            'is_test': True
        }

    def lint_code(self, code):
        """Basic Python code linting"""
        issues = []
        lines = code.split('\n')
        
        # Simple linting rules
        lint_rules = [
            {
                'pattern': re.compile(r'print\s*\('),
                'message': 'Consider using logging instead of print statements',
                'severity': 'info'
            },
            {
                'pattern': re.compile(r'==\s*True\b'),
                'message': 'Use "is True" instead of "== True"',
                'severity': 'warning'
            },
            {
                'pattern': re.compile(r'==\s*False\b'),
                'message': 'Use "is False" instead of "== False"',
                'severity': 'warning'
            },
            {
                'pattern': re.compile(r'!=\s*None\b'),
                'message': 'Use "is not None" instead of "!= None"',
                'severity': 'warning'
            },
            {
                'pattern': re.compile(r'==\s*None\b'),
                'message': 'Use "is None" instead of "== None"',
                'severity': 'warning'
            },
            {
                'pattern': re.compile(r'\bexcept:\s*$'),
                'message': 'Bare except clause should specify exception type',
                'severity': 'error'
            },
            {
                'pattern': re.compile(r'lambda.*:.*lambda'),
                'message': 'Avoid nested lambda expressions',
                'severity': 'warning'
            }
        ]
        
        for line_num, line in enumerate(lines, 1):
            line = line.strip()
            if not line or line.startswith('#'):
                continue
                
            for rule in lint_rules:
                matches = rule['pattern'].finditer(line)
                for match in matches:
                    issues.append({
                        'line': line_num,
                        'column': match.start() + 1,
                        'message': rule['message'],
                        'severity': rule['severity'],
                        'source': line
                    })
        
        return {
            'success': True,
            'issues': issues,
            'summary': {
                'errors': len([i for i in issues if i['severity'] == 'error']),
                'warnings': len([i for i in issues if i['severity'] == 'warning']),
                'info': len([i for i in issues if i['severity'] == 'info'])
            },
            'execution_time': time.time() - self.start_time
        }

    def get_restricted_builtins(self):
        """Get a restricted set of builtin functions"""
        safe_builtins = {
            'abs', 'all', 'any', 'ascii', 'bin', 'bool', 'bytearray', 'bytes',
            'callable', 'chr', 'classmethod', 'complex', 'dict', 'dir', 'divmod',
            'enumerate', 'filter', 'float', 'format', 'frozenset', 'getattr',
            'hasattr', 'hash', 'hex', 'id', 'int', 'isinstance', 'issubclass',
            'iter', 'len', 'list', 'map', 'max', 'memoryview', 'min', 'next',
            'object', 'oct', 'ord', 'pow', 'property', 'range', 'repr',
            'reversed', 'round', 'set', 'setattr', 'slice', 'sorted',
            'staticmethod', 'str', 'sum', 'super', 'tuple', 'type', 'vars',
            'zip', 'print'
        }
        
        restricted_builtins = {}
        import builtins
        
        for name in safe_builtins:
            if hasattr(builtins, name):
                restricted_builtins[name] = getattr(builtins, name)
        
        return restricted_builtins

    def add_safe_imports(self, globals_dict):
        """Add safe imports to the execution environment"""
        safe_modules = {
            'math': __import__('math'),
            'random': __import__('random'),
            'datetime': __import__('datetime'),
            'json': __import__('json'),
            're': __import__('re'),
            'collections': __import__('collections'),
            'itertools': __import__('itertools'),
            'functools': __import__('functools'),
            'operator': __import__('operator'),
            'string': __import__('string'),
            'time': __import__('time'),
            'calendar': __import__('calendar'),
            'decimal': __import__('decimal'),
            'fractions': __import__('fractions'),
            'statistics': __import__('statistics'),
        }
        
        # Add numpy and pandas if available
        try:
            import numpy
            safe_modules['numpy'] = numpy
            safe_modules['np'] = numpy
        except ImportError:
            pass
            
        try:
            import pandas
            safe_modules['pandas'] = pandas
            safe_modules['pd'] = pandas
        except ImportError:
            pass
        
        globals_dict.update(safe_modules)

    def save_result(self, result):
        """Save execution result to output file"""
        output_dir = Path(CONFIG['output_dir'])
        output_dir.mkdir(exist_ok=True)
        
        output_file = output_dir / f'{self.execution_id}.json'
        
        final_result = {
            **result,
            'timestamp': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
            'execution_id': self.execution_id,
            'environment': 'python',
            'version': sys.version
        }
        
        with open(output_file, 'w') as f:
            json.dump(final_result, f, indent=2)
        
        # Also output to stdout for container logs
        print(json.dumps(final_result))

def signal_handler(signum, frame):
    """Handle process signals gracefully"""
    print(f'Received signal {signum}, shutting down gracefully...')
    sys.exit(0)

# Handle process signals
signal.signal(signal.SIGTERM, signal_handler)
signal.signal(signal.SIGINT, signal_handler)

if __name__ == '__main__':
    executor = CodeExecutor()
    executor.execute()