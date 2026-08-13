package main

import (
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/recoder/recoder-terminal/tsunami/app"
	"github.com/recoder/recoder-terminal/tsunami/vdom"
)

var AppMeta = app.AppMeta{
	Title:     "Pomodoro Timer (Tsunami Demo)",
	ShortDesc: "Productivity timer with work and break intervals",
}

type Mode struct {
	Name     string `json:"name"`
	Duration int    `json:"duration"` // in minutes
}

var (
	WorkMode  = Mode{Name: "Work", Duration: 25}
	BreakMode = Mode{Name: "Break", Duration: 5}

	// Data atom to expose remaining seconds to external systems
	remainingSecondsAtom = app.DataAtom("remainingSeconds", WorkMode.Duration*60, &app.AtomMeta{
		Desc:  "Remaining seconds in current pomodoro timer",
		Units: "s",
		Min:   app.Ptr(0.0),
		Max:   app.Ptr(3600.0),
	})

	// Timer state is held in package-level shared atoms (rather than component-local
	// UseLocal state) so the same start/pause/reset handlers can be driven by both
	// the UI buttons AND named actions invoked over /api/action by an agent.
	isRunningAtom  = app.SharedAtom("isRunning", false)
	isCompleteAtom = app.SharedAtom("isComplete", false)
	modeAtom       = app.SharedAtom("mode", WorkMode.Name)
)

// pomodoroClock tracks the wall-clock start and total duration of the running
// timer. It is guarded by a mutex because the UI ticker goroutine and action HTTP
// goroutines can touch it concurrently.
type pomodoroClock struct {
	mu            sync.Mutex
	startTime     time.Time
	totalDuration time.Duration
}

var clock = &pomodoroClock{}

func (c *pomodoroClock) begin(total time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.startTime = time.Now()
	c.totalDuration = total
}

func (c *pomodoroClock) remaining() time.Duration {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.totalDuration - time.Since(c.startTime)
}

func startTimer() {
	if isRunningAtom.Get() {
		return
	}
	isCompleteAtom.Set(false)
	clock.begin(time.Duration(remainingSecondsAtom.Get()) * time.Second)
	isRunningAtom.Set(true)
}

func pauseTimer() {
	if !isRunningAtom.Get() {
		return
	}
	remaining := clock.remaining()
	if remaining > 0 {
		remainingSecondsAtom.Set(int(remaining.Seconds()))
	}
	isRunningAtom.Set(false)
}

func resetTimer() {
	isRunningAtom.Set(false)
	isCompleteAtom.Set(false)
	if modeAtom.Get() == WorkMode.Name {
		remainingSecondsAtom.Set(WorkMode.Duration * 60)
	} else {
		remainingSecondsAtom.Set(BreakMode.Duration * 60)
	}
}

func changeMode(duration int) {
	isRunningAtom.Set(false)
	isCompleteAtom.Set(false)
	remainingSecondsAtom.Set(duration * 60)
	if duration == WorkMode.Duration {
		modeAtom.Set(WorkMode.Name)
	} else {
		modeAtom.Set(BreakMode.Name)
	}
}

func timerStatus() any {
	return map[string]any{
		"running":          isRunningAtom.Get(),
		"mode":             modeAtom.Get(),
		"remainingSeconds": remainingSecondsAtom.Get(),
	}
}

func init() {
	app.RegisterActionWithMeta("start", &app.ActionMeta{Desc: "Start (or resume) the pomodoro timer"},
		func(_ json.RawMessage) (any, error) {
			startTimer()
			return timerStatus(), nil
		})
	app.RegisterActionWithMeta("pause", &app.ActionMeta{Desc: "Pause the running pomodoro timer"},
		func(_ json.RawMessage) (any, error) {
			pauseTimer()
			return timerStatus(), nil
		})
	app.RegisterActionWithMeta("reset", &app.ActionMeta{Desc: "Reset the pomodoro timer to the start of the current mode"},
		func(_ json.RawMessage) (any, error) {
			resetTimer()
			return timerStatus(), nil
		})
}

type TimerDisplayProps struct {
	RemainingSeconds int    `json:"remainingSeconds"`
	Mode             string `json:"mode"`
}

