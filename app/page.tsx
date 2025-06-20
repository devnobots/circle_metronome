"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import { Plus, Minus } from "lucide-react"
import styles from "./metronome.module.css"

export default function Metronome() {
  const [bpm, setBpm] = useState(70) // Default 70 BPM
  const [isPlaying, setIsPlaying] = useState(false)
  const [dotPosition, setDotPosition] = useState(0) // 0 to 360 degrees
  const [scaleEffect, setScaleEffect] = useState(1) // Scale factor for zoom effect
  const [hasReached75Percent, setHasReached75Percent] = useState(false) // Track if dot has reached 75% position

  // Refs for audio and animation
  const audioContextRef = useRef<AudioContext | null>(null)
  const animationRef = useRef<number | null>(null)
  const startTimeRef = useRef<number | null>(null)
  const lastBeatTimeRef = useRef<number | null>(null)
  const currentBpmRef = useRef<number>(bpm)

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
  const BPM_STEP = 1 // Single-digit increments
  const DEBOUNCE_TIME = 100 // Minimum time between actions in ms

  // Update the current BPM ref when bpm state changes
  useEffect(() => {
    currentBpmRef.current = bpm
  }, [bpm])

  // Initialize audio context
  useEffect(() => {
    // Create audio context on component mount
    try {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
    } catch (error) {
      console.error("Failed to create audio context:", error)
    }

    return () => {
      // Clean up on unmount
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
        animationRef.current = null
      }

      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        audioContextRef.current.close()
      }

      // Clean up all intervals and timeouts
      cleanupAllIntervals()
    }
  }, [])

  // Comprehensive cleanup function
  const cleanupAllIntervals = () => {
    // Clear increase button intervals and timeouts
    if (increaseIntervalRef.current) {
      clearInterval(increaseIntervalRef.current)
      increaseIntervalRef.current = null
    }

    increaseTimeoutsRef.current.forEach((timeout) => {
      if (timeout) clearTimeout(timeout)
    })
    increaseTimeoutsRef.current = []

    // Clear decrease button intervals and timeouts
    if (decreaseIntervalRef.current) {
      clearInterval(decreaseIntervalRef.current)
      decreaseIntervalRef.current = null
    }

    decreaseTimeoutsRef.current.forEach((timeout) => {
      if (timeout) clearTimeout(timeout)
    })
    decreaseTimeoutsRef.current = []

    // Reset touch flags
    increaseTouchActiveRef.current = false
    decreaseTouchActiveRef.current = false
  }

  // Function to play a click tone using Web Audio API
  const playClickTone = () => {
    if (!audioContextRef.current) return

    try {
      const context = audioContextRef.current

      // Resume the audio context if it's suspended (browser autoplay policy)
      if (context.state === "suspended") {
        context.resume()
      }

      // Create an oscillator (tone generator)
      const oscillator = context.createOscillator()
      const gainNode = context.createGain()

      // Configure the oscillator
      oscillator.type = "sine" // Sine wave for a clean tone
      oscillator.frequency.setValueAtTime(220, context.currentTime) // A3 note (220 Hz)

      // Configure the gain (volume)
      gainNode.gain.setValueAtTime(0.6, context.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.1)

      // Connect the nodes
      oscillator.connect(gainNode)
      gainNode.connect(context.destination)

      // Play the tone
      oscillator.start(context.currentTime)
      oscillator.stop(context.currentTime + 0.1) // Short duration
    } catch (error) {
      console.error("Error playing click tone:", error)
    }
  }

  // Handle play/stop state changes
  useEffect(() => {
    if (isPlaying) {
      // Reset timing references and start animation
      resetTiming()
      startAnimation()
      // Reset 75% flag when starting
      setHasReached75Percent(false)
    } else {
      // Stop the animation
      stopAnimation()
    }
  }, [isPlaying])

  // Handle BPM changes
  useEffect(() => {
    if (isPlaying) {
      // If already playing, reset timing with new BPM
      resetTiming()

      // Stop and restart animation to use new BPM
      stopAnimation()
      startAnimation()
      // Reset 75% flag when changing BPM
      setHasReached75Percent(false)
    }
  }, [bpm])

  // Reset timing references
  const resetTiming = () => {
    // Resume audio context if needed
    if (audioContextRef.current && audioContextRef.current.state === "suspended") {
      audioContextRef.current.resume()
    }

    // Reset timing references
    const now = performance.now()
    startTimeRef.current = now
    lastBeatTimeRef.current = now

    // Reset dot position to top
    setDotPosition(0)
  }

  // Start animation
  const startAnimation = () => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current)
    }
    animateMetronome()
  }

  // Stop animation
  const stopAnimation = () => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current)
      animationRef.current = null
    }
    // Reset dot position to top when stopped
    setDotPosition(0)
  }

  // Track when dot reaches 75% position (270 degrees)
  useEffect(() => {
    if (isPlaying && dotPosition >= 270 && !hasReached75Percent) {
      setHasReached75Percent(true)
    }
  }, [dotPosition, isPlaying, hasReached75Percent])

  // Calculate zoom effect based on dot position (only after reaching 75% position)
  useEffect(() => {
    if (isPlaying && hasReached75Percent) {
      // Zoom effect kicks in at 75% of the way to the top (270 degrees) and continues until 25% (90 degrees)
      // Check if dot is in the zoom range (between 270° and 90° via the top)
      const isInZoomRange = dotPosition >= 270 || dotPosition <= 90

      if (isInZoomRange) {
        // Calculate distance from top (0 degrees)
        let distanceFromTop
        if (dotPosition >= 270) {
          // Coming up to the top from the left side (270° to 360°)
          distanceFromTop = 360 - dotPosition
        } else {
          // Going away from the top on the right side (0° to 90°)
          distanceFromTop = dotPosition
        }

        // Maximum distance in zoom range is 90 degrees
        const maxZoomDistance = 90

        // Calculate scale factor (0.7 to 0.9)
        // When dot is at top (distanceFromTop = 0), scale = 0.9 (450px)
        // When dot is at edge of range (distanceFromTop = 90), scale = 0.7 (350px)
        const zoomFactor = 0.7 + 0.2 * (1 - distanceFromTop / maxZoomDistance)
        setScaleEffect(zoomFactor)
      } else {
        // Outside zoom range, normal running size
        setScaleEffect(0.7)
      }
    } else {
      // When stopped or hasn't reached 75% yet, keep at normal size
      setScaleEffect(0.7)
    }
  }, [dotPosition, isPlaying, hasReached75Percent])

  // Improved animation function with more precise timing
  const animateMetronome = () => {
    const animate = (timestamp: number) => {
      // Check if we should still be animating
      if (!isPlaying) {
        stopAnimation()
        return
      }

      if (!startTimeRef.current) {
        startTimeRef.current = timestamp
      }

      if (!lastBeatTimeRef.current) {
        lastBeatTimeRef.current = timestamp
      }

      // Get the current BPM from the ref (to avoid closure issues)
      const currentBpm = currentBpmRef.current

      // Calculate beat duration in milliseconds
      const beatDuration = 60000 / currentBpm

      // Calculate elapsed time since last beat
      const elapsedSinceLastBeat = timestamp - lastBeatTimeRef.current

      // Check if it's time for a new beat
      if (elapsedSinceLastBeat >= beatDuration) {
        // Play the click sound
        playClickTone()

        // Update last beat time, accounting for any drift
        const beatsSinceLastBeat = Math.floor(elapsedSinceLastBeat / beatDuration)
        lastBeatTimeRef.current = lastBeatTimeRef.current + beatsSinceLastBeat * beatDuration
      }

      // Calculate the precise position within the current beat (0 to 1)
      const beatProgress = (elapsedSinceLastBeat % beatDuration) / beatDuration

      // Convert to degrees (0 to 360)
      const newPosition = beatProgress * 360

      // Update dot position
      setDotPosition(newPosition)

      // Continue the animation only if still playing
      if (isPlaying) {
        animationRef.current = requestAnimationFrame(animate)
      } else {
        stopAnimation()
      }
    }

    // Start the animation loop
    animationRef.current = requestAnimationFrame(animate)
  }

  const togglePlay = () => {
    // Toggle play state
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

  // Debounced increase function to prevent double firing
  const debouncedIncrease = () => {
    const now = Date.now()
    if (now - lastIncreaseTimeRef.current < DEBOUNCE_TIME) {
      return // Too soon, ignore this call
    }
    lastIncreaseTimeRef.current = now
    increaseTempo()
  }

  // Debounced decrease function to prevent double firing
  const debouncedDecrease = () => {
    const now = Date.now()
    if (now - lastDecreaseTimeRef.current < DEBOUNCE_TIME) {
      return // Too soon, ignore this call
    }
    lastDecreaseTimeRef.current = now
    decreaseTempo()
  }

  // Handle increase button touch start
  const handleIncreaseTouchStart = (e: React.TouchEvent) => {
    e.preventDefault() // Prevent mouse events from firing
    if (increaseTouchActiveRef.current) return // Already active

    increaseTouchActiveRef.current = true
    cleanupAllIntervals()
    debouncedIncrease()

    // Set up intervals for hold behavior
    increaseIntervalRef.current = setInterval(() => {
      setBpm((prev) => (prev < MAX_BPM ? prev + BPM_STEP : prev))
    }, 500)

    // First acceleration after 3 seconds
    const firstAcceleration = setTimeout(() => {
      if (increaseIntervalRef.current) {
        clearInterval(increaseIntervalRef.current)
        setBpm((prev) => (prev < MAX_BPM ? prev + BPM_STEP : prev))

        increaseIntervalRef.current = setInterval(() => {
          setBpm((prev) => (prev < MAX_BPM ? prev + BPM_STEP : prev))
        }, 300)

        // Second acceleration after 5 seconds total
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

  // Handle increase button touch end
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

  // Handle increase button mouse events (only if touch is not active)
  const handleIncreaseMouseDown = (e: React.MouseEvent) => {
    if (increaseTouchActiveRef.current) return // Touch is active, ignore mouse

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
    if (increaseTouchActiveRef.current) return // Touch is active, ignore mouse

    if (increaseIntervalRef.current) {
      clearInterval(increaseIntervalRef.current)
      increaseIntervalRef.current = null
    }

    increaseTimeoutsRef.current.forEach((timeout) => {
      if (timeout) clearTimeout(timeout)
    })
    increaseTimeoutsRef.current = []
  }

  // Handle decrease button touch start
  const handleDecreaseTouchStart = (e: React.TouchEvent) => {
    e.preventDefault() // Prevent mouse events from firing
    if (decreaseTouchActiveRef.current) return // Already active

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

  // Handle decrease button touch end
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

  // Handle decrease button mouse events (only if touch is not active)
  const handleDecreaseMouseDown = (e: React.MouseEvent) => {
    if (decreaseTouchActiveRef.current) return // Touch is active, ignore mouse

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
    if (decreaseTouchActiveRef.current) return // Touch is active, ignore mouse

    if (decreaseIntervalRef.current) {
      clearInterval(decreaseIntervalRef.current)
      decreaseIntervalRef.current = null
    }

    decreaseTimeoutsRef.current.forEach((timeout) => {
      if (timeout) clearTimeout(timeout)
    })
    decreaseTimeoutsRef.current = []
  }

  // Calculate dot position on the circle
  const dotX = 50 + 50 * Math.sin((dotPosition * Math.PI) / 180)
  const dotY = 50 - 50 * Math.cos((dotPosition * Math.PI) / 180)

  // Text color for BPM display - light gray when stopped, black when playing
  const bpmTextColor = isPlaying ? "#000" : "#aaa"

  // Calculate final scale
  const finalScale = scaleEffect

  return (
    <div className={styles.container}>
      <div
        className={styles.metronomeCircle}
        onClick={togglePlay}
        role="button"
        aria-label={isPlaying ? "Stop metronome" : "Start metronome"}
        tabIndex={0}
        style={{
          transform: `scale(${finalScale})`,
          transition: isPlaying ? "transform 0.05s ease-out" : "transform 0.3s ease-out",
        }}
      >
        <div className={styles.topMarker} />
        <div
          className={styles.dot}
          style={{
            left: `${dotX}%`,
            top: `${dotY}%`,
            transform: `translate(-50%, -50%)`,
            transition: "transform 0.05s ease-out",
            backgroundColor: isPlaying ? "#d10000" : "#aaa",
          }}
        />
        {/* BPM display removed from here */}
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
