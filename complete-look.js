/**
 * ClothMatics — Shop to Complete the Look Frontend Controller
 * Connects wardrobe garments to Gemini AI Stylist & Shopping Engine
 * Delivers a complete coordinated multi-piece outfit (Tops, Shoes, Layers, Accessories)
 */

import {
  COMPLETE_LOOK_BUDGETS,
  getAnchorCategories,
  getProfileGender,
  buildSmartShoppingQuery,
  getActiveBudgetRange,
  calculateMatchDetails,
  resolveBuyLink,
  getCategoryFallbackImage,
  getUserProfileSizes,
  getUserProfilePreferences
} from "./complete-look-helpers.js?v=20260912-outfit-loader-v7";
import {
  outfitBuildLoaderMarkup,
  updateHangerLoader
} from "./garment-progress.mjs?v=20260912-outfit-loader-v7";

function safeUrl(value = "") {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
  } catch {
    return "";
  }
}

function escapeHtml(value = "") {
  const div = document.createElement("div");
  div.textContent = String(value ?? "");
  return div.innerHTML;
}

export function createCompleteLookController({ getState, onToast = () => {} }) {
  let activeItem = null;
  let activeTab = "all"; // "all" for complete outfit, or category id ("tops", "shoes", "layering", "accessories")
  let activeBudget = "1000_2000";
  let customMin = "";
  let customMax = "";
  let allowAboveBudget = false;
  let currentQuery = "";
  let isSearching = false;
  let searchResults = [];
  let outfitData = null;
  let stylingIntent = null;
  let isSampleResult = false;
  let sampleNotice = "";
  let hasSearched = false;
  let searchError = "";
  let searchStep = 1;

  const dialog = document.getElementById("complete-look-dialog");
  const container = document.getElementById("complete-look-content");
  const closeBtn = document.getElementById("close-complete-look");

  if (closeBtn && dialog) {
    closeBtn.addEventListener("click", () => dialog.close());
  }

  if (dialog) {
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
  }

  function getProfile() {
    const state = getState ? getState() : {};
    const profile = { ...(state.profile || {}) };
    if (!profile.gender) {
      const domGender = document.getElementById("profile-gender")?.value;
      if (domGender) profile.gender = domGender;
    }
    if (!profile.bodyTypeSelfReported) {
      const domBodyType = document.getElementById("profile-body-type")?.value;
      if (domBodyType) profile.bodyTypeSelfReported = domBodyType;
    }

    // Merge active sizes from DOM profile fields if not already populated
    profile.shoppingProfile = { ...(profile.shoppingProfile || {}) };
    profile.shoppingProfile.sizes = { ...(profile.shoppingProfile.sizes || profile.shoppingSizes || profile.sizes || {}) };

    const domTop = document.getElementById("size-top")?.value;
    const domBottom = document.getElementById("size-bottom")?.value;
    const domDress = document.getElementById("size-dress")?.value;
    const domShoes = document.getElementById("size-shoes")?.value;

    if (domTop && !profile.shoppingProfile.sizes.top?.alphaSize) {
      profile.shoppingProfile.sizes.top = { alphaSize: domTop };
    }
    if (domBottom && !profile.shoppingProfile.sizes.bottom?.alphaSize) {
      profile.shoppingProfile.sizes.bottom = { alphaSize: domBottom };
    }
    if (domDress && !profile.shoppingProfile.sizes.dress?.alphaSize) {
      profile.shoppingProfile.sizes.dress = { alphaSize: domDress };
    }
    if (domShoes && !profile.shoppingProfile.sizes.shoes?.uk && !profile.shoppingProfile.sizes.shoes?.india) {
      profile.shoppingProfile.sizes.shoes = { uk: Number(domShoes) || domShoes, india: Number(domShoes) || domShoes };
    }

    // Merge learned style profile if present
    if (state.profileStyle && !profile.profileStyle) {
      profile.profileStyle = state.profileStyle;
    }

    return profile;
  }

  function getWardrobe() {
    const state = getState ? getState() : {};
    return state.wardrobe || [];
  }

  function open(itemId, budgetOption = null) {
    const wardrobe = getWardrobe();
    activeItem = wardrobe.find((item) => item.id === itemId);

    if (!activeItem) {
      onToast("Garment not found in your wardrobe.", "error");
      return;
    }

    // Close garment detail modal if currently open
    const garmentDialog = document.getElementById("garment-dialog");
    if (garmentDialog && garmentDialog.open) {
      garmentDialog.close();
    }

    activeTab = "all";
    activeBudget = "1000_2000";
    customMin = "";
    customMax = "";
    allowAboveBudget = false;
    hasSearched = false;
    isSearching = false;
    searchError = "";
    searchResults = [];
    outfitData = null;
    stylingIntent = null;

    // Check if user has saved budget in profile
    const profile = getProfile();
    searchStep = 1;

    if (budgetOption) {
      if (typeof budgetOption === "string") {
        activeBudget = budgetOption;
      } else if (typeof budgetOption === "object") {
        const { min, max } = budgetOption;
        const standard = COMPLETE_LOOK_BUDGETS.find((b) => b.min === min && b.max === max);
        if (standard) {
          activeBudget = standard.key;
        } else {
          activeBudget = "custom";
          customMin = min != null ? String(min) : "";
          customMax = max != null ? String(max) : "";
        }
      }
    } else {
      // Check if user has saved budget in profile
      const profile = getProfile();
      const savedBudgets = profile.shoppingProfile?.categoryBudgets;
      if (savedBudgets) {
        const categories = getAnchorCategories(activeItem);
        const catKey = categories[0]?.id || "tops";
        if (savedBudgets[catKey]?.min != null || savedBudgets[catKey]?.max != null) {
          const min = savedBudgets[catKey].min;
          const max = savedBudgets[catKey].max;
          const standard = COMPLETE_LOOK_BUDGETS.find((b) => b.min === min && b.max === max);
          if (standard) {
            activeBudget = standard.key;
          } else {
            activeBudget = "custom";
            customMin = min != null ? String(min) : "";
            customMax = max != null ? String(max) : "";
          }
        }
      }
    }

    currentQuery = "";

    render();

    if (dialog && !dialog.open) {
      dialog.showModal();
    }
  }

  async function executeSearch() {
    if (!activeItem) return;

    isSearching = true;
    searchError = "";
    searchStep = 1;
    render();

    const searchTimer = setInterval(() => {
      if (!isSearching) {
        clearInterval(searchTimer);
        return;
      }
      searchStep = (searchStep % 4) + 1;
      const loader = container ? container.querySelector(".outfit-build-loader") : null;
      if (loader) {
        const stepMessages = [
          "Your first piece is in.",
          "Building your look with coordinated layers…",
          "Finding the perfect shoes and accessories…",
          "Polishing your complete styled outfit…"
        ];
        updateHangerLoader(loader, stepMessages[searchStep - 1], true, searchStep);
      }
    }, 1600);

    const { min, max } = getActiveBudgetRange(activeBudget, customMin, customMax);

    if (min != null && max != null && min > max) {
      clearInterval(searchTimer);
      isSearching = false;
      searchError = "Minimum budget cannot be greater than maximum budget.";
      render();
      return;
    }

    const profile = getProfile();
    const targetCategoryParam = activeTab === "all" ? "" : activeTab;
    const customQuery = currentQuery && currentQuery.trim() ? currentQuery.trim() : "";

    try {
      const response = await fetch("/api/shopping/complete-look", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item: activeItem,
          profile,
          budget: { min, max },
          allowAboveBudget,
          targetCategory: targetCategoryParam,
          customQuery,
          gl: "in",
          hl: "en"
        })
      });

      const data = await response.json();

      if (data.ok) {
        outfitData = data.outfit || null;
        searchResults = data.products || [];
        stylingIntent = data.intent || null;
        isSampleResult = Boolean(data.isSample);
        sampleNotice = data.notice || "";
        hasSearched = true;
        searchError = "";
      } else {
        searchError = data.error || "Unable to find matching products. Please try again.";
        searchResults = [];
        outfitData = null;
        stylingIntent = null;
        hasSearched = true;
      }
    } catch (err) {
      searchError = "Failed to connect to styling search. Check your internet connection.";
      searchResults = [];
      outfitData = null;
      stylingIntent = null;
      hasSearched = true;
    } finally {
      clearInterval(searchTimer);
      isSearching = false;
      render();
    }
  }

  function render() {
    if (!container || !activeItem) return;

    const profile = getProfile();
    const categories = getAnchorCategories(activeItem);
    const gender = getProfileGender(profile, activeItem);
    const genderLabel = gender === "women" ? "Women's Collection" : "Men's Collection";

    const userSizes = getUserProfileSizes(profile);
    const sizesSummary = [
      userSizes.top ? `Top: ${userSizes.top}` : "",
      userSizes.bottom ? `Bottom: ${userSizes.bottom}` : "",
      userSizes.shoes ? `Shoes: UK ${userSizes.shoes}` : "",
      userSizes.dress ? `Dress: ${userSizes.dress}` : ""
    ].filter(Boolean).join(" · ");
    const hasProfileSizes = Boolean(sizesSummary);

    const anchorMeta = [
      activeItem.primaryColor,
      activeItem.subCategory || activeItem.category,
      activeItem.fit
    ].filter(Boolean).join(" · ");

    // 1. Hero banner
    const heroHtml = `
      <div class="complete-look-hero">
        <div class="complete-look-hero-img-wrap">
          <img src="${safeUrl(activeItem.image) || "./assets/clothmatics-logo.png"}" alt="${escapeHtml(activeItem.title || "Garment")}">
        </div>
        <div class="complete-look-hero-info">
          <span class="complete-look-kicker">SHOP TO COMPLETE THE LOOK</span>
          <h2>Style with your ${escapeHtml(activeItem.title || "Garment")}</h2>
          <div class="complete-look-hero-meta">
            <span>${escapeHtml(anchorMeta || "Wardrobe Piece")}</span>
            <span class="complete-look-gender-tag">${escapeHtml(genderLabel)}</span>
            ${hasProfileSizes ? `<span class="complete-look-size-tag">📏 ${escapeHtml(sizesSummary)}</span>` : "<span>Universal sizing</span>"}
          </div>
        </div>
      </div>
    `;

    // 2. Category selection tabs
    const totalOutfitCount = searchResults.length;
    const categoryTabsHtml = `
      <div class="complete-look-section-head">
        <div>
          <span class="complete-look-step">1 · OUTFIT COORDINATES</span>
          <h3 class="complete-look-section-title">Select coordinated pieces</h3>
        </div>
      </div>
      <div class="complete-look-category-tabs" role="tablist">
        <button type="button" class="complete-look-tab ${activeTab === "all" ? "active" : ""}" data-tab="all" role="tab" aria-selected="${activeTab === "all"}">
          <span>🌟</span>
          <span>Complete Outfit ${hasSearched && totalOutfitCount ? `(${totalOutfitCount})` : ""}</span>
        </button>
        ${categories.map((cat) => {
          const catCount = outfitData?.categories?.find((c) => c.id === cat.id)?.products?.length ?? "";
          const countBadge = hasSearched && catCount ? `(${catCount})` : "";
          return `
            <button type="button" class="complete-look-tab ${cat.id === activeTab ? "active" : ""}" data-tab="${escapeHtml(cat.id)}" role="tab" aria-selected="${cat.id === activeTab}">
              <span>${cat.icon || "✨"}</span>
              <span>${escapeHtml(cat.label)} ${countBadge}</span>
            </button>
          `;
        }).join("")}
      </div>
    `;

    // 3. Search input & budget box
    const budgetChipsHtml = COMPLETE_LOOK_BUDGETS.map((b) => `
      <button type="button" class="complete-look-budget-chip ${b.key === activeBudget ? "active" : ""}" data-budget="${escapeHtml(b.key)}">
        ${escapeHtml(b.label)}
      </button>
    `).join("");

    const customRowHtml = activeBudget === "custom" ? `
      <div class="complete-look-custom-row">
        <div class="complete-look-custom-field">
          <label for="complete-look-custom-min">Minimum ₹</label>
          <input id="complete-look-custom-min" type="number" min="0" placeholder="0" value="${escapeHtml(customMin)}">
        </div>
        <div class="complete-look-custom-field">
          <label for="complete-look-custom-max">Maximum ₹</label>
          <input id="complete-look-custom-max" type="number" min="0" placeholder="3000" value="${escapeHtml(customMax)}">
        </div>
      </div>
    ` : "";

    const filterBoxHtml = `
      <div class="complete-look-filter-box">
        <div class="complete-look-search-row">
          <div class="complete-look-search-input-wrap">
            <span class="complete-look-search-icon">⌕</span>
            <input class="complete-look-search-input" id="complete-look-search-input" value="${escapeHtml(currentQuery)}" placeholder="Search specific style or item (e.g. navy knitted polo)...">
          </div>
          <button class="button button-primary complete-look-search-submit" id="complete-look-search-btn" type="button">
            ${isSearching ? "Styling…" : "Search"}
          </button>
        </div>

        <div>
          <span class="complete-look-step">2 · CONFIRM BUDGET</span>
          <div class="complete-look-budget-chips">
            ${budgetChipsHtml}
          </div>
          ${customRowHtml}
          <div class="complete-look-extra-row">
            <label>
              <input type="checkbox" id="complete-look-above-budget" ${allowAboveBudget ? "checked" : ""}>
              <span>Show slightly above budget</span>
            </label>
            <span class="complete-look-extra-help">Allows suitable products up to 15% above your limit</span>
          </div>
        </div>
      </div>
    `;

    // 4. Results or states
    let resultsBodyHtml = "";

    if (isSearching) {
      resultsBodyHtml = `
        <div class="complete-look-loading">
          ${outfitBuildLoaderMarkup({
            kicker: "CLOTHMATICS AI STYLIST",
            title: "Outfit Build",
            subtitle: "TURNING YOUR STYLE INTO SOMETHING GREAT…",
            initialStep: searchStep,
            hidden: false
          })}
        </div>
      `;
    } else if (searchError) {
      resultsBodyHtml = `
        <div class="complete-look-empty">
          <div class="complete-look-empty-icon">⚠️</div>
          <h3>Search problem</h3>
          <p>${escapeHtml(searchError)}</p>
          <div class="complete-look-empty-actions">
            <button type="button" class="button button-primary" id="complete-look-retry-btn">Try again</button>
          </div>
        </div>
      `;
    } else if (!hasSearched) {
      // User has opened modal, set choices, but not clicked search yet
      resultsBodyHtml = `
        <div class="complete-look-ready">
          <div class="complete-look-ready-icon">✨</div>
          <h3>Ready to Style Your Complete Outfit</h3>
          <p>Our AI Stylist will generate a complete, coordinated 4-piece look (Tops, Footwear, Layering, and Accessories) tailored to your ${escapeHtml(activeItem.title || "garment")}.</p>
          <button type="button" class="button button-primary complete-look-start-btn" id="complete-look-start-search-btn">
            ✨ Generate Complete Outfit
          </button>
        </div>
      `;
    } else if (searchResults.length === 0) {
      resultsBodyHtml = `
        <div class="complete-look-empty">
          <div class="complete-look-empty-icon">🔍</div>
          <h3>No products match this budget</h3>
          <p>We couldn’t find in-stock recommendations in this exact price range. Try selecting "Any budget" or another category tab above.</p>
          <div class="complete-look-empty-actions">
            <button type="button" class="button button-primary complete-look-empty-btn-any">Choose any budget</button>
          </div>
        </div>
      `;
    } else {
      // Display AI Stylist Vision Banner
      const outfitTitle = outfitData?.title || stylingIntent?.outfitTitle || "Curated Coordinated Outfit";
      const stylistAdvice = outfitData?.stylingAdvice || stylingIntent?.overallStylingAdvice || stylingIntent?.stylingReason || "";
      const styleArchetype = outfitData?.styleArchetype || stylingIntent?.styleArchetype || "";
      const colorHarmony = outfitData?.colorHarmony || stylingIntent?.colorHarmony || "";
      const silhouetteBalance = outfitData?.silhouetteBalance || stylingIntent?.silhouetteBalance || "";

      const tagsHtml = [
        styleArchetype ? `<span class="complete-look-stylist-tag">🎯 ${escapeHtml(styleArchetype)}</span>` : "",
        colorHarmony ? `<span class="complete-look-stylist-tag">🎨 ${escapeHtml(colorHarmony)}</span>` : "",
        silhouetteBalance ? `<span class="complete-look-stylist-tag">⚖️ ${escapeHtml(silhouetteBalance)}</span>` : "",
        sizesSummary ? `<span class="complete-look-stylist-tag complete-look-stylist-tag-size">📏 Profile Sizes: ${escapeHtml(sizesSummary)}</span>` : ""
      ].filter(Boolean).join("");

      const stylistBanner = `
        <div class="complete-look-stylist-banner">
          <div class="complete-look-stylist-head">
            <span class="complete-look-stylist-badge">✨ AI Stylist Vision</span>
          </div>
          <h3 class="complete-look-outfit-title">${escapeHtml(outfitTitle)}</h3>
          <p class="complete-look-stylist-reason">${escapeHtml(stylistAdvice)}</p>
          ${tagsHtml ? `<div class="complete-look-stylist-tags">${tagsHtml}</div>` : ""}
        </div>
      `;

      let sectionsHtml = "";

      if (outfitData && Array.isArray(outfitData.categories) && outfitData.categories.length > 0) {
        // Filter categories depending on activeTab
        const displayedCats = activeTab === "all"
          ? outfitData.categories.filter((c) => c.products && c.products.length > 0)
          : outfitData.categories.filter((c) => c.id === activeTab && c.products && c.products.length > 0);

        if (displayedCats.length > 0) {
          sectionsHtml = displayedCats.map((cat) => `
            <section class="complete-look-category-section" data-cat-id="${escapeHtml(cat.id)}">
              <div class="complete-look-category-header">
                <div class="complete-look-category-title-group">
                  <span class="complete-look-category-icon">${cat.icon || "✨"}</span>
                  <div>
                    <h4 class="complete-look-category-title">${escapeHtml(cat.label)}</h4>
                    <p class="complete-look-category-reason">${escapeHtml(cat.stylingReason || "")}</p>
                  </div>
                </div>
                <span class="complete-look-category-pill">${cat.products.length} Best Picks</span>
              </div>
              <div class="complete-look-grid">
                ${cat.products.map((product, idx) => renderProductCard(product, idx, activeItem, cat, gender)).join("")}
              </div>
            </section>
          `).join("");
        } else {
          // If active tab has 0 products
          sectionsHtml = `
            <div class="complete-look-empty">
              <div class="complete-look-empty-icon">🔍</div>
              <h3>No items in this category</h3>
              <p>Try switching back to "Complete Outfit" to see all curated pieces.</p>
            </div>
          `;
        }
      } else {
        // Fallback flat grid if outfitData categories were absent
        sectionsHtml = `
          <div class="complete-look-grid">
            ${searchResults.map((product, idx) => renderProductCard(product, idx, activeItem, null, gender)).join("")}
          </div>
        `;
      }

      resultsBodyHtml = `
        ${stylistBanner}
        <div class="complete-look-sections-wrap">
          ${sectionsHtml}
        </div>
      `;
    }

    // 5. Disclosure
    const disclosureHtml = `
      <div class="complete-look-disclosure">
        ClothMatics AI Styling Assistant: Products are curated to complement your wardrobe piece. Some links may be retailer links.
      </div>
    `;

    container.innerHTML = `
      ${heroHtml}
      ${categoryTabsHtml}
      ${filterBoxHtml}
      ${resultsBodyHtml}
      ${disclosureHtml}
    `;

    attachEvents();
  }

  function renderProductCard(product, index, anchorItem, categoryObj, gender = "men") {
    const { isBestMatch, matchPercent } = calculateMatchDetails(product, index);

    const ratingHtml = product.rating ? `
      <div class="complete-look-card-rating">
        <span>★ ${product.rating.toFixed(1)}</span>
        ${product.reviews ? `<small>(${product.reviews.toLocaleString("en-IN")} reviews)</small>` : ""}
      </div>
    ` : "";

    const priceHtml = `
      <div class="complete-look-card-price-row">
        <span class="complete-look-card-price">${escapeHtml(product.price)}</span>
        ${product.oldPrice ? `<span class="complete-look-card-old-price">${escapeHtml(product.oldPrice)}</span>` : ""}
        ${product.discountPercent > 0 ? `<span class="complete-look-card-discount">${product.discountPercent}% off</span>` : ""}
      </div>
    `;

    const deliveryHtml = product.delivery ? `
      <div class="complete-look-card-delivery">${escapeHtml(product.delivery)}</div>
    ` : "";

    const anchorName = [anchorItem.primaryColor, anchorItem.subCategory || anchorItem.category || "piece"].filter(Boolean).join(" ");
    const stylingReason = product.stylingReason || categoryObj?.stylingReason || `Curated to pair with your ${anchorName} for a balanced, modern look.`;

    const buyLink = safeUrl(resolveBuyLink(product)) || "#";
    const retailerName = product.source || "Retailer";
    const categoryKey = product.category || categoryObj?.id || "tops";
    const fallbackImage = getCategoryFallbackImage(categoryKey, gender);
    const rawThumb = String(product.thumbnail || product.image || "").trim();
    const imageSrc = (rawThumb && rawThumb.length > 15 && !rawThumb.includes("clothmatics-logo.png")) ? (safeUrl(rawThumb) || fallbackImage) : fallbackImage;

    const sizeBadgeHtml = product.userSizeMatch && product.extractedSize ? `
      <span class="complete-look-badge-sizetag match">Size ${escapeHtml(product.extractedSize)} · Your size</span>
    ` : product.extractedSize ? `
      <span class="complete-look-badge-sizetag">Size ${escapeHtml(product.extractedSize)}</span>
    ` : "";

    return `
      <article class="complete-look-card" data-product-id="${escapeHtml(product.id || product.product_id || "")}">
        <div class="complete-look-card-img-wrap">
          <span class="complete-look-badge-retailer">${escapeHtml(retailerName)}</span>
          ${sizeBadgeHtml}
          <span class="complete-look-badge-match ${isBestMatch ? "complete-look-badge-best" : ""}">
            ${isBestMatch ? "★ Best Match" : `${matchPercent}% Match`}
          </span>
          <img src="${imageSrc}" alt="${escapeHtml(product.title)}" loading="lazy" onerror="this.onerror=null;this.src='${fallbackImage}'">
        </div>
        <div class="complete-look-card-body">
          <h4 class="complete-look-card-title" title="${escapeHtml(product.title)}">${escapeHtml(product.title)}</h4>
          ${ratingHtml}
          ${priceHtml}
          ${deliveryHtml}
          <div class="complete-look-card-reason">${escapeHtml(stylingReason)}</div>
          <a href="${buyLink}" target="_blank" rel="noopener noreferrer" class="complete-look-buy-btn">
            Buy from ${escapeHtml(retailerName)} ↗
          </a>
        </div>
      </article>
    `;
  }

  function attachEvents() {
    if (!container) return;

    // Category tabs
    container.querySelectorAll(".complete-look-tab").forEach((tabBtn) => {
      tabBtn.addEventListener("click", () => {
        const tabId = tabBtn.dataset.tab;
        if (!tabId || tabId === activeTab) return;
        activeTab = tabId;

        if (hasSearched && outfitData) {
          // If we already have the full outfit loaded, filter client-side smoothly!
          render();
        } else {
          const profile = getProfile();
          currentQuery = tabId === "all" ? "" : buildSmartShoppingQuery(activeItem, tabId, profile);
          if (hasSearched) {
            executeSearch();
          } else {
            render();
          }
        }
      });
    });

    // Budget chips
    container.querySelectorAll(".complete-look-budget-chip").forEach((chipBtn) => {
      chipBtn.addEventListener("click", () => {
        const budgetKey = chipBtn.dataset.budget;
        if (!budgetKey) return;
        activeBudget = budgetKey;
        if (budgetKey === "custom") {
          render();
          const input = document.getElementById("complete-look-custom-min");
          if (input) input.focus();
        } else if (hasSearched) {
          executeSearch();
        } else {
          render();
        }
      });
    });

    // Custom budget inputs
    const minInput = document.getElementById("complete-look-custom-min");
    const maxInput = document.getElementById("complete-look-custom-max");
    if (minInput) {
      minInput.addEventListener("input", (e) => {
        customMin = e.target.value.replace(/\D/g, "");
      });
      minInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") executeSearch();
      });
    }
    if (maxInput) {
      maxInput.addEventListener("input", (e) => {
        customMax = e.target.value.replace(/\D/g, "");
      });
      maxInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") executeSearch();
      });
    }

    // Above budget checkbox
    const aboveCheck = document.getElementById("complete-look-above-budget");
    if (aboveCheck) {
      aboveCheck.addEventListener("change", (e) => {
        allowAboveBudget = e.target.checked;
        if (hasSearched) {
          executeSearch();
        }
      });
    }

    // Search input and button
    const searchInput = document.getElementById("complete-look-search-input");
    const searchBtn = document.getElementById("complete-look-search-btn");
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        currentQuery = e.target.value;
      });
      searchInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          currentQuery = searchInput.value.trim();
          executeSearch();
        }
      });
    }
    if (searchBtn) {
      searchBtn.addEventListener("click", () => {
        if (searchInput) {
          currentQuery = searchInput.value.trim();
        }
        executeSearch();
      });
    }

    // Primary action button in the initial ready state
    const startSearchBtn = document.getElementById("complete-look-start-search-btn");
    if (startSearchBtn) {
      startSearchBtn.addEventListener("click", () => {
        executeSearch();
      });
    }

    // Retry button
    const retryBtn = document.getElementById("complete-look-retry-btn");
    if (retryBtn) {
      retryBtn.addEventListener("click", () => executeSearch());
    }

    // "Any budget" button in empty state
    const anyBtn = container.querySelector(".complete-look-empty-btn-any");
    if (anyBtn) {
      anyBtn.addEventListener("click", () => {
        activeBudget = "any";
        executeSearch();
      });
    }
  }

  return {
    open
  };
}
