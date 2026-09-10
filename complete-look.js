/**
 * ClothMatics — Shop to Complete the Look Frontend Controller
 * Connects wardrobe garments to Gemini AI Stylist & Shopping Engine
 */

import {
  COMPLETE_LOOK_BUDGETS,
  getAnchorCategories,
  getProfileGender,
  buildSmartShoppingQuery,
  getActiveBudgetRange,
  calculateMatchDetails
} from "./complete-look-helpers.js";

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
  let activeTab = "tops";
  let activeBudget = "1000_2000";
  let customMin = "";
  let customMax = "";
  let allowAboveBudget = false;
  let currentQuery = "";
  let isSearching = false;
  let searchResults = [];
  let stylingIntent = null;
  let isSampleResult = false;
  let sampleNotice = "";
  let hasSearched = false;
  let searchError = "";

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
    return profile;
  }

  function getWardrobe() {
    const state = getState ? getState() : {};
    return state.wardrobe || [];
  }

  function open(itemId) {
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

    const categories = getAnchorCategories(activeItem);
    activeTab = categories[0]?.id || "tops";
    activeBudget = "1000_2000";
    customMin = "";
    customMax = "";
    allowAboveBudget = false;
    hasSearched = false;
    isSearching = false;
    searchError = "";
    searchResults = [];
    stylingIntent = null;

    // Check if user has saved budget in profile
    const profile = getProfile();
    const savedBudgets = profile.shoppingProfile?.categoryBudgets;
    if (savedBudgets) {
      const catKey = activeTab;
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

    currentQuery = buildSmartShoppingQuery(activeItem, activeTab, profile);

    render();

    if (dialog && !dialog.open) {
      dialog.showModal();
    }
    // Note: We DO NOT auto-search on open so user can review/set their choices first!
  }

  async function executeSearch() {
    if (!activeItem) return;

    isSearching = true;
    searchError = "";
    render();

    const { min, max } = getActiveBudgetRange(activeBudget, customMin, customMax);

    if (min != null && max != null && min > max) {
      isSearching = false;
      searchError = "Minimum budget cannot be greater than maximum budget.";
      render();
      return;
    }

    const profile = getProfile();
    const defaultQuery = buildSmartShoppingQuery(activeItem, activeTab, profile);
    const customQuery = currentQuery && currentQuery.trim() !== defaultQuery ? currentQuery.trim() : "";

    try {
      const response = await fetch("/api/shopping/complete-look", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item: activeItem,
          profile,
          budget: { min, max },
          allowAboveBudget,
          targetCategory: activeTab,
          customQuery,
          gl: "in",
          hl: "en"
        })
      });

      const data = await response.json();

      if (data.ok) {
        searchResults = data.products || [];
        stylingIntent = data.intent || null;
        isSampleResult = Boolean(data.isSample);
        sampleNotice = data.notice || "";
        hasSearched = true;
        searchError = "";
      } else {
        searchError = data.error || "Unable to find matching products. Please try again.";
        searchResults = [];
        stylingIntent = null;
        hasSearched = true;
      }
    } catch (err) {
      searchError = "Failed to connect to styling search. Check your internet connection.";
      searchResults = [];
      stylingIntent = null;
      hasSearched = true;
    } finally {
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

    const hasProfileSizes = Boolean(
      profile.shoppingProfile?.sizes &&
      Object.values(profile.shoppingProfile.sizes).some((s) => s && Object.values(s).some(Boolean))
    );

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
            ${hasProfileSizes ? "<span>Sizes active</span>" : "<span>Universal sizing</span>"}
          </div>
        </div>
      </div>
    `;

    // 2. Category selection tabs
    const categoryTabsHtml = `
      <div class="complete-look-section-head">
        <div>
          <span class="complete-look-step">1 · SELECT PIECE TO SHOP</span>
          <h3 class="complete-look-section-title">Complete your look with</h3>
        </div>
      </div>
      <div class="complete-look-category-tabs" role="tablist">
        ${categories.map((cat) => `
          <button type="button" class="complete-look-tab ${cat.id === activeTab ? "active" : ""}" data-tab="${escapeHtml(cat.id)}" role="tab" aria-selected="${cat.id === activeTab}">
            <span>${cat.icon || "✨"}</span>
            <span>${escapeHtml(cat.label)}</span>
          </button>
        `).join("")}
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
            <input class="complete-look-search-input" id="complete-look-search-input" value="${escapeHtml(currentQuery)}" placeholder="Search outfit matches (e.g. white linen shirt)...">
          </div>
          <button class="button button-primary complete-look-search-submit" id="complete-look-search-btn" type="button">
            ${isSearching ? "Searching…" : "Search"}
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

    // 4. Sample banner
    const sampleBannerHtml = isSampleResult ? `
      <div class="complete-look-sample-banner">
        <div class="complete-look-sample-banner-icon">ℹ️</div>
        <div class="complete-look-sample-banner-text">
          <b>Sample Preview Mode</b>
          <p>${escapeHtml(sampleNotice || "Demonstrating curated style pairings. Add your SerpApi key in Cloudflare Pages environment variables for real-time live queries.")}</p>
        </div>
      </div>
    ` : "";

    // 5. Results or states
    let resultsBodyHtml = "";

    if (isSearching) {
      resultsBodyHtml = `
        <div class="complete-look-loading">
          <div class="spinner"></div>
          <p>Styling trending outfit matches with AI…</p>
          <span class="complete-look-loading-sub">Curating complementary silhouettes and colors for your look</span>
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
      const activeCatObj = categories.find((c) => c.id === activeTab) || categories[0];
      resultsBodyHtml = `
        <div class="complete-look-ready">
          <div class="complete-look-ready-icon">✨</div>
          <h3>Ready to Complete Your Outfit</h3>
          <p>We'll match trending <b>${escapeHtml(activeCatObj?.label || "pieces")}</b> that pair naturally with your ${escapeHtml(activeItem.title || "garment")}.</p>
          <button type="button" class="button button-primary complete-look-start-btn" id="complete-look-start-search-btn">
            ✨ Find Complete Outfit Matches
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
      const stylistBanner = stylingIntent?.stylingReason ? `
        <div class="complete-look-stylist-banner">
          <span class="complete-look-stylist-badge">✨ AI Stylist Recommendation</span>
          <p class="complete-look-stylist-reason">${escapeHtml(stylingIntent.stylingReason)}</p>
        </div>
      ` : "";

      resultsBodyHtml = `
        ${stylistBanner}
        <div class="complete-look-results-meta">
          <h3 class="complete-look-results-title">Curated Matches</h3>
          <span class="complete-look-results-count">${searchResults.length} pieces found</span>
        </div>
        <div class="complete-look-grid">
          ${searchResults.map((product, idx) => renderProductCard(product, idx, activeItem, stylingIntent)).join("")}
        </div>
      `;
    }

    // 6. Disclosure
    const disclosureHtml = `
      <div class="complete-look-disclosure">
        ClothMatics AI Styling Assistant: Products are curated to complement your wardrobe piece. Some links may be retailer links.
      </div>
    `;

    container.innerHTML = `
      ${heroHtml}
      ${categoryTabsHtml}
      ${filterBoxHtml}
      ${sampleBannerHtml}
      ${resultsBodyHtml}
      ${disclosureHtml}
    `;

    attachEvents();
  }

  function renderProductCard(product, index, anchorItem, intent) {
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
    const stylingReason = intent?.stylingReason || `Curated to pair with your ${anchorName} for a balanced, modern look.`;

    const buyLink = safeUrl(product.productLink) || "#";
    const retailerName = product.source || "Retailer";

    return `
      <article class="complete-look-card" data-product-id="${escapeHtml(product.id)}">
        <div class="complete-look-card-img-wrap">
          <span class="complete-look-badge-retailer">${escapeHtml(retailerName)}</span>
          <span class="complete-look-badge-match ${isBestMatch ? "complete-look-badge-best" : ""}">
            ${isBestMatch ? "★ Best Match" : `${matchPercent}% Match`}
          </span>
          <img src="${safeUrl(product.thumbnail) || "./assets/clothmatics-logo.png"}" alt="${escapeHtml(product.title)}" loading="lazy" onerror="this.src='./assets/clothmatics-logo.png'">
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
        const profile = getProfile();
        currentQuery = buildSmartShoppingQuery(activeItem, activeTab, profile);
        if (hasSearched) {
          executeSearch();
        } else {
          render();
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
