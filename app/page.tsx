"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import { Plus, Minus } from "lucide-react"
import styles from "./metronome.module.css"

export default function Metronome() {
  // ===== CONFIGURABLE VARIABLES =====
  const MAX_TRIAL_SESSION_COUNT = 2 // After this many sessions, trial mode kicks in
  const EXPIRED_TRIAL_RUN_TIME_SECONDS = 10 // How long metronome runs before decrement mode

  const [bpm, setBpm] = useState(70) // Default 70 BPM - this is the actual BPM used for timing
  const [isPlaying, setIsPlaying] = useState(false)
  const [dotPosition, setDotPosition] = useState(0) // 0 to 360 degrees
  const [scaleEffect, setScaleEffect] = useState(1) // Scale factor for zoom effect
  const [hasReached75Percent, setHasReached75Percent] = useState(false) // Track if dot has reached 75% position

  // Simplified state management
  const [displayBpm, setDisplayBpm] = useState(70) // BPM shown in the display
  const [isSlowingDown, setIsSlowingDown] = useState(false) // Track if we're in slowdown mode

  // Add state for showing the upgrade message
  const [showUpgradeMessage, setShowUpgradeMessage] = useState(false)

  // Session tracking state
  const [sessionCount, setSessionCount] = useState(0)
  const [isTrialExpired, setIsTrialExpired] = useState(false)
  const [hasUpgraded, setHasUpgraded] = useState(false)

  // Add these state variables after the existing state declarations
  const [tapTimes, setTapTimes] = useState<number[]>([])
  const [showTapButton, setShowTapButton] = useState(false)
  const tapTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Refs for audio and animation
  const audioContextRef = useRef<AudioContext | null>(null)
  const animationRef = useRef<number | null>(null)
  const startTimeRef = useRef<number | null>(null)
  const lastBeatTimeRef = useRef<number | null>(null)
  const currentBpmRef = useRef<number>(bpm)

  // Slowdown-specific refs
  const runningTimeRef = useRef<number>(0)
  const timeTrackingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const originalBpmRef = useRef<number>(70) // Store original BPM for display
  const hasDecrementedThisCycleRef = useRef<boolean>(false) // Track if we've decremented on this beat cycle

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

  // Initialize session tracking
  useEffect(() => {
    // Get session count from localStorage
    const storedSessionCount = localStorage.getItem("metronome_session_count")
    const storedHasUpgraded = localStorage.getItem("metronome_has_upgraded")

    const currentSessionCount = storedSessionCount ? Number.parseInt(storedSessionCount) : 0
    const userHasUpgraded = storedHasUpgraded === "true"

    // Increment session count
    const newSessionCount = currentSessionCount + 1
    localStorage.setItem("metronome_session_count", newSessionCount.toString())

    setSessionCount(newSessionCount)
    setHasUpgraded(userHasUpgraded)

    // Check if trial has expired
    if (newSessionCount > MAX_TRIAL_SESSION_COUNT && !userHasUpgraded) {
      setIsTrialExpired(true)
    }
  }, [])

  // Keep currentBpmRef in sync with bpm
  useEffect(() => {
    currentBpmRef.current = bpm
  }, [bpm])

  // Sync displayBpm with bpm ONLY when not in slowdown mode
  useEffect(() => {
    if (!isSlowingDown) {
      setDisplayBpm(bpm)
    }
  }, [bpm, isSlowingDown])

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

    // Clear time tracking interval
    if (timeTrackingIntervalRef.current) {
      clearInterval(timeTrackingIntervalRef.current)
      timeTrackingIntervalRef.current = null
    }

    // Reset touch flags
    increaseTouchActiveRef.current = false
    decreaseTouchActiveRef.current = false

    // Clear tap timeout
    if (tapTimeoutRef.current) {
      clearTimeout(tapTimeoutRef.current)
      tapTimeoutRef.current = null
    }
  }

  // Function to play a click tone using Web Audio API
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

  // Function to play tap tone at 220 Hz
  const playTapTone = () => {
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
      console.error("Error playing tap tone:", error)
    }
  }

  // Add the TAP button functions after the existing functions:

  const handleTap = () => {
    const now = Date.now()

    // Play the tap tone
    playTapTone()

    // Clear existing timeout
    if (tapTimeoutRef.current) {
      clearTimeout(tapTimeoutRef.current)
    }

    setTapTimes((prev) => {
      const newTimes = [...prev, now]

      // Keep only the last 8 taps for better accuracy
      if (newTimes.length > 8) {
        newTimes.shift()
      }

      // Calculate BPM if we have at least 2 taps
      if (newTimes.length >= 2) {
        const intervals = []
        for (let i = 1; i < newTimes.length; i++) {
          intervals.push(newTimes[i] - newTimes[i - 1])
        }

        // Calculate average interval
        const avgInterval = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length

        // Convert to BPM (60000 ms = 1 minute)
        const calculatedBpm = Math.round(60000 / avgInterval)

        // Only update if BPM is within reasonable range
        if (calculatedBpm >= MIN_BPM && calculatedBpm <= MAX_BPM && !isSlowingDown) {
          setBpm(calculatedBpm)
        }
      }

      return newTimes
    })

    // Set timeout to end tap session after 2 seconds
    tapTimeoutRef.current = setTimeout(() => {
      setTapTimes([])
      setShowTapButton(false)
    }, 2000)
  }

  const startTapMode = () => {
    setShowTapButton(true)
    setTapTimes([])
    setIsPlaying(false) // Stop the metronome when entering tap mode
  }

  // Handle play/stop state changes
  useEffect(() => {
    if (isPlaying) {
      // Starting the metronome
      resetTiming()
      startAnimation()
      setHasReached75Percent(false)

      // Reset slowdown state and start time tracking
      setIsSlowingDown(false)
      runningTimeRef.current = 0
      originalBpmRef.current = bpm // Capture the starting BPM
      hasDecrementedThisCycleRef.current = false

      // Start time tracking for slowdown
      timeTrackingIntervalRef.current = setInterval(() => {
        runningTimeRef.current += 1

        // Determine timeout based on trial status and upgrade status
        let timeoutSeconds = 999999 // Default: no timeout for normal users (sessions 1-2)

        if (isTrialExpired && !hasUpgraded) {
          // Trial expired and not upgraded - use shorter timeout
          timeoutSeconds = EXPIRED_TRIAL_RUN_TIME_SECONDS
        } else if (hasUpgraded) {
          // User has upgraded - no timeout (set to very high number to effectively disable)
          timeoutSeconds = 999999
        }
        // Note: For sessions 1-2 (not trial expired), timeoutSeconds remains 999999 (no timeout)

        if (runningTimeRef.current >= timeoutSeconds && !isSlowingDown) {
          setIsSlowingDown(true)
          // Clear the interval once slowdown starts to stop the repeated logging
          if (timeTrackingIntervalRef.current) {
            clearInterval(timeTrackingIntervalRef.current)
            timeTrackingIntervalRef.current = null
          }
        }
      }, 1000)
    } else {
      // Stopping the metronome
      stopAnimation()

      // Clean up time tracking interval
      if (timeTrackingIntervalRef.current) {
        clearInterval(timeTrackingIntervalRef.current)
        timeTrackingIntervalRef.current = null
      }

      // Reset running time
      runningTimeRef.current = 0

      // Handle display BPM based on how we stopped
      if (isSlowingDown) {
        // Stopped due to slowdown - show upgrade message only if trial expired and not upgraded
        if (isTrialExpired && !hasUpgraded) {
          setShowUpgradeMessage(true)
        }
        setDisplayBpm(originalBpmRef.current)
        setIsSlowingDown(false)
        setBpm(originalBpmRef.current)
      } else {
        // Stopped manually - hide upgrade message and display should already match BPM
        setShowUpgradeMessage(false)
        setDisplayBpm(bpm)
      }
    }
  }, [isPlaying, isTrialExpired, hasUpgraded])

  // Handle slowdown logic based on dot position
  useEffect(() => {
    // Only apply slowdown logic if user hasn't upgraded
    if (isSlowingDown && isPlaying && !hasUpgraded) {
      // Check if dot is at the top (within 5 degrees of 0)
      const isAtTop = dotPosition <= 5 || dotPosition >= 355

      if (isAtTop && !hasDecrementedThisCycleRef.current) {
        // We're at the top and haven't decremented this cycle yet
        const newBpm = bpm - 5

        if (newBpm <= MIN_BPM) {
          // Stop the metronome when reaching minimum BPM
          setIsPlaying(false)
        } else {
          // Decrement BPM and mark that we've decremented this cycle
          setBpm(newBpm)
          setDisplayBpm(newBpm)
          hasDecrementedThisCycleRef.current = true

          // Reset only the animation timing to prevent visual jerk, but preserve beat timing
          const now = performance.now()

          // Calculate where we should be in the new beat cycle based on current position
          const currentBeatProgress = dotPosition / 360
          const newBeatDuration = 60000 / newBpm
          const newElapsedTime = currentBeatProgress * newBeatDuration

          // Set the animation start time to maintain smooth visual transition
          startTimeRef.current = now - newElapsedTime

          // Only reset lastBeatTimeRef if we're very close to the top (within 5 degrees)
          // This ensures the beat will trigger properly at the top
          if (dotPosition <= 5 || dotPosition >= 355) {
            lastBeatTimeRef.current = now - newElapsedTime
          }
        }
      } else if (dotPosition > 90 && dotPosition < 270) {
        // Reset the decrement flag when we're in the middle range (90-270 degrees)
        // This ensures we only decrement once per complete cycle
        if (hasDecrementedThisCycleRef.current) {
          hasDecrementedThisCycleRef.current = false
        }
      }
    }
  }, [dotPosition, isSlowingDown, isPlaying, bpm, hasUpgraded])

  // Handle BPM changes - only allow during normal operation
  useEffect(() => {
    if (isSlowingDown) {
      // During slowdown, ignore manual BPM changes
      return
    }
    // For manual BPM changes during normal operation, animation continues smoothly
  }, [bpm, isSlowingDown])

  // Reset timing references
  const resetTiming = () => {
    if (audioContextRef.current && audioContextRef.current.state === "suspended") {
      audioContextRef.current.resume()
    }

    const now = performance.now()
    startTimeRef.current = now
    lastBeatTimeRef.current = now
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
    setDotPosition(0)
  }

  // Track when dot reaches 75% position (270 degrees)
  const handle75Percent = () => {
    if (isPlaying && dotPosition >= 270 && !hasReached75Percent) {
      setHasReached75Percent(true)
    }
  }

  useEffect(() => {
    handle75Percent()
  }, [dotPosition, isPlaying, hasReached75Percent])

  // Calculate zoom effect based on dot position (only after reaching 75% position)
  useEffect(() => {
    if (isPlaying && hasReached75Percent) {
      const isInZoomRange = dotPosition >= 270 || dotPosition <= 90

      if (isInZoomRange) {
        let distanceFromTop
        if (dotPosition >= 270) {
          distanceFromTop = 360 - dotPosition
        } else {
          distanceFromTop = dotPosition
        }

        const maxZoomDistance = 90
        const zoomFactor = 0.7 + 0.2 * (1 - distanceFromTop / maxZoomDistance)
        setScaleEffect(zoomFactor)
      } else {
        setScaleEffect(0.7)
      }
    } else {
      setScaleEffect(0.7)
    }
  }, [dotPosition, isPlaying, hasReached75Percent])

  // Animation function
  const animateMetronome = () => {
    const animate = (timestamp: number) => {
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

      const currentBpm = currentBpmRef.current
      const beatDuration = 60000 / currentBpm
      const elapsedSinceLastBeat = timestamp - lastBeatTimeRef.current

      if (elapsedSinceLastBeat >= beatDuration) {
        playClickTone()
        const beatsSinceLastBeat = Math.floor(elapsedSinceLastBeat / beatDuration)
        lastBeatTimeRef.current = lastBeatTimeRef.current + beatsSinceLastBeat * beatDuration
      }

      const beatProgress = (elapsedSinceLastBeat % beatDuration) / beatDuration
      const newPosition = beatProgress * 360
      setDotPosition(newPosition)

      if (isPlaying) {
        animationRef.current = requestAnimationFrame(animate)
      } else {
        stopAnimation()
      }
    }

    animationRef.current = requestAnimationFrame(animate)
  }

  const togglePlay = () => {
    if (bpm <= 0) {
      setBpm(70)
      setDisplayBpm(70)
    }

    // Hide upgrade message when manually starting
    if (!isPlaying) {
      setShowUpgradeMessage(false)
    }

    setIsPlaying(!isPlaying)
  }

  const increaseTempo = () => {
    if (bpm < MAX_BPM && !isSlowingDown) {
      setBpm((prev) => prev + BPM_STEP)
    }
  }

  const decreaseTempo = () => {
    if (bpm > MIN_BPM && !isSlowingDown) {
      setBpm((prev) => prev - BPM_STEP)
    }
  }

  // Handle upgrade button click
  const handleUpgrade = () => {
    localStorage.setItem("metronome_has_upgraded", "true")
    setHasUpgraded(true)
    setShowUpgradeMessage(false)
  }

  // Handle 5-minute sessions button click
  const handleFiveMinuteSessions = () => {
    // For now, just hide the upgrade message
    // You can implement 5-minute session logic here later
    setShowUpgradeMessage(false)
  }

  // Handle clear session count for testing
  const handleClearSessionCount = () => {
    localStorage.removeItem("metronome_session_count")
    localStorage.removeItem("metronome_has_upgraded")
    setSessionCount(0)
    setHasUpgraded(false)
    setIsTrialExpired(false)
    setShowUpgradeMessage(false)
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

  // Touch and mouse event handlers (keeping existing implementation)
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

            increaseIntervalRef.current = setInterval(() => {
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

            increaseIntervalRef.current = setInterval(() => {
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
      </div>

      {!showUpgradeMessage ? (
        <div className={styles.controlsContainer}>
          {showTapButton ? (
            <button
              className={`${styles.tapButtonAbove} ${styles.tapButtonActive}`}
              onClick={handleTap}
              aria-label="Tap tempo"
            >
              TAP
            </button>
          ) : (
            <button className={styles.tapButtonAbove} onClick={startTapMode} aria-label="Start tap tempo">
              TAP
            </button>
          )}

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
                {displayBpm}
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
      ) : (
        <div className={styles.upgradeMessage}>
          <h2 className={styles.upgradeHeadline}>Unlock the Full Circle.</h2>
          <p className={styles.upgradeBody}>
            You've experienced The Circular Metronome's fluid, uninterrupted motion. Upgrade to enjoy unlimited sessions
            without interruption. You can also continue using the metronome for free, though sessions will be limited to
            5 minutes.
          </p>
          <div className={styles.upgradeButtons}>
            <button className={styles.upgradeButton} onClick={handleUpgrade}>
              Upgrade Now
            </button>
            <button className={styles.standardButton} onClick={handleFiveMinuteSessions}>
              5 Minute Sessions
            </button>
          </div>
        </div>
      )}

      {/* Debug Information */}
      <div className={styles.debugInfo}>
        <div>Current Session Count: {sessionCount}</div>
        <div>Max Trial Session Count: {MAX_TRIAL_SESSION_COUNT}</div>
        <div>Expired Trial Timeout Time: {EXPIRED_TRIAL_RUN_TIME_SECONDS}s</div>
        <div>Trial Expired: {isTrialExpired ? "Yes" : "No"}</div>
        <div>Has Upgraded: {hasUpgraded ? "Yes" : "No"}</div>
      </div>

      {/* Clear Session Button for Testing - COMMENTED OUT */}
      {/*
      <button className={styles.clearSessionButton} onClick={handleClearSessionCount}>
        Clear Session Count
      </button>
      */}
    </div>
  )
}
