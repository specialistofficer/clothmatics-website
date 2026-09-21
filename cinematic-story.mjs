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
    // SCENE 1: YOUR WARDROBE (0.00 -> 0.167)
    // =========================================================================
    if (p < 0.167) {
      const s1Prog = p / 0.167; // 0 -> 1
      const ease = easeInOutCubic(s1Prog);
      const enterOpacity = mapRange(s1Prog, 0.0, 0.25, 0.5, 1);

      // Overshirt (Center)
      if (garments.overshirt) {
        garments.overshirt.style.opacity = enterOpacity;
        garments.overshirt.style.filter = "none";
        garments.overshirt.style.transform = `translate3d(0px, ${-20 + float1}px, 20px) scale(${1.05 * baseScale})`;
      }

      // Tee (Upper Left)
      if (garments.tee) {
        const x = lerp(isMobile ? -90 : -160, isMobile ? -100 : -190, ease);
        garments.tee.style.opacity = enterOpacity * 0.96;
        garments.tee.style.filter = "none";
        garments.tee.style.transform = `translate3d(${x}px, ${-50 + float2}px, 10px) rotate(-4deg) scale(${0.92 * baseScale})`;
      }

      // Jacket (Upper Right)
      if (garments.jacket) {
        const x = lerp(isMobile ? 90 : 160, isMobile ? 100 : 190, ease);
        garments.jacket.style.opacity = enterOpacity * 0.96;
        garments.jacket.style.filter = "none";
        garments.jacket.style.transform = `translate3d(${x}px, ${-50 + float3}px, -10px) rotate(4deg) scale(${0.95 * baseScale})`;
      }

      // Watch (Lower Left)
      if (garments.accessory) {
        const x = isMobile ? -95 : -180;
        garments.accessory.style.opacity = enterOpacity * 0.95;
        garments.accessory.style.filter = "none";
        garments.accessory.style.transform = `translate3d(${x}px, ${140 + float4}px, 25px) scale(${0.85 * baseScale})`;
      }

      // Trousers (Lower Center)
      if (garments.trousers) {
        garments.trousers.style.opacity = enterOpacity * 0.98;
        garments.trousers.style.filter = "none";
        garments.trousers.style.transform = `translate3d(0px, ${150 + float5}px, -10px) scale(${0.95 * baseScale})`;
      }

      // Sneakers (Lower Right)
      if (garments.sneakers) {
        const x = isMobile ? 95 : 170;
        garments.sneakers.style.opacity = enterOpacity * 0.98;
        garments.sneakers.style.filter = "none";
        garments.sneakers.style.transform = `translate3d(${x}px, ${160 + float6}px, 20px) rotate(5deg) scale(${0.88 * baseScale})`;
      }

      // Overlays from other scenes hidden
      if (scanner) scanner.style.opacity = 0;
      container.querySelectorAll(".garment-hud-bracket").forEach((b) => (b.style.opacity = 0));
      metaTags.forEach((t) => (t.style.opacity = 0));
      if (profileNode) profileNode.style.opacity = 0;
      contextTags.forEach((t) => (t.style.opacity = 0));
      criteriaPills.forEach((pill) => (pill.style.opacity = 0));
      if (lookCard) lookCard.classList.remove("active");
    }

    // =========================================================================
    // SCENE 2: INTELLIGENT VISION & SPECTRUM SCAN (0.167 -> 0.333)
    // =========================================================================
    else if (p < 0.333) {
      const s2Prog = (p - 0.167) / 0.166; // 0 -> 1

      // Clothes remain steady in their spacious constellation with subtle breathing
      if (garments.overshirt) {
        garments.overshirt.style.opacity = 1;
        garments.overshirt.style.transform = `translate3d(0px, ${-20 + float1}px, 20px) scale(${1.05 * baseScale})`;
      }
      if (garments.tee) {
        garments.tee.style.opacity = 0.98;
        garments.tee.style.transform = `translate3d(${isMobile ? -100 : -190}px, ${-50 + float2}px, 10px) rotate(-4deg) scale(${0.92 * baseScale})`;
      }
      if (garments.jacket) {
        garments.jacket.style.opacity = 0.98;
        garments.jacket.style.transform = `translate3d(${isMobile ? 100 : 190}px, ${-50 + float3}px, -10px) rotate(4deg) scale(${0.95 * baseScale})`;
      }
      if (garments.accessory) {
        garments.accessory.style.opacity = 0.98;
        garments.accessory.style.transform = `translate3d(${isMobile ? -95 : -180}px, ${140 + float4}px, 25px) scale(${0.85 * baseScale})`;
      }
      if (garments.trousers) {
        garments.trousers.style.opacity = 0.98;
        garments.trousers.style.transform = `translate3d(0px, ${150 + float5}px, -10px) scale(${0.95 * baseScale})`;
      }
      if (garments.sneakers) {
        garments.sneakers.style.opacity = 0.98;
        garments.sneakers.style.transform = `translate3d(${isMobile ? 95 : 170}px, ${160 + float6}px, 20px) rotate(5deg) scale(${0.88 * baseScale})`;
      }

      // Laser Scanner sweeps smoothly top to bottom inside the right stage
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
        const trigger = 0.1 + idx * 0.12;
        const tagProg = mapRange(s2Prog, trigger, trigger + 0.15, 0, 1);
        tag.style.opacity = tagProg;
        tag.style.transform = `translateY(${lerp(8, 0, tagProg)}px)`;
      });

      if (profileNode) profileNode.style.opacity = 0;
      contextTags.forEach((t) => (t.style.opacity = 0));
      criteriaPills.forEach((pill) => (pill.style.opacity = 0));
      if (lookCard) lookCard.classList.remove("active");
    }

    // =========================================================================
    // SCENE 3: PERSONAL CONTEXT & HUMAN SILHOUETTE (0.333 -> 0.500)
    // =========================================================================
    else if (p < 0.500) {
      const s3Prog = (p - 0.333) / 0.167; // 0 -> 1
      const ease = easeInOutCubic(s3Prog);

      if (scanner) scanner.style.opacity = 0;
      container.querySelectorAll(".garment-hud-bracket").forEach((b) => (b.style.opacity = 0));
      metaTags.forEach((t) => (t.style.opacity = 0));

      // Clothes smoothly recede into deep background with soft blur, avoiding clutter around silhouette
      const pushZ = lerp(-10, -280, ease);
      const pushOpacity = lerp(0.95, 0.08, ease); // Drop to 8% opacity so silhouette is clean hero
      const blurVal = lerp(0, 4, ease);

      Object.values(garments).forEach((el) => {
        if (!el) return;
        el.style.opacity = pushOpacity;
        el.style.filter = `blur(${blurVal}px) brightness(0.6)`;
      });

      if (garments.overshirt) {
        garments.overshirt.style.transform = `translate3d(0px, -40px, ${pushZ}px) scale(${0.75 * baseScale})`;
      }
      if (garments.tee) {
        garments.tee.style.transform = `translate3d(-200px, -80px, ${pushZ}px) scale(${0.7 * baseScale})`;
      }
      if (garments.jacket) {
        garments.jacket.style.transform = `translate3d(200px, -80px, ${pushZ}px) scale(${0.7 * baseScale})`;
      }
      if (garments.accessory) {
        garments.accessory.style.transform = `translate3d(-190px, 140px, ${pushZ}px) scale(${0.7 * baseScale})`;
      }
      if (garments.trousers) {
        garments.trousers.style.transform = `translate3d(0px, 160px, ${pushZ}px) scale(${0.7 * baseScale})`;
      }
      if (garments.sneakers) {
        garments.sneakers.style.transform = `translate3d(180px, 160px, ${pushZ}px) scale(${0.7 * baseScale})`;
      }

      // Human Profile Silhouette illuminates in the center of the stage
      if (profileNode) {
        const profOpacity = mapRange(s3Prog, 0.05, 0.45, 0, 1);
        const profScale = mapRange(s3Prog, 0.0, 0.55, 0.88, 1.0);
        profileNode.style.opacity = profOpacity;
        profileNode.style.transform = `translate3d(0px, ${float1 * 0.5}px, 0px) scale(${profScale * baseScale})`;
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
    }

    // =========================================================================
    // SCENE 4: AI THINKING & ALIGNMENT (0.500 -> 0.667)
    // =========================================================================
    else if (p < 0.667) {
      const s4Prog = (p - 0.500) / 0.167; // 0 -> 1
      const ease = easeInOutCubic(s4Prog);

      // Fade out silhouette and context tags
      if (profileNode) {
        profileNode.style.opacity = mapRange(s4Prog, 0.0, 0.25, 1, 0);
      }
      contextTags.forEach((t) => (t.style.opacity = 0));

      // Non-selected pieces (jacket and watch) gracefully fade out completely
      if (garments.jacket) {
        garments.jacket.style.opacity = mapRange(s4Prog, 0.0, 0.35, 0.08, 0);
      }
      if (garments.accessory) {
        garments.accessory.style.opacity = mapRange(s4Prog, 0.0, 0.35, 0.08, 0);
      }

      // The selected 4 pieces (overshirt, tee, trousers, sneakers) restore clarity
      // and smoothly glide into the vertical outfit stack
      const outfitOpacity = mapRange(s4Prog, 0.05, 0.45, 0.08, 1);

      if (garments.overshirt) {
        const y = lerp(-40, isMobile ? -75 : -90, ease);
        garments.overshirt.style.opacity = outfitOpacity;
        garments.overshirt.style.filter = "none";
        garments.overshirt.style.transform = `translate3d(0px, ${y + float1}px, 35px) scale(${1.05 * baseScale})`;
      }

      if (garments.tee) {
        const x = lerp(isMobile ? -100 : -200, 0, ease);
        const y = lerp(-80, isMobile ? -70 : -85, ease);
        garments.tee.style.opacity = outfitOpacity * 0.88;
        garments.tee.style.filter = "none";
        garments.tee.style.transform = `translate3d(${x}px, ${y + float1}px, 10px) scale(${0.95 * baseScale})`;
      }

      if (garments.trousers) {
        const y = lerp(160, isMobile ? 65 : 80, ease);
        garments.trousers.style.opacity = outfitOpacity;
        garments.trousers.style.filter = "none";
        garments.trousers.style.transform = `translate3d(0px, ${y + float5}px, 20px) scale(${0.98 * baseScale})`;
      }

      if (garments.sneakers) {
        const x = lerp(isMobile ? 95 : 180, 0, ease);
        const y = lerp(160, isMobile ? 185 : 215, ease);
        garments.sneakers.style.opacity = outfitOpacity;
        garments.sneakers.style.filter = "none";
        garments.sneakers.style.transform = `translate3d(${x}px, ${y + float6}px, 5px) scale(${0.9 * baseScale})`;
      }

      // Criteria evaluation pills flash and verify
      criteriaPills.forEach((pill, idx) => {
        const trigger = 0.1 + idx * 0.14;
        const pillProg = mapRange(s4Prog, trigger, trigger + 0.18, 0, 1);
        pill.style.opacity = pillProg;
        pill.style.transform = `scale(${lerp(0.85, 1, pillProg)})`;
      });

      if (lookCard) lookCard.classList.remove("active");
    }

    // =========================================================================
    // SCENE 5: THE RECOMMENDATION (0.667 -> 0.833)
    // =========================================================================
    else if (p < 0.833) {
      const s5Prog = (p - 0.667) / 0.166; // 0 -> 1
      const ease = easeInOutCubic(s5Prog);

      if (profileNode) profileNode.style.opacity = 0;
      contextTags.forEach((t) => (t.style.opacity = 0));
      criteriaPills.forEach((pill) => (pill.style.opacity = 0));
      metaTags.forEach((t) => (t.style.opacity = 0));

      // Assembled outfit shifts left on desktop to make generous room for Today's Look card
      const shiftX = isMobile ? 0 : lerp(0, -140, ease);
      const s5GarmentOpacity = isMobile ? 0 : 1; // On mobile, hide background clothes so card is 100% clean

      if (garments.overshirt) {
        garments.overshirt.style.opacity = s5GarmentOpacity;
        garments.overshirt.style.transform = `translate3d(${shiftX}px, ${-90 + float1}px, 35px) scale(${1.05 * baseScale})`;
      }
      if (garments.tee) {
        garments.tee.style.opacity = s5GarmentOpacity * 0.88;
        garments.tee.style.transform = `translate3d(${shiftX}px, ${-85 + float1}px, 10px) scale(${0.95 * baseScale})`;
      }
      if (garments.trousers) {
        garments.trousers.style.opacity = s5GarmentOpacity;
        garments.trousers.style.transform = `translate3d(${shiftX}px, ${80 + float5}px, 20px) scale(${0.98 * baseScale})`;
      }
      if (garments.sneakers) {
        garments.sneakers.style.opacity = s5GarmentOpacity;
        garments.sneakers.style.transform = `translate3d(${shiftX}px, ${215 + float6}px, 5px) scale(${0.9 * baseScale})`;
      }

      // Reveal Luxury Look Card
      if (lookCard) {
        lookCard.classList.add("active");
      }
    }

    // =========================================================================
    // SCENE 6: THE FINAL EXPERIENCE & WRAP-AROUND (0.833 -> 1.000)
    // =========================================================================
    else {
      const s6Prog = (p - 0.833) / 0.167; // 0 -> 1
      const ease = easeInOutCubic(s6Prog);

      if (lookCard) lookCard.classList.remove("active");
      if (profileNode) profileNode.style.opacity = 0;
      contextTags.forEach((t) => (t.style.opacity = 0));
      criteriaPills.forEach((pill) => (pill.style.opacity = 0));
      metaTags.forEach((t) => (t.style.opacity = 0));

      // Outfit recedes deep into 3D background
      const pullScale = lerp(baseScale * 0.8, baseScale * 0.45, ease);
      const pullZ = lerp(-50, -450, ease);
      const shiftX = isMobile ? 0 : lerp(-140, 0, ease);
      const finalOpacity = lerp(0.35, 0.15, ease);

      if (garments.overshirt) {
        garments.overshirt.style.opacity = finalOpacity;
        garments.overshirt.style.transform = `translate3d(${shiftX}px, -40px, ${pullZ + 35}px) scale(${pullScale})`;
      }
      if (garments.tee) {
        garments.tee.style.opacity = finalOpacity * 0.85;
        garments.tee.style.transform = `translate3d(${shiftX}px, -35px, ${pullZ + 10}px) scale(${pullScale * 0.95})`;
      }
      if (garments.trousers) {
        garments.trousers.style.opacity = finalOpacity;
        garments.trousers.style.transform = `translate3d(${shiftX}px, 70px, ${pullZ + 20}px) scale(${pullScale * 0.98})`;
      }
      if (garments.sneakers) {
        garments.sneakers.style.opacity = finalOpacity;
        garments.sneakers.style.transform = `translate3d(${shiftX}px, 175px, ${pullZ}px) scale(${pullScale * 0.9})`;
      }
    }
  }

  let isPaused = false;

  function loop(timestamp) {
    if (lastTimestamp === null) {
      lastTimestamp = timestamp;
    }
    const dt = timestamp - lastTimestamp;
    lastTimestamp = timestamp;

    // Advance timeline continuously when tab is active and visible
    // Never stop on mouse move or hover!
    if (!isTabHidden && isIntersecting && !isPaused) {
      currentTime = (currentTime + dt) % TOTAL_DURATION;
      currentProgress = currentTime / TOTAL_DURATION;
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
      render(currentProgress, performance.now());
    },
    pause() {
      isPaused = true;
    },
    resume() {
      isPaused = false;
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
