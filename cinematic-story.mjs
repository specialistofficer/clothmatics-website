/**
 * ClothMatics Cinematic Storytelling Controller
 * Autonomous, continuous, luxury fashion film loop.
 * True 60fps Framer-Motion-grade continuous physics with zero mouse-blocking
 * and zero text/garment collisions.
 */

// Clamp helper
function clamp(min, val, max) {
  return Math.max(min, Math.min(max, val));
}

// Linear interpolation helper
function lerp(start, end, factor) {
  return start + (end - start) * factor;
}

// Map value from range [inMin, inMax] to [outMin, outMax] with clamping
function mapRange(value, inMin, inMax, outMin, outMax, shouldClamp = true) {
  if (inMin === inMax) return outMin;
  const progress = (value - inMin) / (inMax - inMin);
  const result = outMin + progress * (outMax - outMin);
  return shouldClamp ? clamp(Math.min(outMin, outMax), result, Math.max(outMin, outMax)) : result;
}

// Smooth easeInOutCubic curve for luxury transitions
function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// Perlin smootherstep (C2 continuous: continuous 1st and 2nd derivatives, zero jerk)
function smootherstep(edge0, edge1, x) {
  const t = clamp(0, (x - edge0) / (edge1 - edge0), 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

// Hermite smoothstep (C1 continuous)
function smoothstep(edge0, edge1, x) {
  const t = clamp(0, (x - edge0) / (edge1 - edge0), 1);
  return t * t * (3 - 2 * t);
}

// Smooth continuous pulse: rises smoothly, holds, falls smoothly
function smoothPulse(p, inStart, inEnd, outStart, outEnd) {
  if (p <= inStart || p >= outEnd) return 0;
  if (p >= inEnd && p <= outStart) return 1;
  if (p < inEnd) return smootherstep(inStart, inEnd, p);
  return 1 - smootherstep(outStart, outEnd, p);
}

export function initCinematicStory() {
  const container = document.getElementById("top");
  if (!container || !container.classList.contains("cinematic-hero-experience")) {
    return null;
  }

  // Check reduced motion preference
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (prefersReduced) {
    return null;
  }

  // Element Cache (5 Selected Garments)
  const garments = {
    overshirt: container.querySelector(".garment-overshirt"),
    tee: container.querySelector(".garment-tee"),
    trousers: container.querySelector(".garment-trousers"),
    sneakers: container.querySelector(".garment-sneakers"),
    accessory: container.querySelector(".garment-accessory"),
  };

  const scanner = container.querySelector("#cinema-scanner");
  const metaTags = container.querySelectorAll(".cinema-meta-tag");
  const biometricCore = container.querySelector("#cinema-biometric-core");
  const contextTags = container.querySelectorAll(".cinema-context-tag");
  const criteriaPills = container.querySelectorAll(".criteria-pill");
  const lookCard = container.querySelector("#cinema-look-card");
  const titleBlocks = container.querySelectorAll(".cinema-title-block");

  // Complete 3D Ghost-Mannequin Turntable Elements
  const turntable = container.querySelector("#cinema-3d-turntable");
  const turntableStage = container.querySelector("#turntable-stage");
  const turntableCard = container.querySelector(".turntable-card-holo");
  const look3dFront = container.querySelector(".look-3d-front");
  const look3dRight = container.querySelector(".look-3d-right");
  const look3dLeft = container.querySelector(".look-3d-left");

  // Turntable Interactive Drag & Tilt Controls
  let manualAngle = null;
  let isDraggingTurntable = false;
  let startX = 0;
  let startAngle = 0;

  if (turntableStage) {
    turntableStage.addEventListener("pointerdown", (e) => {
      isDraggingTurntable = true;
      startX = e.clientX;
      startAngle = manualAngle !== null ? manualAngle : 0;
      try {
        turntableStage.setPointerCapture(e.pointerId);
      } catch (_) {}
    });

    turntableStage.addEventListener("pointermove", (e) => {
      if (!isDraggingTurntable) return;
      const dx = e.clientX - startX;
      manualAngle = clamp(-45, startAngle + dx * 0.45, 45);
    });

    const endDrag = (e) => {
      if (isDraggingTurntable) {
        isDraggingTurntable = false;
        try {
          turntableStage.releasePointerCapture(e.pointerId);
        } catch (_) {}
      }
    };
    turntableStage.addEventListener("pointerup", endDrag);
    turntableStage.addEventListener("pointercancel", endDrag);
  }

  // Continuous Film Loop Configuration:
  // 6 Scenes, 4.0s per scene = 24.0s total cycle time for relaxed luxury pacing
  const TOTAL_DURATION = 24000; // ms
  const SCENE_COUNT = 6;
  const SCENE_SPAN = 1 / SCENE_COUNT; // 0.16666...

  let currentTime = 0; // ms
  let currentProgress = 0;
  let isTabHidden = false;
  let isIntersecting = true;
  let lastTimestamp = null;
  let rafId = null;
  let activeSceneIndex = -1;

  function setActiveTitle(sceneIndex) {
    if (sceneIndex === activeSceneIndex) return;
    activeSceneIndex = sceneIndex;

    titleBlocks.forEach((block, idx) => {
      if (idx === sceneIndex) {
        block.classList.add("active");
      } else {
        block.classList.remove("active");
      }
    });
  }

  function render(p, timestamp) {
    // Determine active scene (0 to 5)
    const sceneIdx = Math.min(SCENE_COUNT - 1, Math.floor(p * SCENE_COUNT));
    setActiveTitle(sceneIdx);

    const isMobile = window.innerWidth < 768;
    const baseScale = isMobile ? 0.72 : 1.0;

    // Harmonic floating / breathing physics (subtle 3D bobbing)
    const t = timestamp * 0.001;
    const float1 = Math.sin(t * 1.8) * 5;
    const float2 = Math.sin(t * 1.6 + 1.2) * 5;
    const float3 = Math.cos(t * 1.4 + 2.4) * 5;
    const float4 = Math.sin(t * 1.7 + 3.6) * 4;
    const float5 = Math.cos(t * 1.5 + 4.8) * 4;
    const float6 = Math.sin(t * 1.9 + 5.2) * 4;

    // =========================================================================
    // 3D TURNTABLE MULTI-ANGLE DYNAMICS & OSCILLATION
    // =========================================================================
    if (turntable && turntableCard) {
      const autoAngle = Math.sin(t * 1.5) * 26; // Smooth continuous 3D oscillation (-26° to +26°)
      if (manualAngle !== null) {
        if (!isDraggingTurntable) {
          manualAngle = lerp(manualAngle, autoAngle, 0.04);
          if (Math.abs(manualAngle - autoAngle) < 0.4) {
            manualAngle = null;
          }
        }
      }
      const activeAngle = manualAngle !== null ? manualAngle : autoAngle;

      if (look3dFront && look3dRight && look3dLeft) {
        if (activeAngle < -7) {
          look3dLeft.classList.add("active");
          look3dFront.classList.remove("active");
          look3dRight.classList.remove("active");
        } else if (activeAngle > 7) {
          look3dRight.classList.add("active");
          look3dFront.classList.remove("active");
          look3dLeft.classList.remove("active");
        } else {
          look3dFront.classList.add("active");
          look3dLeft.classList.remove("active");
          look3dRight.classList.remove("active");
        }
      }

      turntableCard.style.transform = `rotateY(${activeAngle * 0.45}deg) rotateX(${Math.cos(t * 1.2) * 2.5}deg) translateZ(10px)`;
    }

    // =========================================================================
    // 1. SCANNER BEAM & METADATA DETECTION (Scene 2: p ~ 0.16 -> 0.35)
    // =========================================================================
    if (scanner) {
      const scanOpacity = smoothPulse(p, 0.16, 0.20, 0.30, 0.34);
      scanner.style.opacity = scanOpacity;
      if (scanOpacity > 0.001) {
        const scanT = smootherstep(0.18, 0.32, p);
        const scanY = lerp(-26, 26, scanT);
        scanner.style.transform = `translateY(${scanY.toFixed(1)}vh)`;
      }
    }

    // Garment HUD Corner Brackets
    const bracketOpacity = smoothPulse(p, 0.18, 0.22, 0.30, 0.33);
    container.querySelectorAll(".garment-hud-bracket").forEach((b) => {
      b.style.opacity = bracketOpacity;
    });

    // Telemetry Tags (Staggered scan reveal -> smooth unified fade)
    metaTags.forEach((tag, idx) => {
      const inStart = 0.19 + idx * 0.022;
      const inEnd = inStart + 0.035;
      const tagOpacity = smoothPulse(p, inStart, inEnd, 0.31, 0.345);
      tag.style.opacity = tagOpacity;
      if (tagOpacity > 0.001) {
        const enterY = lerp(10, 0, smootherstep(inStart, inEnd, p));
        const exitY = lerp(0, -6, smootherstep(0.31, 0.345, p));
        tag.style.transform = `translateY(${(enterY + exitY).toFixed(1)}px)`;
      }
    });

    // =========================================================================
    // 2. HOLOGRAPHIC SYNTHESIS AURA & CONTEXT TELEMETRY (Scenes 3 & 4: p ~ 0.34 -> 0.67)
    // =========================================================================
    if (biometricCore) {
      const coreOpacity = smoothPulse(p, 0.33, 0.39, 0.60, 0.67);
      biometricCore.style.opacity = coreOpacity;
      if (coreOpacity > 0.001) {
        const coreScaleT = smootherstep(0.33, 0.44, p);
        const flashScaleT = smootherstep(0.54, 0.67, p);
        const scale = lerp(0.82, 1.0, coreScaleT) + lerp(0, 0.25, flashScaleT);
        biometricCore.style.transform = `translate3d(0px, ${(float1 * 0.3).toFixed(1)}px, 0px) scale(${(scale * baseScale).toFixed(3)})`;
      }
    }

    // Streamlined Context Tags (Silhouette, Style, Weather)
    contextTags.forEach((tag, idx) => {
      const inStart = 0.34 + idx * 0.025;
      const inEnd = inStart + 0.035;
      const tagOpacity = smoothPulse(p, inStart, inEnd, 0.47, 0.51);
      tag.style.opacity = tagOpacity;
      if (tagOpacity > 0.001) {
        tag.style.transform = `translateY(${lerp(8, 0, smootherstep(inStart, inEnd, p)).toFixed(1)}px)`;
      }
    });

    // Ensure criteria pills remain cleanly invisible
    criteriaPills.forEach((pill) => {
      pill.style.opacity = 0;
    });

    // =========================================================================
    // 3. CONTINUOUS GARMENT DYNAMICS & 3D METAMORPHOSIS (p: 0.00 -> 0.68)
    // =========================================================================
    // Enter fade-in at the very start
    const introOpacity = smootherstep(0.0, 0.06, p);

    // Initial Editorial Floating Coordinates
    const initCoords = {
      overshirt: { x: isMobile ? -50 : -90, y: isMobile ? -50 : -60, z: 20, rot: -3, scale: 1.02 },
      tee: { x: isMobile ? 60 : 130, y: isMobile ? -50 : -55, z: 10, rot: 4, scale: 0.96 },
      trousers: { x: isMobile ? -50 : -90, y: isMobile ? 110 : 130, z: -10, rot: 2, scale: 0.96 },
      sneakers: { x: isMobile ? 60 : 130, y: isMobile ? 115 : 140, z: 15, rot: -3, scale: 0.92 },
      accessory: { x: isMobile ? 80 : 175, y: isMobile ? 30 : 35, z: 25, rot: 0, scale: 0.85 },
    };

    // Staging / Convergence Coordinates (Scene 3 -> 4)
    // Cleanly separated framing around the central pedestal (ZERO 2D collage stacking!)
    const stageCoords = {
      overshirt: { x: isMobile ? -35 : -55, y: isMobile ? -45 : -55, rot: -2 },
      tee: { x: isMobile ? 35 : 55, y: isMobile ? -45 : -50, rot: 2 },
      trousers: { x: isMobile ? -30 : -45, y: isMobile ? 95 : 110, rot: 1 },
      sneakers: { x: isMobile ? 30 : 45, y: isMobile ? 100 : 120, rot: -2 },
    };

    // Metamorphosis Target Centers (Where garments vaporize into 3D light)
    const centerCoords = {
      overshirt: { x: 0, y: isMobile ? -40 : -48 },
      tee: { x: 0, y: isMobile ? -40 : -46 },
      trousers: { x: 0, y: isMobile ? 45 : 55 },
      sneakers: { x: 0, y: isMobile ? 120 : 140 },
    };

    // Dissolution into Pure 3D Light Energy (Scene 4: p ~ 0.54 -> 0.67)
    const dissolveT = smootherstep(0.54, 0.67, p);
    const pieceOpacity = (1 - dissolveT) * introOpacity;
    const dissolveBlur = dissolveT * 14;
    const dissolveBright = 1.0 + dissolveT * 0.8;
    const dissolveGlow = dissolveT > 0.01 
      ? `blur(${dissolveBlur.toFixed(1)}px) brightness(${dissolveBright.toFixed(2)}) drop-shadow(0 0 ${(dissolveT * 24).toFixed(1)}px rgba(236, 72, 153, 0.65))` 
      : "none";

    // --- Overshirt ---
    if (garments.overshirt) {
      if (pieceOpacity <= 0.001) {
        garments.overshirt.style.opacity = 0;
      } else {
        const s3T = smootherstep(0.33, 0.48, p);
        const s4T = smootherstep(0.50, 0.64, p);
        const x1 = lerp(initCoords.overshirt.x, stageCoords.overshirt.x, s3T);
        const y1 = lerp(initCoords.overshirt.y, stageCoords.overshirt.y, s3T);
        const curX = lerp(x1, centerCoords.overshirt.x, s4T);
        const curY = lerp(y1, centerCoords.overshirt.y, s4T);
        const curRot = lerp(initCoords.overshirt.rot, 0, s4T);
        const curScale = lerp(initCoords.overshirt.scale, 0.94, s4T) * baseScale;
        garments.overshirt.style.opacity = pieceOpacity;
        garments.overshirt.style.filter = dissolveGlow;
        garments.overshirt.style.transform = `translate3d(${curX.toFixed(1)}px, ${(curY + float1 * (1 - s4T * 0.7)).toFixed(1)}px, 20px) rotate(${curRot.toFixed(1)}deg) scale(${curScale.toFixed(3)})`;
      }
    }

    // --- Tee ---
    if (garments.tee) {
      if (pieceOpacity <= 0.001) {
        garments.tee.style.opacity = 0;
      } else {
        const s3T = smootherstep(0.33, 0.48, p);
        const s4T = smootherstep(0.50, 0.64, p);
        const x1 = lerp(initCoords.tee.x, stageCoords.tee.x, s3T);
        const y1 = lerp(initCoords.tee.y, stageCoords.tee.y, s3T);
        const curX = lerp(x1, centerCoords.tee.x, s4T);
        const curY = lerp(y1, centerCoords.tee.y, s4T);
        const curRot = lerp(initCoords.tee.rot, 0, s4T);
        const curScale = lerp(initCoords.tee.scale, 0.88, s4T) * baseScale;
        garments.tee.style.opacity = pieceOpacity * 0.98;
        garments.tee.style.filter = dissolveGlow;
        garments.tee.style.transform = `translate3d(${curX.toFixed(1)}px, ${(curY + float2 * (1 - s4T * 0.7)).toFixed(1)}px, 12px) rotate(${curRot.toFixed(1)}deg) scale(${curScale.toFixed(3)})`;
      }
    }

    // --- Trousers ---
    if (garments.trousers) {
      if (pieceOpacity <= 0.001) {
        garments.trousers.style.opacity = 0;
      } else {
        const s3T = smootherstep(0.33, 0.48, p);
        const s4T = smootherstep(0.50, 0.64, p);
        const x1 = lerp(initCoords.trousers.x, stageCoords.trousers.x, s3T);
        const y1 = lerp(initCoords.trousers.y, stageCoords.trousers.y, s3T);
        const curX = lerp(x1, centerCoords.trousers.x, s4T);
        const curY = lerp(y1, centerCoords.trousers.y, s4T);
        const curRot = lerp(initCoords.trousers.rot, 0, s4T);
        const curScale = lerp(initCoords.trousers.scale, 0.90, s4T) * baseScale;
        garments.trousers.style.opacity = pieceOpacity;
        garments.trousers.style.filter = dissolveGlow;
        garments.trousers.style.transform = `translate3d(${curX.toFixed(1)}px, ${(curY + float3 * (1 - s4T * 0.7)).toFixed(1)}px, 15px) rotate(${curRot.toFixed(1)}deg) scale(${curScale.toFixed(3)})`;
      }
    }

    // --- Sneakers ---
    if (garments.sneakers) {
      if (pieceOpacity <= 0.001) {
        garments.sneakers.style.opacity = 0;
      } else {
        const s3T = smootherstep(0.33, 0.48, p);
        const s4T = smootherstep(0.50, 0.64, p);
        const x1 = lerp(initCoords.sneakers.x, stageCoords.sneakers.x, s3T);
        const y1 = lerp(initCoords.sneakers.y, stageCoords.sneakers.y, s3T);
        const curX = lerp(x1, centerCoords.sneakers.x, s4T);
        const curY = lerp(y1, centerCoords.sneakers.y, s4T);
        const curRot = lerp(initCoords.sneakers.rot, 0, s4T);
        const curScale = lerp(initCoords.sneakers.scale, 0.86, s4T) * baseScale;
        garments.sneakers.style.opacity = pieceOpacity;
        garments.sneakers.style.filter = dissolveGlow;
        garments.sneakers.style.transform = `translate3d(${curX.toFixed(1)}px, ${(curY + float4 * (1 - s4T * 0.7)).toFixed(1)}px, 8px) rotate(${curRot.toFixed(1)}deg) scale(${curScale.toFixed(3)})`;
      }
    }

    // --- Accessory (Watch fades out early during AI selection) ---
    if (garments.accessory) {
      const accFade = (1 - smootherstep(0.32, 0.42, p)) * introOpacity;
      if (accFade <= 0.001) {
        garments.accessory.style.opacity = 0;
      } else {
        const accZ = lerp(initCoords.accessory.z, -100, smootherstep(0.32, 0.42, p));
        garments.accessory.style.opacity = accFade * 0.95;
        garments.accessory.style.filter = "none";
        garments.accessory.style.transform = `translate3d(${initCoords.accessory.x}px, ${(initCoords.accessory.y + float5).toFixed(1)}px, ${accZ.toFixed(1)}px) scale(${(initCoords.accessory.scale * baseScale).toFixed(3)})`;
      }
    }

    // =========================================================================
    // 4. 3D TURNTABLE STAGE & GHOST MANNEQUIN MATERIALIZATION (p ~ 0.36 -> 1.00)
    // =========================================================================
    if (turntable) {
      // Pedestal begins glowing in Scene 3
      const pedestalFade = smootherstep(0.36, 0.48, p);
      // Mannequin materializes out of light in Scene 4
      const mannequinMaterialize = smootherstep(0.55, 0.68, p);

      // Overall turntable opacity
      const ttOpacity = p < 0.54 ? pedestalFade * 0.45 : lerp(0.45, 1.0, mannequinMaterialize);

      if (ttOpacity > 0.005) {
        turntable.classList.add("active");
        turntable.style.opacity = ttOpacity.toFixed(3);

        // Volumetric aura glow as mannequin forms
        const auraGlow = smoothPulse(p, 0.55, 0.63, 0.67, 0.72);
        if (turntableCard) {
          turntableCard.style.filter = auraGlow > 0.01 
            ? `brightness(${(1.0 + auraGlow * 0.5).toFixed(2)}) drop-shadow(0 0 ${(auraGlow * 25).toFixed(1)}px rgba(124, 58, 237, 0.75))` 
            : "none";
        }

        // Scene 5 Desktop Shift (Smooth interpolation to pair with Look Card)
        const desktopShiftT = smoothPulse(p, 0.67, 0.73, 0.82, 0.86);
        const shiftX = isMobile ? 0 : lerp(0, -120, desktopShiftT);
        const ttScale = lerp(0.92, 1.0, smootherstep(0.36, 0.52, p)) * (isMobile ? 0.9 : 1.0);
        turntable.style.transform = `translate3d(${shiftX.toFixed(1)}px, 0, 0) scale(${ttScale.toFixed(3)})`;
      } else {
        turntable.classList.remove("active");
        turntable.style.opacity = "0";
      }
    }

    // =========================================================================
    // 5. TODAY'S 3D LOOK CARD (Scene 5: p ~ 0.68 -> 0.85)
    // =========================================================================
    if (lookCard) {
      const cardOpacity = smoothPulse(p, 0.69, 0.74, 0.81, 0.85);
      if (cardOpacity > 0.01) {
        lookCard.classList.add("active");
        lookCard.style.opacity = cardOpacity.toFixed(3);
        const cardSlide = lerp(24, 0, smootherstep(0.69, 0.74, p));
        lookCard.style.transform = `translateY(-50%) translateX(${cardSlide.toFixed(1)}px)`;
      } else {
        lookCard.classList.remove("active");
        lookCard.style.opacity = 0;
      }
    }
  }

  let isPaused = false;
  let isFinished = false;

  function loop(timestamp) {
    if (lastTimestamp === null) {
      lastTimestamp = timestamp;
    }
    const dt = timestamp - lastTimestamp;
    lastTimestamp = timestamp;

    // Advance timeline continuously when tab is active and visible
    // Runs strictly ONE time through the story, then permanently rests on the 3D mannequin finale!
    if (!isTabHidden && isIntersecting && !isPaused && !isFinished) {
      currentTime += dt;
      if (currentTime >= TOTAL_DURATION) {
        currentTime = TOTAL_DURATION;
        currentProgress = 1.0;
        isFinished = true;
      } else {
        currentProgress = currentTime / TOTAL_DURATION;
      }
    }

    render(currentProgress, timestamp);

    rafId = requestAnimationFrame(loop);
  }

  // Tab Visibility optimization
  const onVisibilityChange = () => {
    isTabHidden = document.hidden;
    if (!isTabHidden) {
      lastTimestamp = null;
    }
  };
  document.addEventListener("visibilitychange", onVisibilityChange);

  // IntersectionObserver: Pause RAF when off-screen
  let observer = null;
  if (typeof IntersectionObserver !== "undefined") {
    observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]) {
          isIntersecting = entries[0].isIntersecting;
          if (isIntersecting) lastTimestamp = null;
        }
      },
      { threshold: 0.05 }
    );
    observer.observe(container);
  }

  // Start Autonomous Loop
  rafId = requestAnimationFrame(loop);

  const controller = {
    destroy() {
      if (rafId) cancelAnimationFrame(rafId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (observer) observer.disconnect();
    },
    seek(p) {
      currentProgress = clamp(0, p, 1);
      currentTime = currentProgress * TOTAL_DURATION;
      isFinished = currentProgress >= 1.0;
      render(currentProgress, performance.now());
    },
    pause() {
      isPaused = true;
    },
    resume() {
      isPaused = false;
    },
    replay() {
      currentTime = 0;
      currentProgress = 0;
      isFinished = false;
      isPaused = false;
      lastTimestamp = null;
      render(0, performance.now());
    },
    get isFinished() {
      return isFinished;
    },
  };

  if (typeof window !== "undefined") {
    window.__clothmaticsCinema = controller;
  }

  return controller;
}

// Auto-initialize when loaded in browser (CSP-compliant without inline scripts)
if (typeof window !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => initCinematicStory());
  } else {
    initCinematicStory();
  }
}
