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
    // SCENE 1: YOUR WARDROBE (0.00 -> 0.167)
    // Clean, balanced 5-item luxury editorial arrangement (zero blazer)
    // =========================================================================
    if (p < 0.167) {
      const s1Prog = p / 0.167; // 0 -> 1
      const ease = easeInOutCubic(s1Prog);
      const enterOpacity = mapRange(s1Prog, 0.0, 0.25, 0.6, 1);

      // Overshirt (Top Center-Left)
      if (garments.overshirt) {
        const x = lerp(isMobile ? -45 : -80, isMobile ? -50 : -90, ease);
        const y = lerp(isMobile ? -45 : -55, isMobile ? -50 : -60, ease);
        garments.overshirt.style.opacity = enterOpacity;
        garments.overshirt.style.filter = "none";
        garments.overshirt.style.transform = `translate3d(${x}px, ${y + float1}px, 20px) rotate(-3deg) scale(${1.02 * baseScale})`;
      }

      // Tee (Top Right)
      if (garments.tee) {
        const x = lerp(isMobile ? 55 : 120, isMobile ? 60 : 130, ease);
        const y = lerp(isMobile ? -45 : -50, isMobile ? -50 : -55, ease);
        garments.tee.style.opacity = enterOpacity * 0.98;
        garments.tee.style.filter = "none";
        garments.tee.style.transform = `translate3d(${x}px, ${y + float2}px, 10px) rotate(4deg) scale(${0.96 * baseScale})`;
      }

      // Trousers (Lower Left)
      if (garments.trousers) {
        const x = lerp(isMobile ? -45 : -80, isMobile ? -50 : -90, ease);
        const y = lerp(isMobile ? 105 : 120, isMobile ? 110 : 130, ease);
        garments.trousers.style.opacity = enterOpacity * 0.98;
        garments.trousers.style.filter = "none";
        garments.trousers.style.transform = `translate3d(${x}px, ${y + float3}px, -10px) rotate(2deg) scale(${0.96 * baseScale})`;
      }

      // Sneakers (Lower Right)
      if (garments.sneakers) {
        const x = lerp(isMobile ? 55 : 120, isMobile ? 60 : 130, ease);
        const y = lerp(isMobile ? 110 : 130, isMobile ? 115 : 140, ease);
        garments.sneakers.style.opacity = enterOpacity * 0.98;
        garments.sneakers.style.filter = "none";
        garments.sneakers.style.transform = `translate3d(${x}px, ${y + float4}px, 15px) rotate(-3deg) scale(${0.92 * baseScale})`;
      }

      // Watch (Floating Center-Right Accent)
      if (garments.accessory) {
        const x = isMobile ? 80 : 175;
        const y = isMobile ? 30 : 35;
        garments.accessory.style.opacity = enterOpacity * 0.95;
        garments.accessory.style.filter = "none";
        garments.accessory.style.transform = `translate3d(${x}px, ${y + float5}px, 25px) scale(${0.85 * baseScale})`;
      }

      // Overlays from other scenes hidden
      if (scanner) scanner.style.opacity = 0;
      container.querySelectorAll(".garment-hud-bracket").forEach((b) => (b.style.opacity = 0));
      metaTags.forEach((t) => (t.style.opacity = 0));
      if (biometricCore) biometricCore.style.opacity = 0;
      contextTags.forEach((t) => (t.style.opacity = 0));
      criteriaPills.forEach((pill) => (pill.style.opacity = 0));
      if (lookCard) lookCard.classList.remove("active");
      if (turntable) {
        turntable.classList.remove("active");
        turntable.classList.remove("shifted-desktop");
        turntable.style.opacity = "0";
      }
    }

    // =========================================================================
    // SCENE 2: INTELLIGENT VISION & SPECTRUM SCAN (0.167 -> 0.333)
    // =========================================================================
    else if (p < 0.333) {
      const s2Prog = (p - 0.167) / 0.166; // 0 -> 1

      // Clothes stay grounded in their balanced positions with subtle 3D breathing
      if (garments.overshirt) {
        garments.overshirt.style.opacity = 1;
        garments.overshirt.style.transform = `translate3d(${isMobile ? -50 : -90}px, ${-60 + float1}px, 20px) rotate(-3deg) scale(${1.02 * baseScale})`;
      }
      if (garments.tee) {
        garments.tee.style.opacity = 0.98;
        garments.tee.style.transform = `translate3d(${isMobile ? 60 : 130}px, ${-55 + float2}px, 10px) rotate(4deg) scale(${0.96 * baseScale})`;
      }
      if (garments.trousers) {
        garments.trousers.style.opacity = 0.98;
        garments.trousers.style.transform = `translate3d(${isMobile ? -50 : -90}px, ${130 + float3}px, -10px) rotate(2deg) scale(${0.96 * baseScale})`;
      }
      if (garments.sneakers) {
        garments.sneakers.style.opacity = 0.98;
        garments.sneakers.style.transform = `translate3d(${isMobile ? 60 : 130}px, ${140 + float4}px, 15px) rotate(-3deg) scale(${0.92 * baseScale})`;
      }
      if (garments.accessory) {
        garments.accessory.style.opacity = 0.98;
        garments.accessory.style.transform = `translate3d(${isMobile ? 80 : 175}px, ${35 + float5}px, 25px) scale(${0.85 * baseScale})`;
      }

      // Laser Scanner sweeps smoothly top to bottom
      if (scanner) {
        const scanFade = s2Prog < 0.1 ? s2Prog / 0.1 : s2Prog > 0.9 ? (1 - s2Prog) / 0.1 : 1;
        scanner.style.opacity = clamp(0, scanFade, 1);
        const scanY = lerp(-25, 25, s2Prog);
        scanner.style.transform = `translateY(${scanY}vh)`;
      }

      // HUD brackets pulse gently
      container.querySelectorAll(".garment-hud-bracket").forEach((b) => {
        b.style.opacity = mapRange(s2Prog, 0.08, 0.88, 0, 1);
      });

      // Telemetry tags appear sequentially beside their garments
      metaTags.forEach((tag, idx) => {
        const trigger = 0.08 + idx * 0.14;
        const tagProg = mapRange(s2Prog, trigger, trigger + 0.16, 0, 1);
        tag.style.opacity = tagProg;
        tag.style.transform = `translateY(${lerp(10, 0, tagProg)}px)`;
      });

      if (biometricCore) biometricCore.style.opacity = 0;
      contextTags.forEach((t) => (t.style.opacity = 0));
      criteriaPills.forEach((pill) => (pill.style.opacity = 0));
      if (lookCard) lookCard.classList.remove("active");
      if (turntable) {
        turntable.classList.remove("active");
        turntable.classList.remove("shifted-desktop");
        turntable.style.opacity = "0";
      }
    }

    // =========================================================================
    // SCENE 3: PERSONAL INTELLIGENCE & HOLOGRAPHIC STYLE CORE (0.333 -> 0.500)
    // ZERO NUDE MANNEQUIN - Pure futuristic luxury biometric matrix
    // =========================================================================
    else if (p < 0.500) {
      const s3Prog = (p - 0.333) / 0.167; // 0 -> 1
      const ease = easeInOutCubic(s3Prog);

      if (scanner) scanner.style.opacity = 0;
      container.querySelectorAll(".garment-hud-bracket").forEach((b) => (b.style.opacity = 0));
      metaTags.forEach((t) => (t.style.opacity = 0));

      // Garments gracefully expand outward into an orbital halo, softly dimmed (18% opacity)
      const pushZ = lerp(-10, -220, ease);
      const pushOpacity = lerp(0.98, 0.18, ease);
      const blurVal = lerp(0, 3.5, ease);

      Object.values(garments).forEach((el) => {
        if (!el) return;
        el.style.opacity = pushOpacity;
        el.style.filter = `blur(${blurVal}px) brightness(0.65)`;
      });

      if (garments.overshirt) {
        const x = lerp(isMobile ? -50 : -90, isMobile ? -85 : -170, ease);
        const y = lerp(isMobile ? -50 : -60, isMobile ? -65 : -95, ease);
        garments.overshirt.style.transform = `translate3d(${x}px, ${y + float1 * 0.6}px, ${pushZ}px) scale(${0.82 * baseScale})`;
      }
      if (garments.tee) {
        const x = lerp(isMobile ? 60 : 130, isMobile ? 85 : 170, ease);
        const y = lerp(isMobile ? -50 : -55, isMobile ? -65 : -95, ease);
        garments.tee.style.transform = `translate3d(${x}px, ${y + float2 * 0.6}px, ${pushZ}px) scale(${0.78 * baseScale})`;
      }
      if (garments.trousers) {
        const x = lerp(isMobile ? -50 : -90, isMobile ? -80 : -160, ease);
        const y = lerp(isMobile ? 110 : 130, isMobile ? 120 : 160, ease);
        garments.trousers.style.transform = `translate3d(${x}px, ${y + float3 * 0.6}px, ${pushZ}px) scale(${0.78 * baseScale})`;
      }
      if (garments.sneakers) {
        const x = lerp(isMobile ? 60 : 130, isMobile ? 80 : 160, ease);
        const y = lerp(isMobile ? 115 : 140, isMobile ? 125 : 165, ease);
        garments.sneakers.style.transform = `translate3d(${x}px, ${y + float4 * 0.6}px, ${pushZ}px) scale(${0.75 * baseScale})`;
      }
      if (garments.accessory) {
        const x = lerp(isMobile ? 80 : 175, isMobile ? 100 : 200, ease);
        const y = lerp(isMobile ? 30 : 35, isMobile ? 25 : 30, ease);
        garments.accessory.style.transform = `translate3d(${x}px, ${y + float5 * 0.6}px, ${pushZ}px) scale(${0.72 * baseScale})`;
      }

      // Holographic Style Intelligence Core emerges in the center stage
      if (biometricCore) {
        const coreOpacity = mapRange(s3Prog, 0.06, 0.45, 0, 1);
        const coreScale = mapRange(s3Prog, 0.02, 0.55, 0.82, 1.0);
        biometricCore.style.opacity = coreOpacity;
        biometricCore.style.transform = `translate3d(0px, ${float1 * 0.4}px, 0px) scale(${coreScale * baseScale})`;
      }

      // Context tags orbit in smoothly with guaranteed safety margins
      contextTags.forEach((tag, idx) => {
        const trigger = 0.12 + idx * 0.12;
        const tagProg = mapRange(s3Prog, trigger, trigger + 0.18, 0, 1);
        tag.style.opacity = tagProg;
        tag.style.transform = `translateY(${lerp(10, 0, tagProg)}px)`;
      });

      criteriaPills.forEach((pill) => (pill.style.opacity = 0));
      if (lookCard) lookCard.classList.remove("active");
      if (turntable) {
        turntable.classList.remove("active");
        turntable.classList.remove("shifted-desktop");
        turntable.style.opacity = "0";
      }
    }

    // =========================================================================
    // SCENE 4: AI HARMONIZATION & 3D ASSEMBLY (0.500 -> 0.667)
    // Continuous curved convergence of garments directly into the 3D Turntable
    // =========================================================================
    else if (p < 0.667) {
      const s4Prog = (p - 0.500) / 0.167; // 0 -> 1
      const ease = easeInOutCubic(s4Prog);

      // Biometric Core and Context tags dissolve smoothly
      if (biometricCore) {
        biometricCore.style.opacity = mapRange(s4Prog, 0.0, 0.35, 1, 0);
        biometricCore.style.transform = `translate3d(0px, 0px, 0px) scale(${lerp(1.0, 0.82, s4Prog) * baseScale})`;
      }
      contextTags.forEach((t) => (t.style.opacity = 0));

      // Watch gently fades out completely
      if (garments.accessory) {
        garments.accessory.style.opacity = mapRange(s4Prog, 0.0, 0.30, 0.18, 0);
      }

      // The 4 selected pieces smoothly fly inward from orbital positions
      // into precise assembled look alignment, then dissolve into the 3D Turntable
      const flightProg = mapRange(s4Prog, 0.0, 0.65, 0, 1);
      const flightEase = easeInOutCubic(flightProg);
      const pieceFade = mapRange(s4Prog, 0.55, 0.88, 1, 0);

      if (garments.overshirt) {
        const startX = isMobile ? -85 : -170;
        const startY = isMobile ? -65 : -95;
        const x = lerp(startX, 0, flightEase);
        const y = lerp(startY, -60, flightEase);
        garments.overshirt.style.opacity = pieceFade;
        garments.overshirt.style.filter = "none";
        garments.overshirt.style.transform = `translate3d(${x}px, ${y + float1}px, 35px) rotate(${lerp(-3, 0, flightEase)}deg) scale(${lerp(0.82, 0.95, flightEase) * baseScale})`;
      }

      if (garments.tee) {
        const startX = isMobile ? 85 : 170;
        const startY = isMobile ? -65 : -95;
        const x = lerp(startX, 0, flightEase);
        const y = lerp(startY, -55, flightEase);
        garments.tee.style.opacity = pieceFade * 0.92;
        garments.tee.style.filter = "none";
        garments.tee.style.transform = `translate3d(${x}px, ${y + float2}px, 15px) rotate(${lerp(4, 0, flightEase)}deg) scale(${lerp(0.78, 0.88, flightEase) * baseScale})`;
      }

      if (garments.trousers) {
        const startX = isMobile ? -80 : -160;
        const startY = isMobile ? 120 : 160;
        const x = lerp(startX, 0, flightEase);
        const y = lerp(startY, 55, flightEase);
        garments.trousers.style.opacity = pieceFade;
        garments.trousers.style.filter = "none";
        garments.trousers.style.transform = `translate3d(${x}px, ${y + float3}px, 20px) rotate(${lerp(2, 0, flightEase)}deg) scale(${lerp(0.78, 0.90, flightEase) * baseScale})`;
      }

      if (garments.sneakers) {
        const startX = isMobile ? 80 : 160;
        const startY = isMobile ? 125 : 165;
        const x = lerp(startX, 0, flightEase);
        const y = lerp(startY, 170, flightEase);
        garments.sneakers.style.opacity = pieceFade;
        garments.sneakers.style.filter = "none";
        garments.sneakers.style.transform = `translate3d(${x}px, ${y + float4}px, 5px) rotate(${lerp(-3, 0, flightEase)}deg) scale(${lerp(0.75, 0.84, flightEase) * baseScale})`;
      }

      // Complete 3D Turntable emerges directly out of the AI synthesis
      if (turntable) {
        turntable.classList.remove("shifted-desktop");
        const ttProg = mapRange(s4Prog, 0.52, 0.92, 0, 1);
        if (ttProg > 0.01) {
          turntable.classList.add("active");
          turntable.style.opacity = ttProg;
          turntable.style.transform = `scale(${lerp(0.88, 1.0, ttProg)})`;
        } else {
          turntable.classList.remove("active");
          turntable.style.opacity = "0";
        }
      }

      // Criteria evaluation pills flash and verify
      criteriaPills.forEach((pill, idx) => {
        const trigger = 0.08 + idx * 0.12;
        const pillProg = mapRange(s4Prog, trigger, trigger + 0.18, 0, 1);
        pill.style.opacity = pillProg;
        pill.style.transform = `scale(${lerp(0.85, 1, pillProg)})`;
      });

      if (lookCard) lookCard.classList.remove("active");
    }

    // =========================================================================
    // SCENE 5: THE COMPLETE 3D LOOK SHOWCASE (0.667 -> 0.833)
    // =========================================================================
    else if (p < 0.833) {
      if (biometricCore) biometricCore.style.opacity = 0;
      contextTags.forEach((t) => (t.style.opacity = 0));
      criteriaPills.forEach((pill) => (pill.style.opacity = 0));
      metaTags.forEach((t) => (t.style.opacity = 0));

      // Hide individual 2D flat pieces in favor of the Complete 3D Look
      Object.values(garments).forEach((el) => {
        if (el) el.style.opacity = 0;
      });

      // The Complete 3D Ghost-Mannequin Turntable is the hero
      if (turntable) {
        turntable.classList.add("active");
        turntable.style.opacity = 1;
        if (!isMobile) {
          turntable.classList.add("shifted-desktop");
        } else {
          turntable.classList.remove("shifted-desktop");
        }
      }

      // Reveal Luxury Look Card
      if (lookCard) {
        lookCard.classList.add("active");
      }
    }

    // =========================================================================
    // SCENE 6: PERSONAL AI STYLIST & CONVERSION FINALE (0.833 -> 1.000)
    // =========================================================================
    else {
      if (lookCard) lookCard.classList.remove("active");
      if (biometricCore) biometricCore.style.opacity = 0;
      contextTags.forEach((t) => (t.style.opacity = 0));
      criteriaPills.forEach((pill) => (pill.style.opacity = 0));
      metaTags.forEach((t) => (t.style.opacity = 0));

      // Individual garments stay hidden
      Object.values(garments).forEach((el) => {
        if (el) el.style.opacity = 0;
      });

      // Turntable returns to center stage on desktop to showcase the 3D look alongside the final CTA
      if (turntable) {
        turntable.classList.add("active");
        turntable.classList.remove("shifted-desktop");
        turntable.style.opacity = 1;
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

  // Connect Replay Button in Scene 6 actions
  const replayBtn = container.querySelector("#cinema-replay-btn");
  if (replayBtn) {
    replayBtn.addEventListener("click", (e) => {
      e.preventDefault();
      controller.replay();
    });
  }

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
