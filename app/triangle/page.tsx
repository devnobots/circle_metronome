"use client"

import styles from "./triangle.module.css"

export default function TrianglePage() {
  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Triangle Test</h1>
      <div className={styles.triangleContainer}>
        <svg width="300" height="260" className={styles.triangleSvg}>
          {/* Triangle outline */}
          <polygon points="150,10 290,250 10,250" fill="none" stroke="#333" strokeWidth="4" />
          {/* Vertical center line */}
          <line x1="150" y1="10" x2="150" y2="60" stroke="#333" strokeWidth="4" />
        </svg>
      </div>
    </div>
  )
}
