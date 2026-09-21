/**
 * ClothMatics Cinematic Storytelling Controller
 * Autonomous continuous luxury fashion film loop + interactive timeline scrub.
 * Split-stage architecture guarantees zero text/garment collisions.
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

// Smooth easeInOutQuad
function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
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

  // Element Cache
  const garments = {
    overshirt: container.querySelector(".garment-overshirt"),
    tee: container.querySelector(".garment-tee"),
    trousers: container.querySelector(".garment-trousers"),
    sneakers: container.querySelector(".garment-sneakers"),
    jacket: container.querySelector(".garment-jacket"),
    accessory: container.querySelector(".garment-accessory"),
  };

  const scanner = container.querySelector("#cinema-scanner");
  const metaTags = container.querySelectorAll(".cinema-meta-tag");
  const profileNode = container.querySelector("#cinema-profile-node");
  const contextTags = container.querySelectorAll(".cinema-context-tag");
  const criteriaPills = container.querySelectorAll(".criteria-pill");
  const lookCard = container.querySelector("#cinema-look-card");
  const titleBlocks = container.querySelectorAll(".cinema-title-block");
  const timelineFill = container.querySelector("#cinema-progress-fill");
  const timelineBar = container.querySelector(".timeline-bar");
  const timelineDots = container.querySelectorAll(".timeline-dot");
  const playPauseBtn = container.querySelector("#cinema-play-btn");
  const playIcon = playPauseBtn ? playPauseBtn.querySelector(".icon-play") : null;
  const pauseIcon = playPauseBtn ? playPauseBtn.querySelector(".icon-pause") : null;
  const viewport = container.querySelector(".cinematic-viewport");

  // Scene thresholds:
  // Scene 1: 0.00 - 0.18 (Your Wardrobe)
  // Scene 2: 0.18 - 0.36 (ClothMatics Sees Your Wardrobe)
  // Scene 3: 0.36 - 0.54 (It Understands You)
  // Scene 4: 0.54 - 0.72 (AI Thinking)
  // Scene 5: 0.72 - 0.88 (The Recommendation)
  // Scene 6: 0.88 - 1.00 (The Final Message)
  const SCENE_STARTS = [0.08, 0.26, 0.44, 0.62, 0.78, 0.94];
  const TOTAL_DURATION = 21000; // 21 seconds full cycle (~3.5s per scene)

  let currentTime = 0; // ms
  let currentProgress = 0;
  let targetProgress = null; // null when playing automatically, float when seeking
  let isPaused = false;
  let isHovered = false;
  let isTabHidden = false;
  let isIntersecting = true;
  let lastTimestamp = null;
  let rafId = null;

  function setPlayState(paused) {
    isPaused = paused;
    if (playPauseBtn) {
      playPauseBtn.setAttribute("aria-label", isPaused ? "Play animation" : "Pause animation");
      playPauseBtn.title = isPaused ? "Play animation" : "Pause animation";
    }
    if (playIcon) playIcon.style.display = isPaused ? "block" : "none";
    if (pauseIcon) pauseIcon.style.display = isPaused ? "none" : "block";
  }

  function setActiveTitle(sceneIndex) {
    titleBlocks.forEach((block, idx) => {
      if (idx === sceneIndex) {
        block.classList.add("active");
      } else {
        block.classList.remove("active");
      }
    });

    timelineDots.forEach((dot, idx) => {
      if (idx === sceneIndex) {
        dot.classList.add("active");
      } else {
        dot.classList.remove("active");
      }
    });
  }

  function jumpToScene(sceneIndex) {
    const p = SCENE_STARTS[sceneIndex] ?? 0;
    targetProgress = p;
    setPlayState(false);
  }

  function render(p) {
    // 1. Timeline Progress Bar
    if (timelineFill) {
      timelineFill.style.width = `${(p * 100).toFixed(1)}%`;
    }

    // 2. Active Scene Title in Left Column
    let activeScene = 0;
    if (p < 0.18) activeScene = 0;
    else if (p < 0.36) activeScene = 1;
    else if (p < 0.54) activeScene = 2;
    else if (p < 0.72) activeScene = 3;
    else if (p < 0.88) activeScene = 4;
    else activeScene = 5;
    setActiveTitle(activeScene);

    // Responsive scaling
    const isMobile = window.innerWidth < 768;
    const baseScale = isMobile ? 0.72 : 1.0;

    // ==========================================
    // SCENE 1: Your Wardrobe (0.00 -> 0.18)
    // ==========================================
    if (p < 0.18) {
      const s1Prog = mapRange(p, 0.0, 0.18, 0, 1);
      const baseY = isMobile ? 10 : 0;

      // Center overshirt emerges
      const overshirtOpacity = mapRange(s1Prog, 0, 0.3, 0.6, 1);
      const overshirtScale = mapRange(s1Prog, 0, 0.7, 0.9 * baseScale, 1.05 * baseScale);
      const overshirtZ = mapRange(s1Prog, 0, 0.7, -40, 10);

      if (garments.overshirt) {
        garments.overshirt.style.opacity = overshirtOpacity;
        garments.overshirt.style.transform = `translate3d(0px, ${baseY}px, ${overshirtZ}px) scale(${overshirtScale})`;
      }

      // Other garments expand outward into suspended 3D studio orbit
      const expandProg = mapRange(s1Prog, 0.15, 1.0, 0, 1);
      const outerOpacity = mapRange(expandProg, 0, 0.4, 0, 1);

      // Tee (left)
      if (garments.tee) {
        const x = lerp(0, isMobile ? -100 : -180, expandProg);
        const y = lerp(baseY, isMobile ? -50 : -40, expandProg);
        const z = lerp(-60, 20, expandProg);
        const rot = lerp(0, -4, expandProg);
        garments.tee.style.opacity = outerOpacity;
        garments.tee.style.transform = `translate3d(${x}px, ${y}px, ${z}px) rotate(${rot}deg) scale(${0.92 * baseScale})`;
      }

      // Trousers (bottom center)
      if (garments.trousers) {
        const y = lerp(baseY, isMobile ? 120 : 160, expandProg);
        const z = lerp(-80, -10, expandProg);
        garments.trousers.style.opacity = outerOpacity;
        garments.trousers.style.transform = `translate3d(0px, ${y}px, ${z}px) scale(${0.95 * baseScale})`;
      }

      // Sneakers (bottom right)
      if (garments.sneakers) {
        const x = lerp(0, isMobile ? 100 : 170, expandProg);
        const y = lerp(baseY, isMobile ? 125 : 170, expandProg);
        const z = lerp(-100, 25, expandProg);
        const rot = lerp(0, 5, expandProg);
        garments.sneakers.style.opacity = outerOpacity;
        garments.sneakers.style.transform = `translate3d(${x}px, ${y}px, ${z}px) rotate(${rot}deg) scale(${0.88 * baseScale})`;
      }

      // Jacket (top right)
      if (garments.jacket) {
        const x = lerp(0, isMobile ? 100 : 180, expandProg);
        const y = lerp(baseY, isMobile ? -50 : -50, expandProg);
        const z = lerp(-110, -20, expandProg);
        const rot = lerp(0, 4, expandProg);
        garments.jacket.style.opacity = outerOpacity;
        garments.jacket.style.transform = `translate3d(${x}px, ${y}px, ${z}px) rotate(${rot}deg) scale(${0.95 * baseScale})`;
      }

      // Accessory / Watch (bottom left)
      if (garments.accessory) {
        const x = lerp(0, isMobile ? -95 : -170, expandProg);
        const y = lerp(baseY, isMobile ? 115 : 150, expandProg);
        const z = lerp(-50, 35, expandProg);
        garments.accessory.style.opacity = outerOpacity;
        garments.accessory.style.transform = `translate3d(${x}px, ${y}px, ${z}px) scale(${0.85 * baseScale})`;
      }

      // Hide overlays from other scenes
      if (scanner) scanner.style.opacity = 0;
      container.querySelectorAll(".garment-hud-bracket").forEach((b) => (b.style.opacity = 0));
      metaTags.forEach((tag) => (tag.style.opacity = 0));
      if (profileNode) profileNode.style.opacity = 0;
      contextTags.forEach((tag) => (tag.style.opacity = 0));
      criteriaPills.forEach((pill) => (pill.style.opacity = 0));
      if (lookCard) lookCard.classList.remove("active");
    }

    // ==========================================
    // SCENE 2: ClothMatics Sees Your Wardrobe (0.18 -> 0.36)
    // ==========================================
    else if (p < 0.36) {
      const s2Prog = mapRange(p, 0.18, 0.36, 0, 1);
      const baseY = isMobile ? 10 : 0;

      // Laser Scanner sweeps smoothly top to bottom inside right stage
      if (scanner) {
        scanner.style.opacity = mapRange(s2Prog, 0, 0.1, 0, 1);
        const scanY = lerp(-25, 25, s2Prog);
        scanner.style.transform = `translateY(${scanY}vh)`;
      }

      // Garments in locked gallery formation
      if (garments.overshirt) {
        garments.overshirt.style.opacity = 1;
        garments.overshirt.style.transform = `translate3d(0px, ${baseY}px, 10px) scale(${1.05 * baseScale})`;
      }
      if (garments.tee) {
        garments.tee.style.opacity = 0.98;
        garments.tee.style.transform = `translate3d(${isMobile ? -100 : -180}px, ${isMobile ? -50 : -40}px, 20px) rotate(-4deg) scale(${0.92 * baseScale})`;
      }
      if (garments.trousers) {
        garments.trousers.style.opacity = 0.98;
        garments.trousers.style.transform = `translate3d(0px, ${isMobile ? 120 : 160}px, -10px) scale(${0.95 * baseScale})`;
      }
      if (garments.sneakers) {
        garments.sneakers.style.opacity = 0.98;
        garments.sneakers.style.transform = `translate3d(${isMobile ? 100 : 170}px, ${isMobile ? 125 : 170}px, 25px) rotate(5deg) scale(${0.88 * baseScale})`;
      }
      if (garments.jacket) {
        garments.jacket.style.opacity = 0.98;
        garments.jacket.style.transform = `translate3d(${isMobile ? 100 : 180}px, ${isMobile ? -50 : -50}px, -20px) rotate(4deg) scale(${0.95 * baseScale})`;
      }
      if (garments.accessory) {
        garments.accessory.style.opacity = 0.98;
        garments.accessory.style.transform = `translate3d(${isMobile ? -95 : -170}px, ${isMobile ? 115 : 150}px, 35px) scale(${0.85 * baseScale})`;
      }

      // HUD brackets pulse on garments
      container.querySelectorAll(".garment-hud-bracket").forEach((bracket) => {
        bracket.style.opacity = mapRange(s2Prog, 0.1, 0.85, 0, 1);
      });

      // Metadata telemetry cards appear sequentially
      metaTags.forEach((tag, idx) => {
        const triggerPoint = 0.1 + idx * 0.12;
        const tagProg = mapRange(s2Prog, triggerPoint, triggerPoint + 0.16, 0, 1);
        tag.style.opacity = tagProg;
        tag.style.transform = `translateY(${lerp(8, 0, tagProg)}px)`;
      });

      if (profileNode) profileNode.style.opacity = 0;
      contextTags.forEach((tag) => (tag.style.opacity = 0));
      criteriaPills.forEach((pill) => (pill.style.opacity = 0));
      if (lookCard) lookCard.classList.remove("active");
    }

    // ==========================================
    // SCENE 3: It Understands You (0.36 -> 0.54)
    // ==========================================
    else if (p < 0.54) {
      const s3Prog = mapRange(p, 0.36, 0.54, 0, 1);

      if (scanner) scanner.style.opacity = 0;
      metaTags.forEach((tag) => (tag.style.opacity = 0));
      container.querySelectorAll(".garment-hud-bracket").forEach((b) => (b.style.opacity = 0));

      // Garments pull back into 3D background with subtle blur
      const pushZ = lerp(-20, -280, s3Prog);
      const pushOpacity = lerp(0.95, 0.28, s3Prog);
      const blurVal = lerp(0, 2.5, s3Prog);

      Object.values(garments).forEach((el) => {
        if (!el) return;
        el.style.opacity = pushOpacity;
        el.style.filter = `blur(${blurVal}px) brightness(0.7)`;
      });

      if (garments.overshirt) {
        garments.overshirt.style.transform = `translate3d(0px, -30px, ${pushZ}px) scale(${0.8 * baseScale})`;
      }
      if (garments.tee) {
        garments.tee.style.transform = `translate3d(-170px, -70px, ${pushZ}px) scale(${0.75 * baseScale})`;
      }
      if (garments.trousers) {
        garments.trousers.style.transform = `translate3d(0px, 140px, ${pushZ}px) scale(${0.75 * baseScale})`;
      }
      if (garments.sneakers) {
        garments.sneakers.style.transform = `translate3d(160px, 150px, ${pushZ}px) scale(${0.75 * baseScale})`;
      }
      if (garments.jacket) {
        garments.jacket.style.transform = `translate3d(170px, -80px, ${pushZ}px) scale(${0.75 * baseScale})`;
      }
      if (garments.accessory) {
        garments.accessory.style.transform = `translate3d(-160px, 130px, ${pushZ}px) scale(${0.75 * baseScale})`;
      }

      // Human profile silhouette fades and scales in center of stage
      if (profileNode) {
        const profOpacity = mapRange(s3Prog, 0.05, 0.45, 0, 1);
        const profScale = mapRange(s3Prog, 0, 0.55, 0.85, 1.0);
        profileNode.style.opacity = profOpacity;
        profileNode.style.transform = `translate3d(0px, 10px, 0px) scale(${profScale * baseScale})`;
      }

      // Context tags orbit around silhouette inside right stage
      contextTags.forEach((tag, idx) => {
        const tagTrigger = 0.12 + idx * 0.12;
        const tagProg = mapRange(s3Prog, tagTrigger, tagTrigger + 0.18, 0, 1);
        tag.style.opacity = tagProg;
        tag.style.transform = `translateY(${lerp(12, 0, tagProg)}px)`;
      });

      criteriaPills.forEach((pill) => (pill.style.opacity = 0));
      if (lookCard) lookCard.classList.remove("active");
    }

    // ==========================================
    // SCENE 4: AI Thinking (0.54 -> 0.72)
    // ==========================================
    else if (p < 0.72) {
      const s4Prog = mapRange(p, 0.54, 0.72, 0, 1);

      // Fade profile node & context tags
      if (profileNode) {
        profileNode.style.opacity = mapRange(s4Prog, 0, 0.25, 1, 0);
      }
      contextTags.forEach((tag) => (tag.style.opacity = 0));

      // AI dynamic flux: first half rapid magnetic exploration, second half snap align
      const isFluxing = s4Prog < 0.58;
      const settleProg = mapRange(s4Prog, 0.55, 1.0, 0, 1);

      // Non-matching pieces fade out (blazer and watch)
      if (garments.jacket) {
        garments.jacket.style.opacity = mapRange(s4Prog, 0, 0.35, 0.28, 0);
        garments.jacket.style.transform = `translate3d(220px, -120px, -350px) scale(${0.5 * baseScale})`;
      }
      if (garments.accessory) {
        garments.accessory.style.opacity = mapRange(s4Prog, 0, 0.35, 0.28, 0);
      }

      // Restore crisp filters on matching outfit
      Object.values(garments).forEach((el) => {
        if (!el) return;
        el.style.filter = "drop-shadow(0 18px 30px rgba(0,0,0,0.65))";
      });

      if (isFluxing) {
        // High-velocity orbital choreography inside right stage
        const angle = s4Prog * Math.PI * 4;
        const radius = lerp(140, 50, s4Prog / 0.58);

        if (garments.overshirt) {
          const ox = Math.cos(angle) * radius;
          const oy = Math.sin(angle) * (radius * 0.45) + 10;
          garments.overshirt.style.opacity = 1;
          garments.overshirt.style.transform = `translate3d(${ox}px, ${oy}px, 40px) scale(${1.0 * baseScale})`;
        }
        if (garments.tee) {
          const tx = Math.cos(angle + Math.PI * 0.5) * radius;
          const ty = Math.sin(angle + Math.PI * 0.5) * (radius * 0.45) + 10;
          garments.tee.style.opacity = 0.9;
          garments.tee.style.transform = `translate3d(${tx}px, ${ty}px, 20px) scale(${0.9 * baseScale})`;
        }
        if (garments.trousers) {
          const px = Math.cos(angle + Math.PI) * radius;
          const py = Math.sin(angle + Math.PI) * (radius * 0.45) + 10;
          garments.trousers.style.opacity = 1;
          garments.trousers.style.transform = `translate3d(${px}px, ${py}px, 15px) scale(${0.95 * baseScale})`;
        }
        if (garments.sneakers) {
          const sx = Math.cos(angle + Math.PI * 1.5) * radius;
          const sy = Math.sin(angle + Math.PI * 1.5) * (radius * 0.45) + 10;
          garments.sneakers.style.opacity = 1;
          garments.sneakers.style.transform = `translate3d(${sx}px, ${sy}px, 30px) scale(${0.88 * baseScale})`;
        }
      } else {
        // Magnetic snap into aligned column
        const ease = easeInOut(settleProg);

        // Overshirt upper center
        if (garments.overshirt) {
          const y = lerp(10, isMobile ? -80 : -90, ease);
          garments.overshirt.style.opacity = 1;
          garments.overshirt.style.transform = `translate3d(0px, ${y}px, 40px) scale(${1.05 * baseScale})`;
        }
        // Tee layered beneath
        if (garments.tee) {
          const y = lerp(10, isMobile ? -70 : -80, ease);
          garments.tee.style.opacity = lerp(0.9, 0.85, ease);
          garments.tee.style.transform = `translate3d(0px, ${y}px, 10px) scale(${0.95 * baseScale})`;
        }
        // Trousers lower
        if (garments.trousers) {
          const y = lerp(10, isMobile ? 60 : 75, ease);
          garments.trousers.style.opacity = 1;
          garments.trousers.style.transform = `translate3d(0px, ${y}px, 20px) scale(${0.98 * baseScale})`;
        }
        // Sneakers bottom
        if (garments.sneakers) {
          const y = lerp(10, isMobile ? 180 : 205, ease);
          garments.sneakers.style.opacity = 1;
          garments.sneakers.style.transform = `translate3d(0px, ${y}px, 0px) scale(${0.9 * baseScale})`;
        }
      }

      // Criteria evaluation pills flash and verify
      criteriaPills.forEach((pill, idx) => {
        const triggerPoint = 0.08 + idx * 0.14;
        const pillProg = mapRange(s4Prog, triggerPoint, triggerPoint + 0.18, 0, 1);
        pill.style.opacity = pillProg;
        pill.style.transform = `scale(${lerp(0.85, 1, pillProg)})`;
      });

      if (lookCard) lookCard.classList.remove("active");
    }

    // ==========================================
    // SCENE 5: The Recommendation (0.72 -> 0.88)
    // ==========================================
    else if (p < 0.88) {
      criteriaPills.forEach((pill) => (pill.style.opacity = 0));

      // Assembled outfit shifts left inside the right stage, making room for Today's Look card on the right
      const shiftX = isMobile ? 0 : -130;
      const outfitY = isMobile ? -75 : -90;
      const s5OutfitOpacity = isMobile ? 0 : 1;

      if (garments.overshirt) {
        garments.overshirt.style.opacity = s5OutfitOpacity;
        garments.overshirt.style.transform = `translate3d(${shiftX}px, ${outfitY}px, 40px) scale(${1.05 * baseScale})`;
      }
      if (garments.tee) {
        garments.tee.style.opacity = s5OutfitOpacity * 0.88;
        garments.tee.style.transform = `translate3d(${shiftX}px, ${outfitY + 10}px, 10px) scale(${0.95 * baseScale})`;
      }
      if (garments.trousers) {
        garments.trousers.style.opacity = s5OutfitOpacity;
        garments.trousers.style.transform = `translate3d(${shiftX}px, ${outfitY + 165}px, 20px) scale(${0.98 * baseScale})`;
      }
      if (garments.sneakers) {
        garments.sneakers.style.opacity = s5OutfitOpacity;
        garments.sneakers.style.transform = `translate3d(${shiftX}px, ${outfitY + 295}px, 0px) scale(${0.9 * baseScale})`;
      }

      // Reveal Luxury Look Card on right edge of stage
      if (lookCard) {
        lookCard.classList.add("active");
      }
    }

    // ==========================================
    // SCENE 6: The Final Message (0.88 -> 1.00)
    // ==========================================
    else {
      const s6Prog = mapRange(p, 0.88, 1.0, 0, 1);

      if (lookCard) lookCard.classList.remove("active");

      // Wide angle pull-back camera deep into 3D background
      const pullScale = lerp(baseScale * 0.7, baseScale * 0.45, s6Prog);
      const pullZ = lerp(-100, -480, s6Prog);
      const shiftX = isMobile ? 0 : lerp(-130, 0, s6Prog);
      const finalOutfitOpacity = lerp(0.32, 0.12, s6Prog);

      if (garments.overshirt) {
        garments.overshirt.style.opacity = finalOutfitOpacity;
        garments.overshirt.style.transform = `translate3d(${shiftX}px, -40px, ${pullZ + 40}px) scale(${pullScale})`;
      }
      if (garments.tee) {
        garments.tee.style.opacity = finalOutfitOpacity * 0.85;
        garments.tee.style.transform = `translate3d(${shiftX}px, -30px, ${pullZ + 10}px) scale(${pullScale * 0.95})`;
      }
      if (garments.trousers) {
        garments.trousers.style.opacity = finalOutfitOpacity;
        garments.trousers.style.transform = `translate3d(${shiftX}px, 90px, ${pullZ + 20}px) scale(${pullScale * 0.98})`;
      }
      if (garments.sneakers) {
        garments.sneakers.style.opacity = finalOutfitOpacity;
        garments.sneakers.style.transform = `translate3d(${shiftX}px, 210px, ${pullZ}px) scale(${pullScale * 0.9})`;
      }
    }
  }

  function loop(timestamp) {
    if (lastTimestamp === null) {
      lastTimestamp = timestamp;
    }
    const dt = timestamp - lastTimestamp;
    lastTimestamp = timestamp;

    // Advance timeline only when visible and not paused
    if (!isTabHidden && isIntersecting) {
      if (targetProgress !== null) {
        // User seeking / jumping to scene
        currentProgress = lerp(currentProgress, targetProgress, 0.12);
        currentTime = currentProgress * TOTAL_DURATION;
        if (Math.abs(currentProgress - targetProgress) < 0.002) {
          currentProgress = targetProgress;
          currentTime = currentProgress * TOTAL_DURATION;
          targetProgress = null; // Seek complete, return to autonomous flow
        }
      } else if (!isPaused && !isHovered) {
        // Autonomous continuous play
        currentTime = (currentTime + dt) % TOTAL_DURATION;
        currentProgress = currentTime / TOTAL_DURATION;
      }
    }

    render(currentProgress);

    rafId = requestAnimationFrame(loop);
  }

  // Event Listeners: Play / Pause toggle
  if (playPauseBtn) {
    playPauseBtn.addEventListener("click", () => {
      setPlayState(!isPaused);
    });
  }

  // Hover pause / resume (only on desktop pointer devices)
  if (viewport && window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
    viewport.addEventListener("mouseenter", () => {
      isHovered = true;
    });
    viewport.addEventListener("mouseleave", () => {
      isHovered = false;
    });
  }

  // Interactive Timeline Dot Navigation
  timelineDots.forEach((dot) => {
    dot.addEventListener("click", () => {
      const sceneIndex = parseInt(dot.getAttribute("data-scene"), 10) - 1;
      jumpToScene(sceneIndex);
    });
  });

  // Timeline Progress Bar Scrubbing
  if (timelineBar) {
    timelineBar.addEventListener("click", (e) => {
      const rect = timelineBar.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const scrubP = clamp(0, clickX / rect.width, 0.999);
      targetProgress = scrubP;
      setPlayState(false);
    });
  }

  // Tab Visibility optimization (don't waste battery when hidden)
  const onVisibilityChange = () => {
    isTabHidden = document.hidden;
    if (!isTabHidden) {
      lastTimestamp = null; // Prevent frame delta spike
    }
  };
  document.addEventListener("visibilitychange", onVisibilityChange);

  // IntersectionObserver: Pause RAF updates when hero is off-screen
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

  return {
    destroy() {
      if (rafId) cancelAnimationFrame(rafId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (observer) observer.disconnect();
    },
    jumpToScene,
    pause() { setPlayState(true); },
    play() { setPlayState(false); },
  };
}

// Auto-initialize when loaded in browser (CSP-compliant without inline scripts)
if (typeof window !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => initCinematicStory());
  } else {
    initCinematicStory();
  }
}