type ControlButtonsProps struct {
	IsRunning bool      `json:"isRunning"`
	OnStart   func()    `json:"onStart"`
	OnPause   func()    `json:"onPause"`
	OnReset   func()    `json:"onReset"`
	OnMode    func(int) `json:"onMode"`
}

var TimerDisplay = app.DefineComponent("TimerDisplay",
	func(props TimerDisplayProps) any {
		minutes := props.RemainingSeconds / 60
		seconds := props.RemainingSeconds % 60
		return vdom.H("div",
			map[string]any{"className": "bg-slate-700 p-8 rounded-lg mb-8 text-center"},
			vdom.H("div",
				map[string]any{"className": "text-xl text-blue-400 mb-2"},
				props.Mode,
			),
			vdom.H("div",
				map[string]any{"className": "text-6xl font-bold font-mono text-slate-100"},
				fmt.Sprintf("%02d:%02d", minutes, seconds),
			),
		)
	},
)

var ControlButtons = app.DefineComponent("ControlButtons",
	func(props ControlButtonsProps) any {
		return vdom.H("div",
			map[string]any{"className": "flex flex-col gap-4"},
			vdom.IfElse(props.IsRunning,
				vdom.H("button",
					map[string]any{
						"className": "px-6 py-3 text-lg border-none rounded bg-blue-500 text-white cursor-pointer hover:bg-blue-600 transition-colors duration-200",
						"onClick":   props.OnPause,
					},
					"Pause",
				),
				vdom.H("button",
					map[string]any{
						"className": "px-6 py-3 text-lg border-none rounded bg-blue-500 text-white cursor-pointer hover:bg-blue-600 transition-colors duration-200",
						"onClick":   props.OnStart,
					},
					"Start",
				),
			),
			vdom.H("button",
				map[string]any{
					"className": "px-6 py-3 text-lg border-none rounded bg-blue-500 text-white cursor-pointer hover:bg-blue-600 transition-colors duration-200",
					"onClick":   props.OnReset,
				},
				"Reset",
			),
			vdom.H("div",
				map[string]any{"className": "flex gap-4 mt-4"},
				vdom.H("button",
					map[string]any{
						"className": "flex-1 px-3 py-3 text-base border-none rounded bg-green-500 text-white cursor-pointer hover:bg-green-600 transition-colors duration-200",
						"onClick":   func() { props.OnMode(WorkMode.Duration) },
					},
					"Work Mode",
				),
				vdom.H("button",
					map[string]any{
						"className": "flex-1 px-3 py-3 text-base border-none rounded bg-green-500 text-white cursor-pointer hover:bg-green-600 transition-colors duration-200",
						"onClick":   func() { props.OnMode(BreakMode.Duration) },
					},
					"Break Mode",
				),
			),
		)
	},
)

var App = app.DefineComponent("App",
	func(_ struct{}) any {

		// Timer that updates every second using the new pattern
		app.UseTicker(time.Second, func() {
			if !isRunningAtom.Get() {
				return
			}

			remaining := clock.remaining()

			if remaining <= 0 {
				// Timer completed
				isRunningAtom.Set(false)
				remainingSecondsAtom.Set(0)
				isCompleteAtom.Set(true)
				return
			}

			newSeconds := int(remaining.Seconds())

			// Only send update if value actually changed
			if newSeconds != remainingSecondsAtom.Get() {
				remainingSecondsAtom.Set(newSeconds)
			}
		}, []any{isRunningAtom.Get()})

		return vdom.H("div",
			map[string]any{"className": "max-w-sm mx-auto my-8 p-8 bg-slate-800 rounded-xl text-slate-100 font-sans"},
			vdom.H("h1",
				map[string]any{"className": "text-center text-slate-100 mb-8 text-3xl"},
				"Pomodoro Timer",
			),
			TimerDisplay(TimerDisplayProps{
				RemainingSeconds: remainingSecondsAtom.Get(),
				Mode:             modeAtom.Get(),
			}),
			ControlButtons(ControlButtonsProps{
				IsRunning: isRunningAtom.Get(),
				OnStart:   startTimer,
				OnPause:   pauseTimer,
				OnReset:   resetTimer,
				OnMode:    changeMode,
			}),
		)
	},
)
