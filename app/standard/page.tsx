"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import { Plus, Minus } from "lucide-react"
import styles from "./standard-metronome.module.css"

export default function StandardMetronome() {
  const [bpm, setBpm] = useState(70) // Default 70 BPM
  const [isPlaying, setIsPlaying] = useState(false)
  const [pendulumAngle, setPendulumAngle] = useState(0) // -45 to +45 degrees

  // Refs for audio and animation
  const audioContextRef = useRef<AudioContext | null>(null)
  const animationRef = useRef<number | null>(null)
  const startTimeRef = useRef<number | null>(null)
  const lastBeatTimeRef = useRef<number | null>(null)
  const currentBpmRef = useRef<number>(bpm)
  const previousAngleRef = useRef<number>(0)

  // Refs for button hold functionality
  const increaseIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const decreaseIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const increaseTimeoutsRef = useRef<NodeJS.Timeout[]>([])
  const decreaseTimeoutsRef = useRef<NodeJS.Timeout[]>([])

  // Refs to prevent double event firing on Safari
  const increaseTouchActiveRef = useRef<boolean>(false)
  const decreaseTouchActiveRef = useRef<boolean>(false)
  const lastIncreaseTimeRef = useRef<number>(0)
  const lastDecreaseTimeRef = useRef<number>(0)

  const MIN_BPM = 30
  const MAX_BPM = 240
  const BPM_STEP = 1
  const DEBOUNCE_TIME = 100
  const MAX_ANGLE = 45 // Maximum swing angle in degrees

  // Update the current BPM ref when bpm state changes
  useEffect(() => {
    currentBpmRef.current = bpm
  }, [bpm])

  // Initialize audio context
  useEffect(() => {
    try {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
    } catch (error) {
      console.error("Failed to create audio context:", error)
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
        animationRef.current = null
      }

      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        audioContextRef.current.close()
      }

      cleanupAllIntervals()
    }
  }, [])

  // Comprehensive cleanup function
  const cleanupAllIntervals = () => {
    if (increaseIntervalRef.current) {
      clearInterval(increaseIntervalRef.current)
      increaseIntervalRef.current = null
    }

    increaseTimeoutsRef.current.forEach((timeout) => {
      if (timeout) clearTimeout(timeout)
    })
    increaseTimeoutsRef.current = []

    if (decreaseIntervalRef.current) {
      clearInterval(decreaseIntervalRef.current)
      decreaseIntervalRef.current = null
    }

    decreaseTimeoutsRef.current.forEach((timeout) => {
      if (timeout) clearTimeout(timeout)
    })
    decreaseTimeoutsRef.current = []

    increaseTouchActiveRef.current = false
    decreaseTouchActiveRef.current = false
  }

  // Function to play a click tone using Web Audio API (same as circular version)
  const playClickTone = () => {
    if (!audioContextRef.current) return

    try {
      const context = audioContextRef.current

      if (context.state === "suspended") {
        context.resume()
      }

      const oscillator = context.createOscillator()
      const gainNode = context.createGain()

      oscillator.type = "sine"
      oscillator.frequency.setValueAtTime(220, context.currentTime)

      gainNode.gain.setValueAtTime(0.6, context.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.1)

      oscillator.connect(gainNode)
      gainNode.connect(context.destination)

      oscillator.start(context.currentTime)
      oscillator.stop(context.currentTime + 0.1)
    } catch (error) {
      console.error("Error playing click tone:", error)
    }
  }

  // Handle play/stop state changes
  useEffect(() => {
    if (isPlaying) {
      resetTiming()
      startAnimation()
    } else {
      stopAnimation()
    }
  }, [isPlaying])

  // Handle BPM changes
  useEffect(() => {
    if (isPlaying) {
      resetTiming()
      stopAnimation()
      startAnimation()
    }
  }, [bpm])

  // Reset timing references
  const resetTiming = () => {
    if (audioContextRef.current && audioContextRef.current.state === "suspended") {
      audioContextRef.current.resume()
    }

    const now = performance.now()
    startTimeRef.current = now
    lastBeatTimeRef.current = now

    setPendulumAngle(0)
    previousAngleRef.current = 0
  }

  // Start animation
  const startAnimation = () => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current)
    }
    animatePendulum()
  }

  // Stop animation
  const stopAnimation = () => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current)
      animationRef.current = null
    }
    setPendulumAngle(0)
  }

  // Pendulum animation function
  const animatePendulum = () => {
    const animate = (timestamp: number) => {
      if (!isPlaying) {
        stopAnimation()
        return
      }

      if (!startTimeRef.current) {
        startTimeRef.current = timestamp
      }

      const currentBpm = currentBpmRef.current

      // Calculate how long one complete swing cycle should take
      // For a metronome, one beat = one swing from center to side and back to center
      // So one complete cycle (left-center-right-center) = 2 beats
      const beatDuration = 60000 / currentBpm // milliseconds per beat
      const cycleDuration = beatDuration * 2 // full swing cycle duration

      // Calculate elapsed time since start
      const elapsedTime = timestamp - startTimeRef.current

      // Calculate position in the swing cycle (0 to 1)
      const cycleProgress = (elapsedTime % cycleDuration) / cycleDuration

      // Convert to pendulum angle using cosine for natural pendulum motion
      // This creates: left (-45°) -> center (0°) -> right (+45°) -> center (0°) -> repeat
      const angle = MAX_ANGLE * Math.cos(cycleProgress * Math.PI * 2)

      // Store the previous angle for center crossing detection
      const previousAngle = previousAngleRef.current

      // Detect center crossing (when pendulum passes through 0 degrees)
      // Beat occurs when crossing center line
      if ((previousAngle < -5 && angle >= -5) || (previousAngle > 5 && angle <= 5)) {
        // Check if enough time has passed since last beat
        const timeSinceLastBeat = timestamp - (lastBeatTimeRef.current || startTimeRef.current)
        if (timeSinceLastBeat > beatDuration * 0.8) {
          playClickTone()
          lastBeatTimeRef.current = timestamp
        }
      }

      previousAngleRef.current = angle
      setPendulumAngle(angle)

      if (isPlaying) {
        animationRef.current = requestAnimationFrame(animate)
      } else {
        stopAnimation()
      }
    }

    animationRef.current = requestAnimationFrame(animate)
  }

  const togglePlay = () => {
    setIsPlaying(!isPlaying)
  }

  const increaseTempo = () => {
    if (bpm < MAX_BPM) {
      setBpm((prev) => prev + BPM_STEP)
    }
  }

  const decreaseTempo = () => {
    if (bpm > MIN_BPM) {
      setBpm((prev) => prev - BPM_STEP)
    }
  }

  // Debounced functions
  const debouncedIncrease = () => {
    const now = Date.now()
    if (now - lastIncreaseTimeRef.current < DEBOUNCE_TIME) return
    lastIncreaseTimeRef.current = now
    increaseTempo()
  }

  const debouncedDecrease = () => {
    const now = Date.now()
    if (now - lastDecreaseTimeRef.current < DEBOUNCE_TIME) return
    lastDecreaseTimeRef.current = now
    decreaseTempo()
  }

  // Touch event handlers (same as circular version)
  const handleIncreaseTouchStart = (e: React.TouchEvent) => {
    e.preventDefault()
    if (increaseTouchActiveRef.current) return

    increaseTouchActiveRef.current = true
    cleanupAllIntervals()
    debouncedIncrease()

    increaseIntervalRef.current = setInterval(() => {
      setBpm((prev) => (prev < MAX_BPM ? prev + BPM_STEP : prev))
    }, 500)

    const firstAcceleration = setTimeout(() => {
      if (increaseIntervalRef.current) {
        clearInterval(increaseIntervalRef.current)
        setBpm((prev) => (prev < MAX_BPM ? prev + BPM_STEP : prev))

        increaseIntervalRef.current = setInterval(() => {
          setBpm((prev) => (prev < MAX_BPM ? prev + BPM_STEP : prev))
        }, 300)

        const secondAcceleration = setTimeout(() => {
          if (increaseIntervalRef.current) {
            clearInterval(increaseIntervalRef.current)
            setBpm((prev) => (prev < MAX_BPM ? prev + BPM_STEP : prev))

            increaseIntervalRef.current = setInterval(() => {
              setBpm((prev) => (prev < MAX_BPM ? prev + BPM_STEP : prev))
            }, 200)
          }
        }, 2000)

        increaseTimeoutsRef.current.push(secondAcceleration)
      }
    }, 3000)

    increaseTimeoutsRef.current.push(firstAcceleration)
  }

  const handleIncreaseTouchEnd = (e: React.TouchEvent) => {
    e.preventDefault()
    increaseTouchActiveRef.current = false

    if (increaseIntervalRef.current) {
      clearInterval(increaseIntervalRef.current)
      increaseIntervalRef.current = null
    }

    increaseTimeoutsRef.current.forEach((timeout) => {
      if (timeout) clearTimeout(timeout)
    })
    increaseTimeoutsRef.current = []
  }

  const handleIncreaseMouseDown = (e: React.MouseEvent) => {
    if (increaseTouchActiveRef.current) return

    cleanupAllIntervals()
    debouncedIncrease()

    increaseIntervalRef.current = setInterval(() => {
      setBpm((prev) => (prev < MAX_BPM ? prev + BPM_STEP : prev))
    }, 500)

    const firstAcceleration = setTimeout(() => {
      if (increaseIntervalRef.current) {
        clearInterval(increaseIntervalRef.current)
        setBpm((prev) => (prev < MAX_BPM ? prev + BPM_STEP : prev))

        increaseIntervalRef.current = setInterval(() => {
          setBpm((prev) => (prev < MAX_BPM ? prev + BPM_STEP : prev))
        }, 300)

        const secondAcceleration = setTimeout(() => {
          if (increaseIntervalRef.current) {
            clearInterval(increaseIntervalRef.current)
            setBpm((prev) => (prev < MAX_BPM ? prev + BPM_STEP : prev))

            increaseIntervalRef.current = setInterval(() => {
              setBpm((prev) => (prev < MAX_BPM ? prev + BPM_STEP : prev))
            }, 200)
          }
        }, 2000)

        increaseTimeoutsRef.current.push(secondAcceleration)
      }
    }, 3000)

    increaseTimeoutsRef.current.push(firstAcceleration)
  }

  const handleIncreaseMouseUp = () => {
    if (increaseTouchActiveRef.current) return

    if (increaseIntervalRef.current) {
      clearInterval(increaseIntervalRef.current)
      increaseIntervalRef.current = null
    }

    increaseTimeoutsRef.current.forEach((timeout) => {
      if (timeout) clearTimeout(timeout)
    })
    increaseTimeoutsRef.current = []
  }

  // Decrease handlers (same pattern)
  const handleDecreaseTouchStart = (e: React.TouchEvent) => {
    e.preventDefault()
    if (decreaseTouchActiveRef.current) return

    decreaseTouchActiveRef.current = true
    cleanupAllIntervals()
    debouncedDecrease()

    decreaseIntervalRef.current = setInterval(() => {
      setBpm((prev) => (prev > MIN_BPM ? prev - BPM_STEP : prev))
    }, 500)

    const firstAcceleration = setTimeout(() => {
      if (decreaseIntervalRef.current) {
        clearInterval(decreaseIntervalRef.current)
        setBpm((prev) => (prev > MIN_BPM ? prev - BPM_STEP : prev))

        decreaseIntervalRef.current = setInterval(() => {
          setBpm((prev) => (prev > MIN_BPM ? prev - BPM_STEP : prev))
        }, 300)

        const secondAcceleration = setTimeout(() => {
          if (decreaseIntervalRef.current) {
            clearInterval(decreaseIntervalRef.current)
            setBpm((prev) => (prev > MIN_BPM ? prev - BPM_STEP : prev))

            decreaseIntervalRef.current = setInterval(() => {
              setBpm((prev) => (prev > MIN_BPM ? prev - BPM_STEP : prev))
            }, 200)
          }
        }, 2000)

        decreaseTimeoutsRef.current.push(secondAcceleration)
      }
    }, 3000)

    decreaseTimeoutsRef.current.push(firstAcceleration)
  }

  const handleDecreaseTouchEnd = (e: React.TouchEvent) => {
    e.preventDefault()
    decreaseTouchActiveRef.current = false

    if (decreaseIntervalRef.current) {
      clearInterval(decreaseIntervalRef.current)
      decreaseIntervalRef.current = null
    }

    decreaseTimeoutsRef.current.forEach((timeout) => {
      if (timeout) clearTimeout(timeout)
    })
    decreaseTimeoutsRef.current = []
  }

  const handleDecreaseMouseDown = (e: React.MouseEvent) => {
    if (decreaseTouchActiveRef.current) return

    cleanupAllIntervals()
    debouncedDecrease()

    decreaseIntervalRef.current = setInterval(() => {
      setBpm((prev) => (prev > MIN_BPM ? prev - BPM_STEP : prev))
    }, 500)

    const firstAcceleration = setTimeout(() => {
      if (decreaseIntervalRef.current) {
        clearInterval(decreaseIntervalRef.current)
        setBpm((prev) => (prev > MIN_BPM ? prev - BPM_STEP : prev))

        decreaseIntervalRef.current = setInterval(() => {
          setBpm((prev) => (prev > MIN_BPM ? prev - BPM_STEP : prev))
        }, 300)

        const secondAcceleration = setTimeout(() => {
          if (decreaseIntervalRef.current) {
            clearInterval(decreaseIntervalRef.current)
            setBpm((prev) => (prev > MIN_BPM ? prev - BPM_STEP : prev))

            decreaseIntervalRef.current = setInterval(() => {
              setBpm((prev) => (prev > MIN_BPM ? prev - BPM_STEP : prev))
            }, 200)
          }
        }, 2000)

        decreaseTimeoutsRef.current.push(secondAcceleration)
      }
    }, 3000)

    decreaseTimeoutsRef.current.push(firstAcceleration)
  }

  const handleDecreaseMouseUp = () => {
    if (decreaseTouchActiveRef.current) return

    if (decreaseIntervalRef.current) {
      clearInterval(decreaseIntervalRef.current)
      decreaseIntervalRef.current = null
    }

    decreaseTimeoutsRef.current.forEach((timeout) => {
      if (timeout) clearTimeout(timeout)
    })
    decreaseTimeoutsRef.current = []
  }

  // Text color for BPM display
  const bpmTextColor = isPlaying ? "#000" : "#aaa"

  return (
    <div className={styles.container}>
      <div
        className={styles.metronomeBase}
        onClick={togglePlay}
        role="button"
        aria-label={isPlaying ? "Stop metronome" : "Start metronome"}
        tabIndex={0}
      >
        {/* SVG Triangle Frame */}
        <svg width="350" height="303" className={styles.triangleSvg}>
          {/* Triangle outline with 350px base */}
          <polygon points="175,10 340,290 10,290" fill="none" stroke="#333" strokeWidth="4" />
          {/* Vertical center line at apex */}
          <line x1="175" y1="10" x2="175" y2="60" stroke="#333" strokeWidth="4" />
        </svg>

        {/* Pivot point at the bottom center of the triangle */}
        <div className={styles.pivot} />

        {/* Pendulum arm */}
        <div
          className={styles.pendulumArm}
          style={{
            transform: `rotate(${pendulumAngle}deg)`,
            transformOrigin: "bottom center",
          }}
        >
          {/* Weight at the top of the arm */}
          <div
            className={styles.weight}
            style={{
              backgroundColor: isPlaying ? "#d10000" : "#aaa",
            }}
          />
        </div>
      </div>

      <div className={styles.controls}>
        <button
          className={styles.tempoButton}
          onMouseDown={handleDecreaseMouseDown}
          onMouseUp={handleDecreaseMouseUp}
          onMouseLeave={handleDecreaseMouseUp}
          onTouchStart={handleDecreaseTouchStart}
          onTouchEnd={handleDecreaseTouchEnd}
          onTouchCancel={handleDecreaseTouchEnd}
          onContextMenu={(e) => e.preventDefault()}
          aria-label="Decrease tempo"
        >
          <Minus size={24} />
        </button>
        <div className={styles.bpmDisplay}>
          <div className={styles.bpmValue} style={{ color: bpmTextColor }}>
            {bpm}
          </div>
          <div className={styles.bpmLabel} style={{ color: bpmTextColor }}>
            BPM
          </div>
        </div>
        <button
          className={styles.tempoButton}
          onMouseDown={handleIncreaseMouseDown}
          onMouseUp={handleIncreaseMouseUp}
          onMouseLeave={handleIncreaseMouseUp}
          onTouchStart={handleIncreaseTouchStart}
          onTouchEnd={handleIncreaseTouchEnd}
          onTouchCancel={handleIncreaseTouchEnd}
          onContextMenu={(e) => e.preventDefault()}
          aria-label="Increase tempo"
        >
          <Plus size={24} />
        </button>
      </div>
    </div>
  )
}
