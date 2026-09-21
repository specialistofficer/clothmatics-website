/**
 * ClothMatics Cinematic Storytelling Controller
 * Framer-Motion-grade scroll-linked physics engine for luxury fashion storytelling.
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
  const timelineDots = container.querySelectorAll(".timeline-dot");

  let currentProgress = 0;
  let targetProgress = 0;
  let rafId = null;
  let isRunning = false;

  // Scene thresholds
  // Scene 1: 0.00 - 0.18 (Your Wardrobe)
  // Scene 2: 0.18 - 0.36 (ClothMatics Sees Your Wardrobe)
  // Scene 3: 0.36 - 0.54 (It Understands You)
  // Scene 4: 0.54 - 0.72 (AI Thinking)
  // Scene 5: 0.72 - 0.88 (The Recommendation)
  // Scene 6: 0.88 - 1.00 (The Final Message)

  function updateTargetProgress() {
    const rect = container.getBoundingClientRect();
    const scrollableDistance = rect.height - window.innerHeight;
    if (scrollableDistance <= 0) return;
    const scrolled = -rect.top;
    targetProgress = clamp(0, scrolled / scrollableDistance, 1);
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

  function render(p) {
    // 1. Timeline Bar
    if (timelineFill) {
      timelineFill.style.width = `${(p * 100).toFixed(1)}%`;
    }

    // Determine Active Scene Title
    let activeScene = 0;
    if (p < 0.18) activeScene = 0;
    else if (p < 0.36) activeScene = 1;
    else if (p < 0.54) activeScene = 2;
    else if (p < 0.72) activeScene = 3;
    else if (p < 0.88) activeScene = 4;
    else activeScene = 5;
    setActiveTitle(activeScene);

    // Dynamic viewport responsive scale factor
    const isMobile = window.innerWidth < 768;
    const baseScale = isMobile ? 0.72 : 1.0;

    // ==========================================
    // SCENE 1: Your Wardrobe (0.00 -> 0.18)
    // ==========================================
    if (p < 0.18) {
      const s1Prog = mapRange(p, 0.0, 0.18, 0, 1);

      const baseY = isMobile ? 150 : 110;

      // Center overshirt emerges from dark (starts visible at 0.5 for immediate visual impact)
      const overshirtOpacity = mapRange(s1Prog, 0, 0.35, 0.55, 1);
      const overshirtScale = mapRange(s1Prog, 0, 0.7, 0.88 * baseScale, 1.05 * baseScale);
      const overshirtZ = mapRange(s1Prog, 0, 0.7, -60, 0);

      if (garments.overshirt) {
        garments.overshirt.style.opacity = overshirtOpacity;
        garments.overshirt.style.transform = `translate3d(0px, ${baseY}px, ${overshirtZ}px) scale(${overshirtScale})`;
      }

      // Other garments expand outward into 3D suspended studio space
      const expandProg = mapRange(s1Prog, 0.2, 1.0, 0, 1);
      const outerOpacity = mapRange(expandProg, 0, 0.45, 0, 1);

      // Tee (left)
      if (garments.tee) {
        const x = lerp(0, isMobile ? -140 : -320, expandProg);
        const y = lerp(baseY, isMobile ? 60 : 50, expandProg);
        const z = lerp(-80, 20, expandProg);
        const rot = lerp(0, -5, expandProg);
        garments.tee.style.opacity = outerOpacity;
        garments.tee.style.transform = `translate3d(${x}px, ${y}px, ${z}px) rotate(${rot}deg) scale(${0.92 * baseScale})`;
      }

      // Trousers (bottom center)
      if (garments.trousers) {
        const y = lerp(baseY, isMobile ? 260 : 260, expandProg);
        const z = lerp(-100, -10, expandProg);
        garments.trousers.style.opacity = outerOpacity;
        garments.trousers.style.transform = `translate3d(0px, ${y}px, ${z}px) scale(${0.95 * baseScale})`;
      }

      // Sneakers (bottom right)
      if (garments.sneakers) {
        const x = lerp(0, isMobile ? 130 : 270, expandProg);
        const y = lerp(baseY, isMobile ? 260 : 270, expandProg);
        const z = lerp(-120, 30, expandProg);
        const rot = lerp(0, 6, expandProg);
        garments.sneakers.style.opacity = outerOpacity;
        garments.sneakers.style.transform = `translate3d(${x}px, ${y}px, ${z}px) rotate(${rot}deg) scale(${0.88 * baseScale})`;
      }

      // Jacket (upper right)
      if (garments.jacket) {
        const x = lerp(0, isMobile ? 140 : 320, expandProg);
        const y = lerp(baseY, isMobile ? 50 : 40, expandProg);
        const z = lerp(-140, -20, expandProg);
        const rot = lerp(0, 4, expandProg);
        garments.jacket.style.opacity = outerOpacity;
        garments.jacket.style.transform = `translate3d(${x}px, ${y}px, ${z}px) rotate(${rot}deg) scale(${0.95 * baseScale})`;
      }

      // Watch / Accessory (bottom left)
      if (garments.accessory) {
        const x = lerp(0, isMobile ? -130 : -270, expandProg);
        const y = lerp(baseY, isMobile ? 240 : 240, expandProg);
        const z = lerp(-60, 40, expandProg);
        garments.accessory.style.opacity = outerOpacity;
        garments.accessory.style.transform = `translate3d(${x}px, ${y}px, ${z}px) scale(${0.85 * baseScale})`;
      }

      // Scanner, brackets, and overlays hidden
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

      // Scanner beam moves smoothly from top to bottom
      if (scanner) {
        scanner.style.opacity = mapRange(s2Prog, 0, 0.08, 0, 1);
        const scanY = lerp(-15, 38, s2Prog);
        scanner.style.transform = `translateY(${scanY}vh)`;
      }

      // Garments stabilize in structured gallery formation
      const galleryY = isMobile ? 135 : 95;
      if (garments.overshirt) {
        garments.overshirt.style.opacity = 1;
        garments.overshirt.style.transform = `translate3d(0px, ${galleryY}px, 20px) scale(${1.05 * baseScale})`;
      }
      if (garments.tee) {
        garments.tee.style.opacity = 0.98;
        garments.tee.style.transform = `translate3d(${isMobile ? -140 : -320}px, ${isMobile ? 50 : 50}px, 10px) rotate(-4deg) scale(${0.92 * baseScale})`;
      }
      if (garments.trousers) {
        garments.trousers.style.opacity = 0.98;
        garments.trousers.style.transform = `translate3d(0px, ${isMobile ? 260 : 260}px, -10px) scale(${0.95 * baseScale})`;
      }
      if (garments.sneakers) {
        garments.sneakers.style.opacity = 0.98;
        garments.sneakers.style.transform = `translate3d(${isMobile ? 130 : 270}px, ${isMobile ? 260 : 270}px, 20px) rotate(6deg) scale(${0.88 * baseScale})`;
      }
      if (garments.jacket) {
        garments.jacket.style.opacity = 0.98;
        garments.jacket.style.transform = `translate3d(${isMobile ? 140 : 320}px, ${isMobile ? 40 : 40}px, -10px) rotate(4deg) scale(${0.95 * baseScale})`;
      }
      if (garments.accessory) {
        garments.accessory.style.opacity = 0.98;
        garments.accessory.style.transform = `translate3d(${isMobile ? -130 : -270}px, ${isMobile ? 240 : 240}px, 30px) scale(${0.85 * baseScale})`;
      }

      // Activate corner HUD brackets on garments during scan
      container.querySelectorAll(".garment-hud-bracket").forEach((bracket) => {
        bracket.style.opacity = mapRange(s2Prog, 0.15, 0.85, 0, 1);
      });

      // Metadata telemetry labels pop in sequentially
      metaTags.forEach((tag, idx) => {
        const triggerPoint = 0.12 + idx * 0.12;
        const tagProg = mapRange(s2Prog, triggerPoint, triggerPoint + 0.15, 0, 1);
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

      // Garments pull back in 3D depth
      const pushZ = lerp(-20, -320, s3Prog);
      const pushOpacity = lerp(0.95, 0.35, s3Prog);
      const blurVal = lerp(0, 3, s3Prog);

      Object.values(garments).forEach((el) => {
        if (!el) return;
        el.style.opacity = pushOpacity;
        el.style.filter = `blur(${blurVal}px) brightness(0.7)`;
      });

      if (garments.overshirt) {
        garments.overshirt.style.transform = `translate3d(0px, -40px, ${pushZ}px) scale(${0.8 * baseScale})`;
      }
      if (garments.tee) {
        garments.tee.style.transform = `translate3d(-260px, -80px, ${pushZ}px) scale(${0.75 * baseScale})`;
      }
      if (garments.trousers) {
        garments.trousers.style.transform = `translate3d(0px, 180px, ${pushZ}px) scale(${0.75 * baseScale})`;
      }
      if (garments.sneakers) {
        garments.sneakers.style.transform = `translate3d(240px, 190px, ${pushZ}px) scale(${0.75 * baseScale})`;
      }
      if (garments.jacket) {
        garments.jacket.style.transform = `translate3d(270px, -110px, ${pushZ}px) scale(${0.75 * baseScale})`;
      }

      // Human profile silhouette fades and scales in
      if (profileNode) {
        const profOpacity = mapRange(s3Prog, 0.05, 0.5, 0, 1);
        const profScale = mapRange(s3Prog, 0, 0.6, 0.85, 1.0);
        profileNode.style.opacity = profOpacity;
        profileNode.style.transform = `translate3d(0px, 30px, 0px) scale(${profScale * baseScale})`;
      }

      // Context tags orbit in
      contextTags.forEach((tag, idx) => {
        const tagTrigger = 0.15 + idx * 0.12;
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

      // Fade profile node
      if (profileNode) {
        profileNode.style.opacity = mapRange(s4Prog, 0, 0.3, 1, 0);
      }
      contextTags.forEach((tag) => (tag.style.opacity = 0));

      // AI dynamic flux: in the first half of scene 4 (0.0 -> 0.55), rapid magnetic exploration
      // In second half (0.55 -> 1.0), pieces smoothly settle and assemble
      const isFluxing = s4Prog < 0.6;
      const settleProg = mapRange(s4Prog, 0.55, 1.0, 0, 1);

      // Incompatible pieces fade out (blazer and watch)
      if (garments.jacket) {
        garments.jacket.style.opacity = mapRange(s4Prog, 0, 0.4, 0.35, 0);
        garments.jacket.style.transform = `translate3d(320px, -140px, -400px) scale(${0.5 * baseScale})`;
      }
      if (garments.accessory) {
        garments.accessory.style.opacity = mapRange(s4Prog, 0, 0.4, 0.35, 0);
      }

      // Reset filters on core outfit
      Object.values(garments).forEach((el) => {
        if (!el) return;
        el.style.filter = `drop-shadow(0 20px 30px rgba(0,0,0,0.6))`;
      });

      if (isFluxing) {
        // High-velocity orbital choreography
        const angle = s4Prog * Math.PI * 4;
        const radius = lerp(200, 70, s4Prog / 0.6);

        if (garments.overshirt) {
          const ox = Math.cos(angle) * radius;
          const oy = Math.sin(angle) * (radius * 0.5) + 30;
          garments.overshirt.style.opacity = 1;
          garments.overshirt.style.transform = `translate3d(${ox}px, ${oy}px, 50px) scale(${1.0 * baseScale})`;
        }
        if (garments.tee) {
          const tx = Math.cos(angle + Math.PI * 0.5) * radius;
          const ty = Math.sin(angle + Math.PI * 0.5) * (radius * 0.5) + 30;
          garments.tee.style.opacity = 0.9;
          garments.tee.style.transform = `translate3d(${tx}px, ${ty}px, 20px) scale(${0.9 * baseScale})`;
        }
        if (garments.trousers) {
          const px = Math.cos(angle + Math.PI) * radius;
          const py = Math.sin(angle + Math.PI) * (radius * 0.5) + 30;
          garments.trousers.style.opacity = 1;
          garments.trousers.style.transform = `translate3d(${px}px, ${py}px, 10px) scale(${0.95 * baseScale})`;
        }
        if (garments.sneakers) {
          const sx = Math.cos(angle + Math.PI * 1.5) * radius;
          const sy = Math.sin(angle + Math.PI * 1.5) * (radius * 0.5) + 30;
          garments.sneakers.style.opacity = 1;
          garments.sneakers.style.transform = `translate3d(${sx}px, ${sy}px, 30px) scale(${0.88 * baseScale})`;
        }
      } else {
        // Magnetic snap into aligned column
        const ease = easeInOut(settleProg);

        // Overshirt center upper
        if (garments.overshirt) {
          const y = lerp(30, -70, ease);
          garments.overshirt.style.opacity = 1;
          garments.overshirt.style.transform = `translate3d(0px, ${y}px, 40px) scale(${1.05 * baseScale})`;
        }
        // Tee layered beneath
        if (garments.tee) {
          const y = lerp(30, -60, ease);
          garments.tee.style.opacity = lerp(0.9, 0.85, ease);
          garments.tee.style.transform = `translate3d(0px, ${y}px, 10px) scale(${0.95 * baseScale})`;
        }
        // Trousers lower
        if (garments.trousers) {
          const y = lerp(30, 100, ease);
          garments.trousers.style.opacity = 1;
          garments.trousers.style.transform = `translate3d(0px, ${y}px, 20px) scale(${0.98 * baseScale})`;
        }
        // Sneakers bottom
        if (garments.sneakers) {
          const y = lerp(30, 240, ease);
          garments.sneakers.style.opacity = 1;
          garments.sneakers.style.transform = `translate3d(0px, ${y}px, 0px) scale(${0.9 * baseScale})`;
        }
      }

      // Criteria evaluation pills flash and verify
      criteriaPills.forEach((pill, idx) => {
        const triggerPoint = 0.1 + idx * 0.15;
        const pillProg = mapRange(s4Prog, triggerPoint, triggerPoint + 0.2, 0, 1);
        pill.style.opacity = pillProg;
        pill.style.transform = `scale(${lerp(0.85, 1, pillProg)})`;
      });

      if (lookCard) lookCard.classList.remove("active");
    }

    // ==========================================
    // SCENE 5: The Recommendation (0.72 -> 0.88)
    // ==========================================
    else if (p < 0.88) {
      const s5Prog = mapRange(p, 0.72, 0.88, 0, 1);

      criteriaPills.forEach((pill) => (pill.style.opacity = 0));

      // Assembled outfit locked into high-fashion column, shifted left for luxury look card
      const shiftX = isMobile ? 0 : -160;
      const outfitY = isMobile ? -110 : -70;

      if (garments.overshirt) {
        garments.overshirt.style.opacity = 1;
        garments.overshirt.style.transform = `translate3d(${shiftX}px, ${outfitY}px, 40px) scale(${1.05 * baseScale})`;
      }
      if (garments.tee) {
        garments.tee.style.opacity = 0.88;
        garments.tee.style.transform = `translate3d(${shiftX}px, ${outfitY + 10}px, 10px) scale(${0.95 * baseScale})`;
      }
      if (garments.trousers) {
        garments.trousers.style.opacity = 1;
        garments.trousers.style.transform = `translate3d(${shiftX}px, ${outfitY + 170}px, 20px) scale(${0.98 * baseScale})`;
      }
      if (garments.sneakers) {
        garments.sneakers.style.opacity = 1;
        garments.sneakers.style.transform = `translate3d(${shiftX}px, ${outfitY + 310}px, 0px) scale(${0.9 * baseScale})`;
      }

      // Reveal Luxury Look Card
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
      const pullScale = lerp(baseScale * 0.65, baseScale * 0.42, s6Prog);
      const pullZ = lerp(-120, -520, s6Prog);
      const shiftX = isMobile ? 0 : lerp(-160, 0, s6Prog);
      const finalOutfitOpacity = lerp(0.3, 0.1, s6Prog);

      if (garments.overshirt) {
        garments.overshirt.style.opacity = finalOutfitOpacity;
        garments.overshirt.style.transform = `translate3d(${shiftX}px, -40px, ${pullZ + 40}px) scale(${pullScale})`;
      }
      if (garments.tee) {
        garments.tee.style.opacity = finalOutfitOpacity * 0.8;
        garments.tee.style.transform = `translate3d(${shiftX}px, -30px, ${pullZ + 10}px) scale(${pullScale * 0.95})`;
      }
      if (garments.trousers) {
        garments.trousers.style.opacity = finalOutfitOpacity;
        garments.trousers.style.transform = `translate3d(${shiftX}px, 110px, ${pullZ + 20}px) scale(${pullScale * 0.98})`;
      }
      if (garments.sneakers) {
        garments.sneakers.style.opacity = finalOutfitOpacity;
        garments.sneakers.style.transform = `translate3d(${shiftX}px, 240px, ${pullZ}px) scale(${pullScale * 0.9})`;
      }
    }
  }

  function loop() {
    // Spring lerp factor (0.08 produces luxury fluid damping)
    currentProgress = lerp(currentProgress, targetProgress, 0.085);

    // If within epsilon, clamp to target
    if (Math.abs(currentProgress - targetProgress) < 0.0002) {
      currentProgress = targetProgress;
    }

    render(currentProgress);

    rafId = requestAnimationFrame(loop);
  }

  function onScroll() {
    updateTargetProgress();
  }

  // Clickable Timeline Navigation
  timelineDots.forEach((dot) => {
    dot.addEventListener("click", (e) => {
      const sceneIndex = parseInt(dot.getAttribute("data-scene"), 10) - 1;
      const sceneProgresses = [0.08, 0.26, 0.45, 0.63, 0.80, 0.95];
      const targetP = sceneProgresses[sceneIndex] ?? 0;

      const rect = container.getBoundingClientRect();
      const scrollableDistance = rect.height - window.innerHeight;
      const targetScrollY = window.scrollY + rect.top + targetP * scrollableDistance;

      window.scrollTo({
        top: targetScrollY,
        behavior: "smooth",
      });
    });
  });

  // Start Listener & RAF Loop
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", updateTargetProgress, { passive: true });

  updateTargetProgress();
  currentProgress = targetProgress;
  isRunning = true;
  rafId = requestAnimationFrame(loop);

  return {
    destroy() {
      isRunning = false;
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", updateTargetProgress);
    },
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
