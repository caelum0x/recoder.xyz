package main

import "sync/atomic"

// readiness is a goroutine-safe liveness/readiness flag for /healthz.
type readiness struct {
	ok atomic.Bool
}

func newReadiness() *readiness {
	return &readiness{}
}

func (r *readiness) set(v bool) { r.ok.Store(v) }

func (r *readiness) get() bool { return r.ok.Load() }
