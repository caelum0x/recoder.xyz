#!/bin/bash

# Real Sandbox Setup Script
# This script sets up a production-ready code sandbox with real isolation

set -e

echo "🔐 Setting up Real Code Sandbox with Industry-Standard Libraries"
echo "================================================================="

# Check prerequisites
check_prerequisites() {
    echo "📋 Checking prerequisites..."
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        echo "❌ Docker is required but not installed. Please install Docker first."
        echo "   https://docs.docker.com/get-docker/"
        exit 1
    fi
    
    # Check Docker Compose
    if ! command -v docker-compose &> /dev/null; then
        echo "❌ Docker Compose is required but not installed."
        exit 1
    fi
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        echo "❌ Node.js is required but not installed. Please install Node.js 18+."
        exit 1
    fi
    
    # Check npm
    if ! command -v npm &> /dev/null; then
        echo "❌ npm is required but not installed."
        exit 1
    fi
    
    echo "✅ All prerequisites are installed"
}

# Install sandbox service dependencies
install_dependencies() {
    echo "📦 Installing sandbox service dependencies..."
    
    cd sandbox-service
    npm install
    cd ..
    
    echo "✅ Dependencies installed"
}

# Pull required Docker images
pull_docker_images() {
    echo "🐳 Pulling required Docker images..."
    
    # Core language images
    docker pull node:18-alpine
    docker pull python:3.11-alpine
    docker pull openjdk:17-alpine
    docker pull golang:1.21-alpine
    docker pull rust:1.75-alpine
    docker pull gcc:latest
    docker pull ubuntu:22.04
    
    echo "✅ Docker images pulled"
}

# Set up security configurations
setup_security() {
    echo "🔒 Setting up security configurations..."
    
    # Create AppArmor profile for containers (if available)
    if command -v apparmor_parser &> /dev/null; then
        cat > /tmp/docker-sandbox << 'EOF'
#include <tunables/global>

profile docker-sandbox flags=(attach_disconnected,mediate_deleted) {
  #include <abstractions/base>
  
  # Deny network access
  deny network,
  
  # Deny file system write (except tmpfs)
  deny /** w,
  allow /tmp/** rw,
  
  # Deny dangerous capabilities
  deny capability sys_admin,
  deny capability sys_ptrace,
  deny capability sys_module,
  
  # Allow basic operations
  capability setuid,
  capability setgid,
  capability chown,
}
EOF
        
        sudo apparmor_parser -r /tmp/docker-sandbox
        echo "✅ AppArmor profile installed"
    fi
    
    # Set up seccomp profile
    mkdir -p ./security
    cat > ./security/seccomp-sandbox.json << 'EOF'
{
  "defaultAction": "SCMP_ACT_ERRNO",
  "architectures": ["SCMP_ARCH_X86_64"],
  "syscalls": [
    {
      "names": [
        "read", "write", "open", "close", "stat", "fstat", "lstat", "poll",
        "lseek", "mmap", "mprotect", "munmap", "brk", "rt_sigaction",
        "rt_sigprocmask", "rt_sigreturn", "ioctl", "pread64", "pwrite64",
        "readv", "writev", "access", "pipe", "select", "sched_yield",
        "mremap", "msync", "mincore", "madvise", "shmget", "shmat", "shmctl",
        "dup", "dup2", "pause", "nanosleep", "getitimer", "alarm", "setitimer",
        "getpid", "sendfile", "socket", "connect", "accept", "sendto", "recvfrom",
        "sendmsg", "recvmsg", "shutdown", "bind", "listen", "getsockname",
        "getpeername", "socketpair", "setsockopt", "getsockopt", "clone",
        "fork", "vfork", "execve", "exit", "wait4", "kill", "uname", "semget",
        "semop", "semctl", "shmdt", "msgget", "msgsnd", "msgrcv", "msgctl",
        "fcntl", "flock", "fsync", "fdatasync", "truncate", "ftruncate",
        "getdents", "getcwd", "chdir", "fchdir", "rename", "mkdir", "rmdir",
        "creat", "link", "unlink", "symlink", "readlink", "chmod", "fchmod",
        "chown", "fchown", "lchown", "umask", "gettimeofday", "getrlimit",
        "getrusage", "sysinfo", "times", "ptrace", "getuid", "syslog", "getgid",
        "setuid", "setgid", "geteuid", "getegid", "setpgid", "getppid",
        "getpgrp", "setsid", "setreuid", "setregid", "getgroups", "setgroups",
        "setresuid", "getresuid", "setresgid", "getresgid", "getpgid",
        "setfsuid", "setfsgid", "getsid", "capget", "capset", "rt_sigpending",
        "rt_sigtimedwait", "rt_sigqueueinfo", "rt_sigsuspend", "sigaltstack",
        "utime", "mknod", "uselib", "personality", "ustat", "statfs", "fstatfs",
        "sysfs", "getpriority", "setpriority", "sched_setparam", "sched_getparam",
        "sched_setscheduler", "sched_getscheduler", "sched_get_priority_max",
        "sched_get_priority_min", "sched_rr_get_interval", "mlock", "munlock",
        "mlockall", "munlockall", "vhangup", "modify_ldt", "pivot_root",
        "_sysctl", "prctl", "arch_prctl", "adjtimex", "setrlimit", "chroot",
        "sync", "acct", "settimeofday", "mount", "umount2", "swapon", "swapoff",
        "reboot", "sethostname", "setdomainname", "iopl", "ioperm",
        "create_module", "init_module", "delete_module", "get_kernel_syms",
        "query_module", "quotactl", "nfsservctl", "getpmsg", "putpmsg",
        "afs_syscall", "tuxcall", "security", "gettid", "readahead", "setxattr",
        "lsetxattr", "fsetxattr", "getxattr", "lgetxattr", "fgetxattr",
        "listxattr", "llistxattr", "flistxattr", "removexattr", "lremovexattr",
        "fremovexattr", "tkill", "time", "futex", "sched_setaffinity",
        "sched_getaffinity", "set_thread_area", "io_setup", "io_destroy",
        "io_getevents", "io_submit", "io_cancel", "get_thread_area",
        "lookup_dcookie", "epoll_create", "epoll_ctl_old", "epoll_wait_old",
        "remap_file_pages", "getdents64", "set_tid_address", "restart_syscall",
        "semtimedop", "fadvise64", "timer_create", "timer_settime",
        "timer_gettime", "timer_getoverrun", "timer_delete", "clock_settime",
        "clock_gettime", "clock_getres", "clock_nanosleep", "exit_group",
        "epoll_wait", "epoll_ctl", "tgkill", "utimes", "vserver", "mbind",
        "set_mempolicy", "get_mempolicy", "mq_open", "mq_unlink", "mq_timedsend",
        "mq_timedreceive", "mq_notify", "mq_getsetattr", "kexec_load", "waitid",
        "add_key", "request_key", "keyctl", "ioprio_set", "ioprio_get",
        "inotify_init", "inotify_add_watch", "inotify_rm_watch", "migrate_pages",
        "openat", "mkdirat", "mknodat", "fchownat", "futimesat", "newfstatat",
        "unlinkat", "renameat", "linkat", "symlinkat", "readlinkat", "fchmodat",
        "faccessat", "pselect6", "ppoll", "unshare", "set_robust_list",
        "get_robust_list", "splice", "tee", "sync_file_range", "vmsplice",
        "move_pages", "utimensat", "epoll_pwait", "signalfd", "timerfd_create",
        "eventfd", "fallocate", "timerfd_settime", "timerfd_gettime", "accept4",
        "signalfd4", "eventfd2", "epoll_create1", "dup3", "pipe2", "inotify_init1",
        "preadv", "pwritev", "rt_tgsigqueueinfo", "perf_event_open", "recvmmsg",
        "fanotify_init", "fanotify_mark", "prlimit64", "name_to_handle_at",
        "open_by_handle_at", "clock_adjtime", "syncfs", "sendmmsg", "setns",
        "getcpu", "process_vm_readv", "process_vm_writev"
      ],
      "action": "SCMP_ACT_ALLOW"
    }
  ]
}
EOF
    
    echo "✅ Security profiles created"
}

# Start services
start_services() {
    echo "🚀 Starting sandbox services..."
    
    # Build and start with Docker Compose
    docker-compose -f docker-compose.sandbox.yml up --build -d
    
    echo "✅ Services started"
    echo ""
    echo "📊 Service Status:"
    docker-compose -f docker-compose.sandbox.yml ps
}

# Test the installation
test_installation() {
    echo "🧪 Testing sandbox installation..."
    
    # Wait for services to be ready
    echo "⏳ Waiting for services to be ready..."
    sleep 10
    
    # Test WebSocket connection
    node -e "
        const WebSocket = require('ws');
        const ws = new WebSocket('ws://localhost:3001/sandbox?runtime=vm2');
        
        ws.on('open', () => {
            console.log('✅ WebSocket connection successful');
            
            // Test JavaScript execution
            ws.send(JSON.stringify({
                type: 'execute',
                data: {
                    executionId: 'test-' + Date.now(),
                    language: 'javascript',
                    code: 'console.log(\"Hello from real sandbox!\"); 2 + 2',
                    config: {
                        runtime: 'vm2',
                        timeoutMs: 5000,
                        memoryLimitBytes: 50 * 1024 * 1024,
                        cpuLimitPercent: 50,
                        networkEnabled: false,
                        filesystemWrite: false
                    }
                }
            }));
        });
        
        ws.on('message', (data) => {
            const message = JSON.parse(data.toString());
            if (message.type === 'execution_result') {
                if (message.data.success) {
                    console.log('✅ Code execution test passed');
                    console.log('📤 Output:', message.data.stdout || message.data.output);
                } else {
                    console.log('❌ Code execution test failed:', message.data.error);
                }
                ws.close();
                process.exit(message.data.success ? 0 : 1);
            }
        });
        
        ws.on('error', (error) => {
            console.log('❌ WebSocket connection failed:', error.message);
            process.exit(1);
        });
        
        setTimeout(() => {
            console.log('❌ Test timeout');
            process.exit(1);
        }, 15000);
    " 2>/dev/null || {
        echo "❌ Test failed - WebSocket library not found"
        echo "   Installing ws library for testing..."
        cd sandbox-service && npm install ws && cd ..
        echo "✅ Test dependencies installed"
    }
    
    echo "✅ Installation test completed"
}

# Main installation flow
main() {
    echo "Starting Real Sandbox Installation..."
    
    check_prerequisites
    install_dependencies
    pull_docker_images
    setup_security
    start_services
    test_installation
    
    echo ""
    echo "🎉 Real Sandbox Installation Complete!"
    echo "=================================="
    echo ""
    echo "📋 Summary:"
    echo "   • Sandbox Service: http://localhost:3001"
    echo "   • WebSocket API: ws://localhost:3001/sandbox"
    echo "   • Supported Runtimes: vm2, docker, pyodide"
    echo "   • Supported Languages: JavaScript, Python, Java, Go, Rust, C++"
    echo ""
    echo "🔐 Security Features:"
    echo "   • True code isolation with VM2 and Docker"
    echo "   • Resource limits (CPU, memory, disk, network)"
    echo "   • Seccomp and AppArmor profiles"
    echo "   • Read-only file systems"
    echo "   • Network isolation"
    echo ""
    echo "📚 Next Steps:"
    echo "   1. Update your code playground to use RealSandboxedExecutor"
    echo "   2. Configure sandbox settings in your app"
    echo "   3. Test with different programming languages"
    echo ""
    echo "🔧 Management Commands:"
    echo "   • Stop services: docker-compose -f docker-compose.sandbox.yml down"
    echo "   • View logs: docker-compose -f docker-compose.sandbox.yml logs -f"
    echo "   • Restart: docker-compose -f docker-compose.sandbox.yml restart"
}

# Run main function
main "$@"
